import { execSync } from "child_process";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { loadAgentConfigs, getAppUrl, type AgentConfig } from "./config.js";
import type { WooInfo, ChatContext } from "./llm-adapter.js";
import * as browser from "./browser-agent.js";

function getScreenSize(): { width: number; height: number } {
  try {
    if (process.platform === "win32") {
      // Use WorkingArea which returns logical pixels (DPI-aware) and excludes the taskbar
      const out = execSync(
        'powershell -c "Add-Type -AssemblyName System.Windows.Forms; $s = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea; \\"$($s.Width),$($s.Height)\\""',
        { encoding: "utf-8" }
      );
      const parts = out.trim().split(",");
      const w = parseInt(parts[0], 10);
      const h = parseInt(parts[1], 10);
      if (w > 0 && h > 0) return { width: w, height: h };
    } else if (process.platform === "darwin") {
      const out = execSync(
        "system_profiler SPDisplaysDataType | grep Resolution",
        { encoding: "utf-8" }
      );
      const match = out.match(/(\d{3,5})\s*x\s*(\d{3,5})/);
      if (match) return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
    } else {
      const out = execSync("xdpyinfo | grep dimensions", { encoding: "utf-8" });
      const match = out.match(/(\d{3,5})x(\d{3,5})/);
      if (match) return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
    }
  } catch {}
  return { width: 1920, height: 1080 };
}

const MAX_ROUNDS = 20;
const SWIPES_PER_ROUND = 3;
const INTER_ACTION_DELAY = 150;
const MAX_CHAT_MESSAGES_BEFORE_AUTO_PROPOSE = 4;
const BATCH_SIZE = 3;

const SIMILARITY_RIGHT_THRESHOLD = 0.75;
const SIMILARITY_LEFT_THRESHOLD = 0.3;

interface AgentState {
  config: AgentConfig;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  index: number;
  screen: { width: number; height: number };
  phase: "swipe" | "matches" | "chat";
  currentMatchId: string | null;
  swipesDone: number;
  tradesDone: number;
  myWoo: WooInfo | null;
  chatMessageCount: number;
}

function log(agent: AgentState, msg: string) {
  const name = agent.config.llm.name.padEnd(6);
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  console.log(`[${ts}] [${name}] ${msg}`);
}

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function keywordMatch(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function computeSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

async function fetchCardEmbedding(cardInfo: WooInfo): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const parts = [cardInfo.title];
  if (cardInfo.description) parts.push(cardInfo.description);
  if (cardInfo.category) parts.push(`Category: ${cardInfo.category}`);
  if (cardInfo.condition) parts.push(`Condition: ${cardInfo.condition}`);
  const text = parts.join(". ");

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
        dimensions: 1536,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

async function launchBrowser(
  index: number,
  screen: { width: number; height: number }
): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const halfW = Math.floor(screen.width / 2);
  const halfH = Math.floor(screen.height / 2);

  const browserInstance = await chromium.launch({
    headless: false,
    args: [
      `--window-position=${(index % 2) * halfW},${Math.floor(index / 2) * halfH}`,
      `--window-size=${halfW},${halfH}`,
    ],
  });

  const context = await browserInstance.newContext({
    viewport: { width: halfW, height: halfH - 80 },
  });
  const page = await context.newPage();

  return { browser: browserInstance, context, page };
}

async function initAgent(
  config: AgentConfig,
  appUrl: string,
  index: number,
  screen: { width: number; height: number }
): Promise<AgentState> {
  const { browser: browserInstance, context, page } = await launchBrowser(index, screen);

  return {
    config,
    browser: browserInstance,
    context,
    page,
    index,
    screen,
    phase: "swipe",
    currentMatchId: null,
    swipesDone: 0,
    tradesDone: 0,
    myWoo: null,
    chatMessageCount: 0,
  };
}

async function isPageAlive(page: Page): Promise<boolean> {
  try {
    page.url();
    await page.evaluate(() => true);
    return true;
  } catch {
    return false;
  }
}

async function recoverAgent(agent: AgentState, appUrl: string): Promise<boolean> {
  log(agent, "Browser closed — recovering...");
  try {
    await agent.context.close().catch(() => {});
    await agent.browser.close().catch(() => {});
  } catch {}

  try {
    const { browser: newBrowser, context, page } = await launchBrowser(agent.index, agent.screen);
    agent.browser = newBrowser;
    agent.context = context;
    agent.page = page;
    agent.myWoo = null;

    await browser.login(page, appUrl, agent.config.email, agent.config.password);
    log(agent, "Recovered — logged back in");
    return true;
  } catch (err) {
    log(agent, `Recovery failed: ${err}`);
    return false;
  }
}

