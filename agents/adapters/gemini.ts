import { GoogleGenerativeAI } from "@google/generative-ai";
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

export class GeminiAdapter implements AgentLLM {
  name = "Gemini";
  private client: GoogleGenerativeAI;
  private generationModel: string;
  private classificationModel: string;

  constructor(
    apiKey: string,
    generationModel = "gemini-2.5-flash",
    classificationModel = "gemini-2.0-flash-lite"
  ) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.generationModel = generationModel;
    this.classificationModel = classificationModel;
  }

  private async ask(
    system: string,
    user: string,
    useClassification = false
  ): Promise<string> {
    const modelName = useClassification ? this.classificationModel : this.generationModel;
    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: system,
    });
    const result = await model.generateContent(user);
    return result.response.text().trim();
  }

  async decideSwipe(myWoo: WooInfo, targetWoo: WooInfo, preferences: AgentPreferences): Promise<"left" | "right"> {
    const { system, user } = buildSwipeMessages(myWoo, targetWoo, preferences);
    const answer = await this.ask(system, user, true);
    return answer.toUpperCase().includes("RIGHT") ? "right" : "left";
  }

  async decideBatchSwipe(myWoo: WooInfo, targets: WooInfo[], preferences: AgentPreferences): Promise<("left" | "right")[]> {
    const { system, user } = buildBatchedSwipeMessages(myWoo, targets, preferences);
    const answer = await this.ask(system, user, true);
    return parseBatchSwipeResponse(answer, targets.length);
  }

  async generateMessage(ctx: ChatContext): Promise<string> {
    const { system, user } = buildChatMessages(ctx);
    return this.ask(system, user);
  }

  async decideTrade(ctx: TradeContext): Promise<boolean> {
    const { system, user } = buildTradeMessages(ctx);
    const answer = await this.ask(system, user, true);
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
