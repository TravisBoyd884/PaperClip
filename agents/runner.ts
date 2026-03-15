import { chromium, type BrowserContext, type Page } from "playwright";
import { loadAgentConfigs, getAppUrl, type AgentConfig } from "./config.js";
import type { AgentLLM, WooInfo, ChatContext } from "./llm-adapter.js";
import * as browser from "./browser-agent.js";

const MAX_ROUNDS = 20;
const SWIPES_PER_ROUND = 3;
const INTER_ACTION_DELAY = 1500;
const INTER_AGENT_DELAY = 2000;

interface AgentState {
  config: AgentConfig;
  context: BrowserContext;
  page: Page;
  phase: "swipe" | "matches" | "chat";
  currentMatchId: string | null;
  swipesDone: number;
  tradesDone: number;
  myWoo: WooInfo | null;
}

function log(agent: AgentState, msg: string) {
  const name = agent.config.llm.name.padEnd(6);
  console.log(`[${name}] ${msg}`);
}

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function initAgent(
  config: AgentConfig,
  appUrl: string,
  index: number
): Promise<AgentState> {
  const browserInstance = await chromium.launch({
    headless: false,
    args: [
      `--window-position=${(index % 2) * 800},${Math.floor(index / 2) * 500}`,
      "--window-size=780,480",
    ],
  });

  const context = await browserInstance.newContext({
    viewport: { width: 780, height: 480 },
  });
  const page = await context.newPage();

  return {
    config,
    context,
    page,
    phase: "swipe",
    currentMatchId: null,
    swipesDone: 0,
    tradesDone: 0,
    myWoo: null,
  };
}

async function doSwipePhase(agent: AgentState, appUrl: string): Promise<void> {
  const { page, config } = agent;

  if (!(await browser.isOnPage(page, "/swipe"))) {
    await browser.navigateToSwipe(page, appUrl);
  }

  // Select a Woo if not already selected
  await browser.selectWoo(page);
  await wait(500);

  for (let i = 0; i < SWIPES_PER_ROUND; i++) {
    if (!(await browser.hasSwipeCards(page))) {
      log(agent, "No more cards to swipe — moving to matches");
      agent.phase = "matches";
      return;
    }

    const cardInfo = await browser.readCurrentCard(page);
    if (!cardInfo) {
      log(agent, "Could not read card — skipping");
      await browser.clickSwipe(page, "right");
      await wait(INTER_ACTION_DELAY);
      continue;
    }

    // Build a simple WooInfo for the agent's own item (from card context)
    if (!agent.myWoo) {
      agent.myWoo = {
        id: "",
        title: "My Item",
        description: null,
        category: "",
        condition: "",
        estimated_value: null,
        trade_count: 0,
      };
    }

    try {
      const decision = await config.llm.decideSwipe(agent.myWoo, cardInfo);
      log(agent, `${decision.toUpperCase()} on "${cardInfo.title}" ($${cardInfo.estimated_value ?? "?"})`);
      await browser.clickSwipe(page, decision);
    } catch (err) {
      log(agent, `LLM error during swipe: ${err}. Defaulting to RIGHT.`);
      await browser.clickSwipe(page, "right");
    }

    agent.swipesDone++;

    // Check for match modal
    const matched = await browser.checkMatchModal(page);
    if (matched) {
      log(agent, "Match found!");
    }

    await wait(INTER_ACTION_DELAY);
  }

  // After swiping, transition to matches
  agent.phase = "matches";
}

async function doMatchesPhase(agent: AgentState, appUrl: string): Promise<void> {
  const { page } = agent;

  await browser.navigateToMatches(page, appUrl);
  await wait(500);

  const matches = await browser.readMatchList(page);
  if (matches.length === 0) {
    log(agent, "No matches yet — back to swiping");
    agent.phase = "swipe";
    return;
  }

  log(agent, `Found ${matches.length} match(es)`);

  // Open the first match to chat
  const match = matches[0];
  agent.currentMatchId = match.id;
  agent.phase = "chat";

  await browser.openMatch(page, appUrl, match.id);
}

