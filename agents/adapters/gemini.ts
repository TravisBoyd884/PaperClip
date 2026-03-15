import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  type AgentLLM,
  type WooInfo,
  type ChatContext,
  type TradeContext,
  buildSwipePrompt,
  buildChatPrompt,
  buildTradePrompt,
} from "../llm-adapter.js";

export class GeminiAdapter implements AgentLLM {
  name = "Gemini";
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model = "gemini-2.5-flash") {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  private async ask(prompt: string): Promise<string> {
    const model = this.client.getGenerativeModel({ model: this.model });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  }

  async decideSwipe(myWoo: WooInfo, targetWoo: WooInfo): Promise<"left" | "right"> {
    const answer = await this.ask(buildSwipePrompt(myWoo, targetWoo));
    return answer.toUpperCase().includes("RIGHT") ? "right" : "left";
  }

  async generateMessage(ctx: ChatContext): Promise<string> {
    return this.ask(buildChatPrompt(ctx));
  }

  async decideTrade(ctx: TradeContext): Promise<boolean> {
    const answer = await this.ask(buildTradePrompt(ctx));
    return answer.toUpperCase().includes("APPROVE");
  }
}
