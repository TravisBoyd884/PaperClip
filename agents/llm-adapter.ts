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

export interface ChatContext {
  matchId: string;
  myWoo: WooInfo;
  theirWoo: WooInfo;
  theirUsername: string;
  messages: { sender: string; content: string; isMe: boolean }[];
  tradeState: "none" | "pending_my_approval" | "pending_their_approval" | "completed";
}

export interface TradeContext {
  myWoos: WooInfo[];
  theirWoos: WooInfo[];
  theirUsername: string;
  myTotalValue: number;
  theirTotalValue: number;
}

export interface AgentLLM {
  name: string;
  decideSwipe(myWoo: WooInfo, targetWoo: WooInfo): Promise<"left" | "right">;
  generateMessage(ctx: ChatContext): Promise<string>;
  decideTrade(ctx: TradeContext): Promise<boolean>;
}

export function buildSwipePrompt(myWoo: WooInfo, targetWoo: WooInfo): string {
  return [
    "You are a trading agent on PaperClip. Decide whether to swipe RIGHT (interested in trading) or LEFT (pass).",
    "",
    `Your item: "${myWoo.title}" — ${myWoo.category}, ${myWoo.condition}, $${myWoo.estimated_value ?? "?"}`,
    `Their item: "${targetWoo.title}" — ${targetWoo.category}, ${targetWoo.condition}, $${targetWoo.estimated_value ?? "?"}`,
    targetWoo.description ? `Description: ${targetWoo.description}` : "",
    "",
    "Respond with ONLY the word RIGHT or LEFT.",
  ].join("\n");
}

export function buildChatPrompt(ctx: ChatContext): string {
  const history = ctx.messages
    .slice(-6)
    .map((m) => `${m.isMe ? "You" : ctx.theirUsername}: ${m.content}`)
    .join("\n");

  return [
    "You are a trading agent on PaperClip, chatting with another trader about a potential swap.",
    "",
    `Your item: "${ctx.myWoo.title}" ($${ctx.myWoo.estimated_value ?? "?"})`,
    `Their item: "${ctx.theirWoo.title}" ($${ctx.theirWoo.estimated_value ?? "?"})`,
    "",
    history ? `Recent messages:\n${history}` : "No messages yet — you're starting the conversation.",
    "",
    "Write a short, friendly message (1-2 sentences). Be enthusiastic but natural.",
    "Do NOT include any prefix like 'You:' — just the message text.",
  ].join("\n");
}

export function buildTradePrompt(ctx: TradeContext): string {
  const myItems = ctx.myWoos.map((w) => `  - "${w.title}" ($${w.estimated_value ?? "?"})`).join("\n");
  const theirItems = ctx.theirWoos.map((w) => `  - "${w.title}" ($${w.estimated_value ?? "?"})`).join("\n");

  return [
    "You are a trading agent on PaperClip. Decide whether to APPROVE or DECLINE this trade.",
    "",
    `You give up (total ~$${ctx.myTotalValue}):`,
    myItems,
    "",
    `You receive (total ~$${ctx.theirTotalValue}):`,
    theirItems,
    "",
    "Approve if you're trading up in value or getting something interesting. Decline if it's a bad deal.",
    "Respond with ONLY the word APPROVE or DECLINE.",
  ].join("\n");
}