async function doSwipePhase(agent: AgentState, appUrl: string): Promise<void> {
  const { page, config } = agent;
  const prefEmbedding = config.preferenceEmbedding;

  if (!(await browser.isOnPage(page, "/swipe"))) {
    await browser.navigateToSwipe(page, appUrl);
  }

  await browser.selectWoo(page);
  await browser.waitForFeedLoad(page);

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

    // --- Embedding similarity pre-filtering (preferred over keywords) ---
    if (prefEmbedding) {
      const cardEmbedding = await fetchCardEmbedding(cardInfo);
      if (cardEmbedding) {
        const similarity = computeSimilarity(prefEmbedding, cardEmbedding);

        if (similarity >= SIMILARITY_RIGHT_THRESHOLD) {
          log(agent, `EMBED RIGHT on "${cardInfo.title}" (similarity=${similarity.toFixed(3)})`);
          await browser.clickSwipe(page, "right");
          agent.swipesDone++;
          const matched = await browser.checkMatchModal(page);
          if (matched) log(agent, "Match found!");
          await wait(INTER_ACTION_DELAY);
          continue;
        }

        if (similarity <= SIMILARITY_LEFT_THRESHOLD) {
          log(agent, `EMBED LEFT on "${cardInfo.title}" (similarity=${similarity.toFixed(3)})`);
          await browser.clickSwipe(page, "left");
          agent.swipesDone++;
          await wait(INTER_ACTION_DELAY);
          continue;
        }

        log(agent, `EMBED AMBIGUOUS on "${cardInfo.title}" (similarity=${similarity.toFixed(3)}) → LLM`);
      }
    }

    // --- Keyword fallback when embeddings unavailable ---
    if (!prefEmbedding) {
      const cardText = `${cardInfo.title} ${cardInfo.description ?? ""} ${cardInfo.category}`;

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
    }

    // Ambiguous — collect for batched LLM decision
    pendingCards.push({ info: cardInfo });

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
  if (agent.currentMatchId !== match.id) {
    agent.chatMessageCount = 0;
  }
  agent.currentMatchId = match.id;
  agent.phase = "chat";

  await browser.openMatch(page, appUrl, match.id);
}

