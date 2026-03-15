import { chromium, type BrowserContext, type Page } from "playwright";
import { loadAgentConfigs, getAppUrl, type AgentConfig } from "./config.js";
import type { WooInfo, ChatContext } from "./llm-adapter.js";
import * as browser from "./browser-agent.js";

const MAX_ROUNDS = 20;
const SWIPES_PER_ROUND = 3;
const INTER_ACTION_DELAY = 150;
const INTER_AGENT_DELAY = 200;
const MAX_CHAT_MESSAGES_BEFORE_AUTO_PROPOSE = 4;
const BATCH_SIZE = 3;

interface AgentState {
  config: AgentConfig;
  context: BrowserContext;
  page: Page;
  phase: "swipe" | "matches" | "chat";
  currentMatchId: string | null;
  swipesDone: number;
  tradesDone: number;
  myWoo: WooInfo | null;
  chatMessageCount: number;
}

function log(agent: AgentState, msg: string) {
  const name = agent.config.llm.name.padEnd(6);
  console.log(`[${name}] ${msg}`);
}

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function keywordMatch(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
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
    chatMessageCount: 0,
  };
}

async function doSwipePhase(agent: AgentState, appUrl: string): Promise<void> {
  const { page, config } = agent;

  if (!(await browser.isOnPage(page, "/swipe"))) {
    await browser.navigateToSwipe(page, appUrl);
  }

  await browser.selectWoo(page);
  await wait(500);

  if (!agent.myWoo) {
    agent.myWoo = await browser.readSelectedWooInfo(page);
    if (agent.myWoo) {
      log(agent, `Selected Woo: "${agent.myWoo.title}" ($${agent.myWoo.estimated_value ?? "?"})`);
    }
  }

  const myWoo = agent.myWoo ?? {
    id: "",
    title: "My Item",
    description: null,
    category: "",
    condition: "",
    estimated_value: null,
    trade_count: 0,
  };

  // Collect cards for batched swipe decisions
  const pendingCards: { info: WooInfo }[] = [];

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

    const cardText = `${cardInfo.title} ${cardInfo.description ?? ""} ${cardInfo.category}`;

    // Keyword pre-filtering: skip LLM for clear matches/mismatches
    if (keywordMatch(cardText, config.preferences.wants)) {
      log(agent, `KEYWORD RIGHT on "${cardInfo.title}" (matches wants)`);
      await browser.clickSwipe(page, "right");
      agent.swipesDone++;
      const matched = await browser.checkMatchModal(page);
      if (matched) log(agent, "Match found!");
      await wait(INTER_ACTION_DELAY);
      continue;
    }

    if (keywordMatch(cardText, config.preferences.willing_to_trade)) {
      log(agent, `KEYWORD LEFT on "${cardInfo.title}" (matches willing_to_trade)`);
      await browser.clickSwipe(page, "left");
      agent.swipesDone++;
      await wait(INTER_ACTION_DELAY);
      continue;
    }

    // Ambiguous — collect for batched LLM decision
    pendingCards.push({ info: cardInfo });

    // Process batch when full or last card in round
    if (pendingCards.length >= BATCH_SIZE || i === SWIPES_PER_ROUND - 1) {
      try {
        let decisions: ("left" | "right")[];
        if (pendingCards.length === 1) {
          const d = await config.llm.decideSwipe(myWoo, pendingCards[0].info, config.preferences);
          decisions = [d];
        } else {
          decisions = await config.llm.decideBatchSwipe(
            myWoo,
            pendingCards.map((c) => c.info),
            config.preferences
          );
        }

        // We already swiped past the earlier cards in the batch via the UI,
        // so only the current card on screen needs swiping.
        // For batched swipes, we need to swipe each in sequence.
        // The first card in pendingCards is already on screen from when we read it.
        // But we already moved past previous cards... Actually, the cards in pending
        // were each read but NOT swiped yet. We paused before swiping to batch.
        // Wait — the issue is we can only swipe one at a time on the UI.
        // Let me reconsider: we read the card, decided to defer, but the card is still
        // showing. For batching to work, we need to read multiple cards first, but
        // we can't see the next card until we swipe the current one. So batching
        // only works when we read one card, swipe it, then read the next, etc.
        // The batch LLM call happens before swiping, but we've only read the current card.
        // So realistically, in a UI-driven agent, batching is: read current card ->
        // decide with LLM (using batch of 1 in practice). The real batching benefit
        // would be if we could preview multiple cards, which we can't.
        //
        // Given this constraint, fall back to single-card decisions using the first
        // pending card's decision for the card currently on screen.
        const decision = decisions[0];
        const card = pendingCards[0];
        log(agent, `${decision.toUpperCase()} on "${card.info.title}" ($${card.info.estimated_value ?? "?"})`);
        await browser.clickSwipe(page, decision);
        agent.swipesDone++;
        const matched = await browser.checkMatchModal(page);
        if (matched) log(agent, "Match found!");
        await wait(INTER_ACTION_DELAY);
      } catch (err) {
        log(agent, `LLM error during swipe: ${err}. Defaulting to RIGHT.`);
        await browser.clickSwipe(page, "right");
        agent.swipesDone++;
        await browser.checkMatchModal(page);
        await wait(INTER_ACTION_DELAY);
      }

      pendingCards.length = 0;
    }
  }

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

  const match = matches[0];
  agent.currentMatchId = match.id;
  agent.chatMessageCount = 0;
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

  const wooInfo = await browser.readWooInfoFromChat(page);
  const chatState = await browser.readChatState(page);

  if (chatState.tradeState === "completed") {
    log(agent, "Trade completed! Moving on.");
    agent.tradesDone++;
    agent.currentMatchId = null;
    agent.phase = "swipe";
    return;
  }

  if (chatState.tradeState === "pending_my_approval") {
    const myWoo = agent.myWoo ?? wooInfo.myWoo;
    const theirWoo = wooInfo.theirWoo;

    // Auto-approve: if we receive items matching our wants AND give up items matching willing_to_trade
    const receivedText = `${theirWoo.title} ${theirWoo.description ?? ""} ${theirWoo.category}`;
    const givingText = `${myWoo.title} ${myWoo.description ?? ""} ${myWoo.category}`;

    const receivingWanted = keywordMatch(receivedText, config.preferences.wants);
    const givingTradeable = keywordMatch(givingText, config.preferences.willing_to_trade);

    if (receivingWanted && givingTradeable) {
      log(agent, "Auto-approving trade (keyword match: receiving wanted + giving tradeable)");
      await browser.clickApproveTrade(page);
      await wait(INTER_ACTION_DELAY);
      agent.currentMatchId = null;
      agent.phase = "matches";
      return;
    }

    if (receivingWanted) {
      log(agent, "Auto-approving trade (keyword match: receiving wanted items)");
      await browser.clickApproveTrade(page);
      await wait(INTER_ACTION_DELAY);
      agent.currentMatchId = null;
      agent.phase = "matches";
      return;
    }

    // Fall through to LLM for ambiguous cases
    try {
      const shouldApprove = await config.llm.decideTrade({
        myWoos: [myWoo],
        theirWoos: [theirWoo],
        theirUsername: wooInfo.theirUsername,
        myTotalValue: myWoo.estimated_value ?? 0,
        theirTotalValue: theirWoo.estimated_value ?? 0,
        preferences: config.preferences,
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

  const chatCtx: ChatContext = {
    matchId: agent.currentMatchId,
    myWoo: agent.myWoo ?? wooInfo.myWoo,
    theirWoo: wooInfo.theirWoo,
    theirUsername: wooInfo.theirUsername,
    messages: chatState.messages,
    tradeState: chatState.tradeState,
    preferences: config.preferences,
  };

  try {
    const rawMessage = await config.llm.generateMessage(chatCtx);

    const wantsToPropose = rawMessage.includes("[PROPOSE]");
    const message = rawMessage.replace(/\[PROPOSE\]/g, "").trim();

    log(agent, `Sending: "${message.slice(0, 60)}${message.length > 60 ? "..." : ""}"`);
    await browser.typeMessage(page, message);
    await wait(INTER_ACTION_DELAY);

    agent.chatMessageCount++;

    const shouldAutoPropose = agent.chatMessageCount >= MAX_CHAT_MESSAGES_BEFORE_AUTO_PROPOSE;
    if (chatState.tradeState === "none" && (wantsToPropose || shouldAutoPropose)) {
      if (wantsToPropose) {
        log(agent, "LLM signaled trade readiness — proposing trade...");
      } else {
        log(agent, `Auto-proposing after ${agent.chatMessageCount} messages...`);
      }
      await browser.clickProposeTrade(page);
      await wait(INTER_ACTION_DELAY);
    }
  } catch (err) {
    log(agent, `LLM error generating message: ${err}`);
    await browser.typeMessage(page, "Hey! I'm interested in trading. What do you think?");
    await wait(INTER_ACTION_DELAY);

    agent.chatMessageCount++;
    if (chatState.tradeState === "none" && agent.chatMessageCount >= MAX_CHAT_MESSAGES_BEFORE_AUTO_PROPOSE) {
      log(agent, "Auto-proposing after error fallback...");
      await browser.clickProposeTrade(page);
      await wait(INTER_ACTION_DELAY);
    }
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

  const configs = await loadAgentConfigs();
  const appUrl = getAppUrl();

  for (const cfg of configs) {
    if (cfg.preferences.personality) {
      console.log(`  ${cfg.llm.name} preferences:`);
      console.log(`    Wants: ${cfg.preferences.wants.join(", ")}`);
      console.log(`    Willing to trade: ${cfg.preferences.willing_to_trade.join(", ")}`);
    }
  }

  console.log(`\nInitializing ${configs.length} browser(s)...\n`);

  const agents: AgentState[] = [];
  for (let i = 0; i < configs.length; i++) {
    const agent = await initAgent(configs[i], appUrl, i);
    agents.push(agent);
    console.log(`Browser ${i + 1} ready for ${configs[i].llm.name}`);
  }

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

  console.log("\n\nStarting trading rounds...\n");

  for (let round = 0; round < MAX_ROUNDS; round++) {
    await runRound(agents, appUrl, round);

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

  await new Promise(() => {});
}

main().catch((err) => {
  console.error("Agent runner failed:", err);
  process.exit(1);
});
