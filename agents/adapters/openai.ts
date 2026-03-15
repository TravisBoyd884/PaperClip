import OpenAI from "openai";
import {
  type AgentLLM,
  type WooInfo,
  type ChatContext,
  type TradeContext,
  buildSwipePrompt,
  buildChatPrompt,
  buildTradePrompt,
} from "../llm-adapter.js";

export class OpenAIAdapter implements AgentLLM {
  name = "GPT";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  private async ask(prompt: string, maxTokens = 100): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });

    return response.choices[0]?.message?.content?.trim() ?? "";
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