async function doChatPhase(agent: AgentState, appUrl: string): Promise<void> {
  const { page, config } = agent;

  if (!agent.currentMatchId) {
    agent.phase = "swipe";
    return;
  }

  if (!(await browser.isOnPage(page, `/matches/${agent.currentMatchId}`))) {
    await browser.openMatch(page, appUrl, agent.currentMatchId);
  }

  const chatState = await browser.readChatState(page);

  if (chatState.tradeState === "completed") {
    log(agent, "Trade completed! Moving on.");
    agent.tradesDone++;
    agent.currentMatchId = null;
    agent.phase = "swipe";
    return;
  }

  if (chatState.tradeState === "pending_my_approval") {
    // Decide whether to approve
    const myWoo = agent.myWoo ?? { id: "", title: "My Item", description: null, category: "", condition: "", estimated_value: null, trade_count: 0 };
    const theirWoo: WooInfo = { id: "", title: "Their Item", description: null, category: "", condition: "", estimated_value: null, trade_count: 0 };

    try {
      const shouldApprove = await config.llm.decideTrade({
        myWoos: [myWoo],
        theirWoos: [theirWoo],
        theirUsername: "Counterparty",
        myTotalValue: myWoo.estimated_value ?? 0,
        theirTotalValue: theirWoo.estimated_value ?? 0,
      });

      if (shouldApprove) {
        log(agent, "Approving trade!");
        await browser.clickApproveTrade(page);
        await wait(INTER_ACTION_DELAY);
      } else {
        log(agent, "Declining trade — sending message instead");
        await browser.typeMessage(page, "Hmm, I'm not sure about this trade. Let me think about it.");
      }
    } catch (err) {
      log(agent, `LLM error during trade decision: ${err}. Auto-approving.`);
      await browser.clickApproveTrade(page);
    }

    agent.currentMatchId = null;
    agent.phase = "matches";
    return;
  }

  // No pending trade — send a message and/or propose
  const chatCtx: ChatContext = {
    matchId: agent.currentMatchId,
    myWoo: agent.myWoo ?? { id: "", title: "My Item", description: null, category: "", condition: "", estimated_value: null, trade_count: 0 },
    theirWoo: { id: "", title: "Their Item", description: null, category: "", condition: "", estimated_value: null, trade_count: 0 },
    theirUsername: "Counterparty",
    messages: chatState.messages,
    tradeState: chatState.tradeState,
  };

  try {
    const message = await config.llm.generateMessage(chatCtx);
    log(agent, `Sending: "${message.slice(0, 60)}${message.length > 60 ? "..." : ""}"`);
    await browser.typeMessage(page, message);
    await wait(INTER_ACTION_DELAY);
  } catch (err) {
    log(agent, `LLM error generating message: ${err}`);
    await browser.typeMessage(page, "Hey! I'm interested in trading. What do you think?");
    await wait(INTER_ACTION_DELAY);
  }

  // Propose trade if none pending
  if (chatState.tradeState === "none") {
    log(agent, "Proposing trade...");
    await browser.clickProposeTrade(page);
    await wait(INTER_ACTION_DELAY);
  }

  agent.currentMatchId = null;
  agent.phase = "matches";
}

async function runRound(agents: AgentState[], appUrl: string, round: number) {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`ROUND ${round + 1}`);
  console.log(`${"=".repeat(50)}\n`);

  for (const agent of agents) {
    console.log(`\n--- ${agent.config.llm.name}'s turn (phase: ${agent.phase}) ---`);

    try {
      switch (agent.phase) {
        case "swipe":
          await doSwipePhase(agent, appUrl);
          break;
        case "matches":
          await doMatchesPhase(agent, appUrl);
          break;
        case "chat":
          await doChatPhase(agent, appUrl);
          break;
      }
    } catch (err) {
      log(agent, `Error in ${agent.phase} phase: ${err}`);
      agent.phase = "swipe";
    }

    await wait(INTER_AGENT_DELAY);
  }
}

async function main() {
  console.log("PaperClip Agent Runner");
  console.log("======================\n");

  const configs = loadAgentConfigs();
  const appUrl = getAppUrl();

  console.log(`\nInitializing ${configs.length} browser(s)...\n`);

  const agents: AgentState[] = [];
  for (let i = 0; i < configs.length; i++) {
    const agent = await initAgent(configs[i], appUrl, i);
    agents.push(agent);
    console.log(`Browser ${i + 1} ready for ${configs[i].llm.name}`);
  }

  // Login all agents
  console.log("\nLogging in all agents...\n");
  for (const agent of agents) {
    try {
      log(agent, `Logging in as ${agent.config.email}...`);
      await browser.login(agent.page, appUrl, agent.config.email, agent.config.password);
      log(agent, "Logged in successfully");
    } catch (err) {
      log(agent, `Login failed: ${err}`);
    }
  }

  // Run trading rounds
  console.log("\n\nStarting trading rounds...\n");

  for (let round = 0; round < MAX_ROUNDS; round++) {
    await runRound(agents, appUrl, round);

    // Summary
    console.log("\n--- Round Summary ---");
    for (const agent of agents) {
      log(agent, `Swipes: ${agent.swipesDone}, Trades: ${agent.tradesDone}`);
    }

    const totalTrades = agents.reduce((sum, a) => sum + a.tradesDone, 0);
    if (totalTrades > 0) {
      console.log(`\nTotal trades completed: ${totalTrades}`);
    }
  }

  console.log("\n\nDemo complete! Browsers will stay open for inspection.");
  console.log("Press Ctrl+C to exit.\n");

  // Keep browsers open
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("Agent runner failed:", err);
  process.exit(1);
});
