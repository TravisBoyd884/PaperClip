import OpenAI from "openai";
import {
  type AgentLLM,
  type AgentPreferences,
  type WooInfo,
  type ChatContext,
  type TradeContext,
  buildSwipeMessages,
  buildBatchedSwipeMessages,
  buildChatMessages,
  buildTradeMessages,
} from "../llm-adapter.js";

export class GroqAdapter implements AgentLLM {
  name = "Llama";
  private client: OpenAI;
  private generationModel: string;
  private classificationModel: string;

  constructor(
    apiKey: string,
    generationModel = "llama-3.3-70b-versatile",
    classificationModel = "llama-3.1-8b-instant"
  ) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
    this.generationModel = generationModel;
    this.classificationModel = classificationModel;
  }

  private async ask(
    system: string,
    user: string,
    maxTokens: number,
    useClassification = false
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: useClassification ? this.classificationModel : this.generationModel,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    return response.choices[0]?.message?.content?.trim() ?? "";
  }

  async decideSwipe(myWoo: WooInfo, targetWoo: WooInfo, preferences: AgentPreferences): Promise<"left" | "right"> {
    const { system, user } = buildSwipeMessages(myWoo, targetWoo, preferences);
    const answer = await this.ask(system, user, 10, true);
    return answer.toUpperCase().includes("RIGHT") ? "right" : "left";
  }

  async decideBatchSwipe(myWoo: WooInfo, targets: WooInfo[], preferences: AgentPreferences): Promise<("left" | "right")[]> {
    const { system, user } = buildBatchedSwipeMessages(myWoo, targets, preferences);
    const answer = await this.ask(system, user, 10 * targets.length, true);
    return parseBatchSwipeResponse(answer, targets.length);
  }

  async generateMessage(ctx: ChatContext): Promise<string> {
    const { system, user } = buildChatMessages(ctx);
    return this.ask(system, user, 100);
  }

  async decideTrade(ctx: TradeContext): Promise<boolean> {
    const { system, user } = buildTradeMessages(ctx);
    const answer = await this.ask(system, user, 10, true);
    return answer.toUpperCase().includes("APPROVE");
  }
}

function parseBatchSwipeResponse(answer: string, count: number): ("left" | "right")[] {
  const lines = answer.split("\n").map((l) => l.trim()).filter(Boolean);
  const results: ("left" | "right")[] = [];
  for (let i = 0; i < count; i++) {
    const line = lines[i] ?? "";
    results.push(line.toUpperCase().includes("RIGHT") ? "right" : "left");
  }
  return results;
}
