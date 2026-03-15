export interface WooInfo {
  id: string;
  title: string;
  description: string | null;
  category: string;
  condition: string;
  estimated_value: number | null;
  trade_count: number;
  owner_username?: string | null;
}

export interface AgentPreferences {
  wants: string[];
  willing_to_trade: string[];
  personality: string;
}

export interface ChatContext {
  matchId: string;
  myWoo: WooInfo;
  theirWoo: WooInfo;
  theirUsername: string;
  messages: { sender: string; content: string; isMe: boolean }[];
  tradeState: "none" | "pending_my_approval" | "pending_their_approval" | "completed";
  preferences: AgentPreferences;
}

export interface TradeContext {
  myWoos: WooInfo[];
  theirWoos: WooInfo[];
  theirUsername: string;
  myTotalValue: number;
  theirTotalValue: number;
  preferences: AgentPreferences;
}

export interface PromptMessages {
  system: string;
  user: string;
}

export interface AgentLLM {
  name: string;
  decideSwipe(myWoo: WooInfo, targetWoo: WooInfo, preferences: AgentPreferences): Promise<"left" | "right">;
  decideBatchSwipe(myWoo: WooInfo, targets: WooInfo[], preferences: AgentPreferences): Promise<("left" | "right")[]>;
  generateMessage(ctx: ChatContext): Promise<string>;
  decideTrade(ctx: TradeContext): Promise<boolean>;
}

// Compact preference format for swipe/trade (~15 tokens instead of ~80)
function compactPreferences(prefs: AgentPreferences): string {
  const parts: string[] = [];
  if (prefs.wants.length > 0) parts.push(`Wants: ${prefs.wants.join(", ")}.`);
  if (prefs.willing_to_trade.length > 0) parts.push(`Trading away: ${prefs.willing_to_trade.join(", ")}.`);
  return parts.join(" ");
}

// Full preferences including personality for chat messages
function fullPreferences(prefs: AgentPreferences): string {
  const lines = [
    "YOUR TRADING PREFERENCES:",
    `  Wants: ${prefs.wants.join(", ")}`,
    `  Willing to trade away: ${prefs.willing_to_trade.join(", ")}`,
  ];
  if (prefs.personality) {
    lines.push(`  Personality: ${prefs.personality}`);
  }
  return lines.join("\n");
}

// --- Split prompt builders returning { system, user } ---

export function buildSwipeMessages(myWoo: WooInfo, targetWoo: WooInfo, preferences: AgentPreferences): PromptMessages {
  const system = [
    "You are a trading agent on PaperClip. You decide whether to swipe RIGHT (interested) or LEFT (pass) on items.",
    "",
    compactPreferences(preferences),
    "",
    "Swipe RIGHT if their item matches something you WANT.",
    "Swipe LEFT if their item doesn't interest you.",
    "Respond with ONLY the word RIGHT or LEFT.",
  ].join("\n");

  const user = [
    `Your item: "${myWoo.title}" — ${myWoo.category}, ${myWoo.condition}, $${myWoo.estimated_value ?? "?"}`,
    `Their item: "${targetWoo.title}" — ${targetWoo.category}, ${targetWoo.condition}, $${targetWoo.estimated_value ?? "?"}`,
  ].join("\n");

  return { system, user };
}

export function buildBatchedSwipeMessages(myWoo: WooInfo, targets: WooInfo[], preferences: AgentPreferences): PromptMessages {
  const system = [
    "You are a trading agent on PaperClip. For each card below, decide RIGHT (interested) or LEFT (pass).",
    "",
    compactPreferences(preferences),
    "",
    "RIGHT if their item matches something you WANT. LEFT otherwise.",
    "Respond with one word per line: RIGHT or LEFT. One line per card, in order.",
  ].join("\n");

  const lines = [`Your item: "${myWoo.title}" — ${myWoo.category}, ${myWoo.condition}, $${myWoo.estimated_value ?? "?"}\n`];
  targets.forEach((t, i) => {
    lines.push(`Card ${i + 1}: "${t.title}" — ${t.category}, ${t.condition}, $${t.estimated_value ?? "?"}`);
  });

  return { system, user: lines.join("\n") };
}

export function buildChatMessages(ctx: ChatContext): PromptMessages {
  const system = [
    "You are a trading agent on PaperClip, chatting with another trader about a potential swap.",
    "",
    fullPreferences(ctx.preferences),
    "",
    "Write short, friendly messages (1-2 sentences). Be enthusiastic but natural.",
    "Talk about WHY you want their item or why you're happy to trade yours based on your preferences.",
    "Do NOT include any prefix like 'You:' — just the message text.",
    "",
    "IMPORTANT: If the conversation suggests both parties are ready to trade, end your message with [PROPOSE] on a new line.",
    "Only add [PROPOSE] when you believe a trade is mutually agreeable. If still negotiating, do NOT add it.",
  ].join("\n");

  const history = ctx.messages
    .slice(-6)
    .map((m) => `${m.isMe ? "You" : ctx.theirUsername}: ${m.content}`)
    .join("\n");

  const user = [
    `Your item: "${ctx.myWoo.title}" ($${ctx.myWoo.estimated_value ?? "?"})`,
    `Their item: "${ctx.theirWoo.title}" ($${ctx.theirWoo.estimated_value ?? "?"})`,
    "",
    history ? `Recent messages:\n${history}` : "No messages yet — you're starting the conversation.",
  ].join("\n");

  return { system, user };
}

export function buildTradeMessages(ctx: TradeContext): PromptMessages {
  const system = [
    "You are a trading agent on PaperClip. Decide whether to APPROVE or DECLINE a trade.",
    "",
    compactPreferences(ctx.preferences),
    "",
    "APPROVE if receiving items you WANT, even if dollar values aren't equal.",
    "DECLINE only if getting something you don't value at all.",
    "Respond with ONLY the word APPROVE or DECLINE.",
  ].join("\n");

  const myItems = ctx.myWoos.map((w) => `  - "${w.title}" ($${w.estimated_value ?? "?"})`).join("\n");
  const theirItems = ctx.theirWoos.map((w) => `  - "${w.title}" ($${w.estimated_value ?? "?"})`).join("\n");

  const user = [
    `You give up (total ~$${ctx.myTotalValue}):`,
    myItems,
    "",
    `You receive (total ~$${ctx.theirTotalValue}):`,
    theirItems,
  ].join("\n");

  return { system, user };
}

// --- Legacy single-string builders (kept for backward compat but unused by adapters) ---

export function buildSwipePrompt(myWoo: WooInfo, targetWoo: WooInfo, preferences: AgentPreferences): string {
  const msgs = buildSwipeMessages(myWoo, targetWoo, preferences);
  return `${msgs.system}\n\n${msgs.user}`;
}

export function buildChatPrompt(ctx: ChatContext): string {
  const msgs = buildChatMessages(ctx);
  return `${msgs.system}\n\n${msgs.user}`;
}

export function buildTradePrompt(ctx: TradeContext): string {
  const msgs = buildTradeMessages(ctx);
  return `${msgs.system}\n\n${msgs.user}`;
}