async function doChatPhase(agent: AgentState, appUrl: string): Promise<void> {
  const { page, config } = agent;
  const prefEmbedding = config.preferenceEmbedding;

  if (!agent.currentMatchId) {
    agent.phase = "swipe";
    return;
  }

  if (!(await browser.isOnPage(page, `/matches/${agent.currentMatchId}`))) {
    await browser.openMatch(page, appUrl, agent.currentMatchId);
  }

  await wait(500);
  const wooInfo = await browser.readWooInfoFromChat(page);
  const chatState = await browser.readChatState(page);

  log(agent, `Chat state: trade=${chatState.tradeState}, messages=${chatState.messages.length}, mySent=${agent.chatMessageCount}`);

  if (chatState.tradeState === "completed") {
    log(agent, "Trade completed! Moving on.");
    agent.tradesDone++;
    agent.currentMatchId = null;
    agent.chatMessageCount = 0;
    agent.phase = "swipe";
    return;
  }

  if (chatState.tradeState === "pending_my_approval") {
    const myWoo = agent.myWoo ?? wooInfo.myWoo;
    const theirWoo = wooInfo.theirWoo;

    if (prefEmbedding) {
      const theirEmbedding = await fetchCardEmbedding(theirWoo);
      if (theirEmbedding) {
        const similarity = computeSimilarity(prefEmbedding, theirEmbedding);
        if (similarity >= SIMILARITY_RIGHT_THRESHOLD) {
          log(agent, `Auto-approving trade (embedding similarity=${similarity.toFixed(3)})`);
          await browser.clickApproveTrade(page);
          agent.currentMatchId = null;
          agent.chatMessageCount = 0;
          agent.phase = "matches";
          return;
        }
      }
    }

    const receivedText = `${theirWoo.title} ${theirWoo.description ?? ""} ${theirWoo.category}`;
    const givingText = `${myWoo.title} ${myWoo.description ?? ""} ${myWoo.category}`;

    const receivingWanted = keywordMatch(receivedText, config.preferences.wants);
    const givingTradeable = keywordMatch(givingText, config.preferences.willing_to_trade);

    if (receivingWanted || givingTradeable) {
      log(agent, `Auto-approving trade (keyword match: ${receivingWanted ? "receiving wanted" : ""}${receivingWanted && givingTradeable ? " + " : ""}${givingTradeable ? "giving tradeable" : ""})`);
      await browser.clickApproveTrade(page);
      agent.currentMatchId = null;
      agent.chatMessageCount = 0;
      agent.phase = "matches";
      return;
    }

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
        log(agent, "LLM approved trade!");
        await browser.clickApproveTrade(page);
        agent.currentMatchId = null;
        agent.chatMessageCount = 0;
        agent.phase = "matches";
      } else {
        log(agent, "LLM declined trade — sending message");
        await browser.typeMessage(page, "Hmm, I'm not sure about this trade. Let me think about it.");
      }
    } catch (err) {
      log(agent, `LLM error during trade decision: ${err}. Auto-approving.`);
      await browser.clickApproveTrade(page);
      agent.currentMatchId = null;
      agent.chatMessageCount = 0;
      agent.phase = "matches";
    }
    return;
  }

  if (chatState.tradeState === "pending_their_approval") {
    log(agent, "Waiting for counterparty to approve trade...");
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

    log(agent, `Sending: "${message.slice(0, 80)}${message.length > 80 ? "..." : ""}"`);
    await browser.typeMessage(page, message);
    await wait(INTER_ACTION_DELAY);

    agent.chatMessageCount++;

    const shouldAutoPropose = agent.chatMessageCount >= MAX_CHAT_MESSAGES_BEFORE_AUTO_PROPOSE;
    if (wantsToPropose || shouldAutoPropose) {
      if (wantsToPropose) {
        log(agent, "LLM signaled trade readiness — proposing trade...");
      } else {
        log(agent, `Auto-proposing after ${agent.chatMessageCount} messages...`);
      }
      await browser.clickProposeTrade(page);
    }
  } catch (err) {
    log(agent, `LLM error generating message: ${err}`);
    await browser.typeMessage(page, "Hey! I'm interested in trading. What do you think?");
    await wait(INTER_ACTION_DELAY);

    agent.chatMessageCount++;
    if (agent.chatMessageCount >= MAX_CHAT_MESSAGES_BEFORE_AUTO_PROPOSE) {
      log(agent, "Auto-proposing after error fallback...");
      await browser.clickProposeTrade(page);
    }
  }
}

async function runRound(agents: AgentState[], appUrl: string, round: number) {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`ROUND ${round + 1}`);
  console.log(`${"=".repeat(50)}\n`);

  const results = await Promise.allSettled(
    agents.map(async (agent) => {
      if (!(await isPageAlive(agent.page))) {
        const recovered = await recoverAgent(agent, appUrl);
        if (!recovered) throw new Error("Browser recovery failed");
        agent.phase = "swipe";
      }

      log(agent, `Phase: ${agent.phase}${agent.currentMatchId ? ` (match: ${agent.currentMatchId.slice(0, 8)}…)` : ""}`);
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
    })
  );

  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "rejected") {
      log(agents[i], `Error in ${agents[i].phase} phase: ${(results[i] as PromiseRejectedResult).reason}`);
      agents[i].currentMatchId = null;
      agents[i].chatMessageCount = 0;
      agents[i].phase = "swipe";
    }
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
      console.log(`    Embedding: ${cfg.preferenceEmbedding ? "loaded" : "none (keyword fallback)"}`);
    }
  }

  const screen = getScreenSize();
  console.log(`\nScreen: ${screen.width}x${screen.height} — each browser: ${Math.floor(screen.width / 2)}x${Math.floor(screen.height / 2)}`);
  console.log(`Initializing ${configs.length} browser(s) in parallel...\n`);

  const agents = await Promise.all(
    configs.map((cfg, i) => initAgent(cfg, appUrl, i, screen))
  );
  for (let i = 0; i < agents.length; i++) {
    console.log(`Browser ${i + 1} ready for ${configs[i].llm.name}`);
  }

  console.log("\nLogging in all agents in parallel...\n");
  const loginResults = await Promise.allSettled(
    agents.map(async (agent) => {
      log(agent, `Logging in as ${agent.config.email}...`);
      await browser.login(agent.page, appUrl, agent.config.email, agent.config.password);
      log(agent, "Logged in successfully");
    })
  );
  for (let i = 0; i < loginResults.length; i++) {
    if (loginResults[i].status === "rejected") {
      log(agents[i], `Login failed: ${(loginResults[i] as PromiseRejectedResult).reason}`);
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
