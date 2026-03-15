import Anthropic from "@anthropic-ai/sdk";
import {
  type AgentLLM,
  type WooInfo,
  type ChatContext,
  type TradeContext,
  buildSwipePrompt,
  buildChatPrompt,
  buildTradePrompt,
} from "../llm-adapter.js";

export class ClaudeAdapter implements AgentLLM {
  name = "Claude";
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = "claude-sonnet-4-20250514") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  private async ask(prompt: string, maxTokens = 100): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content[0];
    return block.type === "text" ? block.text.trim() : "";
  }

  async decideSwipe(myWoo: WooInfo, targetWoo: WooInfo): Promise<"left" | "right"> {
    const answer = await this.ask(buildSwipePrompt(myWoo, targetWoo), 10);
    return answer.toUpperCase().includes("RIGHT") ? "right" : "left";
  }

  async generateMessage(ctx: ChatContext): Promise<string> {
    return this.ask(buildChatPrompt(ctx), 150);
  }

  async decideTrade(ctx: TradeContext): Promise<boolean> {
    const answer = await this.ask(buildTradePrompt(ctx), 10);
    return answer.toUpperCase().includes("APPROVE");
  }
}
