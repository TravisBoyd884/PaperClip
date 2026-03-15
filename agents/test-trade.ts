/**
 * Smoke test: run 2 agents (Claude + GPT) through swipe → match → chat → propose → approve.
 * Exits with code 0 on success, 1 on failure.
 *
 * Usage: npx tsx agents/test-trade.ts
 * Requires: dev server running on NEXT_PUBLIC_APP_URL (default http://localhost:3000)
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
loadEnv({ path: resolve(process.cwd(), ".agents.env") });
loadEnv({ path: resolve(process.cwd(), ".env") });

import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { loadAgentConfigs, getAppUrl, type AgentConfig } from "./config.js";
import * as browser from "./browser-agent.js";
import type { WooInfo, ChatContext } from "./llm-adapter.js";

const MAX_ROUNDS = 30;
const SWIPES_PER_ROUND = 50;

function log(name: string, msg: string) {
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  console.log(`[${ts}] [${name.padEnd(6)}] ${msg}`);
}

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface TestAgent {
  name: string;
  config: AgentConfig;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  phase: "swipe" | "matches" | "chat";
  currentMatchId: string | null;
  chatMessageCount: number;
  tradeCompleted: boolean;
  myWoo: WooInfo | null;
}

async function createTestAgent(config: AgentConfig, appUrl: string, index: number): Promise<TestAgent> {
  const b = await chromium.launch({
    headless: false,
    args: [
      `--window-position=${index * 700},0`,
      `--window-size=700,900`,
    ],
  });
  const ctx = await b.newContext({ viewport: { width: 700, height: 820 } });
  const page = await ctx.newPage();

  const name = config.llm.name;
  log(name, `Logging in as ${config.email}...`);
  await browser.login(page, appUrl, config.email, config.password);
  log(name, "Logged in");

  return {
    name,
    config,
    browser: b,
    context: ctx,
    page,
    phase: "swipe",
    currentMatchId: null,
    chatMessageCount: 0,
    tradeCompleted: false,
    myWoo: null,
  };
}

async function runSwipe(agent: TestAgent, appUrl: string): Promise<void> {
  const { page, config, name } = agent;

  if (!(await browser.isOnPage(page, "/swipe"))) {
    await browser.navigateToSwipe(page, appUrl);
  }

  await browser.selectWoo(page);
  await browser.waitForFeedLoad(page);

  if (!agent.myWoo) {
    agent.myWoo = await browser.readSelectedWooInfo(page);
    if (agent.myWoo) log(name, `Selected Woo: "${agent.myWoo.title}"`);
  }

  for (let i = 0; i < SWIPES_PER_ROUND; i++) {
    if (!(await browser.hasSwipeCards(page))) {
      log(name, "No more cards — moving to matches");
      agent.phase = "matches";
      return;
    }

    const cardInfo = await browser.readCurrentCard(page);
    if (!cardInfo) {
      await browser.clickSwipe(page, "right");
      await wait(200);
      continue;
    }

    const cardText = `${cardInfo.title} ${cardInfo.description ?? ""} ${cardInfo.category}`;
    const wants = config.preferences.wants;

    const isWanted = wants.some((kw) => cardText.toLowerCase().includes(kw.toLowerCase()));
    const direction = isWanted ? "right" : "right"; // swipe right on everything to guarantee matches
    log(name, `${direction.toUpperCase()} on "${cardInfo.title}"${isWanted ? " (WANTED)" : ""}`);

    await browser.clickSwipe(page, direction);
    const matched = await browser.checkMatchModal(page);
    if (matched) log(name, "*** MATCH! ***");
    await wait(200);
  }

  agent.phase = "matches";
}

async function runMatches(agent: TestAgent, appUrl: string): Promise<void> {
  const { page, name } = agent;

  await browser.navigateToMatches(page, appUrl);
  await wait(500);

  const matches = await browser.readMatchList(page);
  if (matches.length === 0) {
    log(name, "No matches — back to swiping");
    agent.phase = "swipe";
    return;
  }

  log(name, `Found ${matches.length} match(es)`);
  const match = matches[0];
  if (agent.currentMatchId !== match.id) {
    agent.chatMessageCount = 0;
  }
  agent.currentMatchId = match.id;
  agent.phase = "chat";

  await browser.openMatch(page, appUrl, match.id);
}

async function runChat(agent: TestAgent, appUrl: string): Promise<void> {
  const { page, config, name } = agent;

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

  log(name, `Chat: trade=${chatState.tradeState}, msgs=${chatState.messages.length}, sent=${agent.chatMessageCount}`);

  if (chatState.tradeState === "completed") {
    log(name, "TRADE COMPLETED!");
    agent.tradeCompleted = true;
    return;
  }

  if (chatState.tradeState === "pending_my_approval") {
    log(name, "Approving trade...");
    await browser.clickApproveTrade(page);
    await wait(1000);

    const afterState = await browser.readChatState(page);
    if (afterState.tradeState === "completed") {
      log(name, "TRADE COMPLETED after approval!");
      agent.tradeCompleted = true;
    } else {
      agent.currentMatchId = null;
      agent.phase = "matches";
    }
    return;
  }

  if (chatState.tradeState === "pending_their_approval") {
    log(name, "Waiting for counterparty approval...");
    return;
  }

  // Send a message
  const chatCtx: ChatContext = {
    matchId: agent.currentMatchId,
    myWoo: agent.myWoo ?? wooInfo.myWoo,
    theirWoo: wooInfo.theirWoo,
    theirUsername: wooInfo.theirUsername,
    messages: chatState.messages,
    tradeState: chatState.tradeState,
    preferences: config.preferences,
  };

  let message: string;
  let wantsToPropose = false;
  try {
    const raw = await config.llm.generateMessage(chatCtx);
    wantsToPropose = raw.includes("[PROPOSE]");
    message = raw.replace(/\[PROPOSE\]/g, "").trim();
  } catch (err) {
    log(name, `LLM error: ${err}`);
    message = "Hey! I'm interested in trading. What do you think?";
  }

  log(name, `Sending: "${message.slice(0, 80)}${message.length > 80 ? "..." : ""}"`);
  await browser.typeMessage(page, message);
  await wait(300);
  agent.chatMessageCount++;

  if (wantsToPropose || agent.chatMessageCount >= 2) {
    log(name, `Proposing trade (sent=${agent.chatMessageCount}, llmPropose=${wantsToPropose})...`);
    await browser.clickProposeTrade(page);
  }
}

async function resetTradeData() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey);

  console.log("Resetting swipes, matches, trades...");

  // Order matters due to foreign key constraints
  await supabase.from("messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("trade_woos").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("trades").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("matches").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("swipes").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // Reset Woos that were traded (status changed from 'active') back to active
  await supabase.from("woos").update({ status: "active" }).neq("status", "active");

  console.log("Reset complete.\n");
}

async function main() {
  console.log("\n=== PaperClip Agent Trade Test ===\n");

  await resetTradeData();

  const configs = await loadAgentConfigs();
  const appUrl = getAppUrl();

  // Use only first 2 agents (Claude + GPT)
  const testConfigs = configs.slice(0, 2);
  if (testConfigs.length < 2) {
    console.error("Need at least 2 agent configs. Check your API keys.");
    process.exit(1);
  }

  console.log(`Using agents: ${testConfigs.map((c) => c.llm.name).join(", ")}`);
  console.log(`App URL: ${appUrl}\n`);

  const agents = await Promise.all(
    testConfigs.map((cfg, i) => createTestAgent(cfg, appUrl, i))
  );

  for (let round = 0; round < MAX_ROUNDS; round++) {
    console.log(`\n--- Round ${round + 1}/${MAX_ROUNDS} ---`);

    await Promise.allSettled(
      agents.map(async (agent) => {
        try {
          switch (agent.phase) {
            case "swipe":
              await runSwipe(agent, appUrl);
              break;
            case "matches":
              await runMatches(agent, appUrl);
              break;
            case "chat":
              await runChat(agent, appUrl);
              break;
          }
        } catch (err) {
          log(agent.name, `Error: ${err}`);
          agent.phase = "swipe";
          agent.currentMatchId = null;
          agent.chatMessageCount = 0;
        }
      })
    );

    const anyCompleted = agents.some((a) => a.tradeCompleted);
    if (anyCompleted) {
      console.log("\n========================================");
      console.log("  TEST PASSED: Trade completed!");
      console.log("========================================\n");

      await wait(3000);
      for (const a of agents) {
        await a.context.close().catch(() => {});
        await a.browser.close().catch(() => {});
      }
      process.exit(0);
    }
  }

  console.log("\n========================================");
  console.log(`  TEST FAILED: No trade after ${MAX_ROUNDS} rounds`);
  console.log("========================================\n");

  for (const a of agents) {
    log(a.name, `Final state: phase=${a.phase}, matchId=${a.currentMatchId?.slice(0, 8) ?? "none"}, msgs=${a.chatMessageCount}`);
  }

  for (const a of agents) {
    await a.context.close().catch(() => {});
    await a.browser.close().catch(() => {});
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
