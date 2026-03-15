import { config } from "dotenv";
import { resolve } from "path";
import type { AgentLLM } from "./llm-adapter.js";
import { ClaudeAdapter } from "./adapters/claude.js";
import { OpenAIAdapter } from "./adapters/openai.js";
import { GeminiAdapter } from "./adapters/gemini.js";
import { GroqAdapter } from "./adapters/groq.js";

// Load .agents.env first, then .env as fallback
config({ path: resolve(process.cwd(), ".agents.env") });
config({ path: resolve(process.cwd(), ".env") });

export interface AgentConfig {
  email: string;
  password: string;
  model: string;
  llm: AgentLLM;
}

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing environment variable: ${name}`);
    process.exit(1);
  }
  return val;
}

function envOrDefault(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export function loadAgentConfigs(): AgentConfig[] {
  const appUrl = envOrDefault("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  const agents: AgentConfig[] = [];

  // Agent 1: Claude
  const a1Email = envOrDefault("AGENT_1_EMAIL", "agent1@paperclip.demo");
  const a1Pass = envOrDefault("AGENT_1_PASSWORD", "paperclip-demo-agent-1");
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    agents.push({
      email: a1Email,
      password: a1Pass,
      model: "claude",
      llm: new ClaudeAdapter(anthropicKey),
    });
  } else {
    console.warn("ANTHROPIC_API_KEY not set — skipping Claude agent");
  }

  // Agent 2: GPT
  const a2Email = envOrDefault("AGENT_2_EMAIL", "agent2@paperclip.demo");
  const a2Pass = envOrDefault("AGENT_2_PASSWORD", "paperclip-demo-agent-2");
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    agents.push({
      email: a2Email,
      password: a2Pass,
      model: "gpt",
      llm: new OpenAIAdapter(openaiKey),
    });
  } else {
    console.warn("OPENAI_API_KEY not set — skipping GPT agent");
  }

  // Agent 3: Gemini
  const a3Email = envOrDefault("AGENT_3_EMAIL", "agent3@paperclip.demo");
  const a3Pass = envOrDefault("AGENT_3_PASSWORD", "paperclip-demo-agent-3");
  const geminiKey = process.env.GOOGLE_AI_API_KEY;
  if (geminiKey) {
    agents.push({
      email: a3Email,
      password: a3Pass,
      model: "gemini",
      llm: new GeminiAdapter(geminiKey),
    });
  } else {
    console.warn("GOOGLE_AI_API_KEY not set — skipping Gemini agent");
  }

  // Agent 4: Groq/Llama
  const a4Email = envOrDefault("AGENT_4_EMAIL", "agent4@paperclip.demo");
  const a4Pass = envOrDefault("AGENT_4_PASSWORD", "paperclip-demo-agent-4");
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    agents.push({
      email: a4Email,
      password: a4Pass,
      model: "groq",
      llm: new GroqAdapter(groqKey),
    });
  } else {
    console.warn("GROQ_API_KEY not set — skipping Llama/Groq agent");
  }

  if (agents.length === 0) {
    console.error("No LLM API keys found. Set at least one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_AI_API_KEY, GROQ_API_KEY");
    process.exit(1);
  }

  console.log(`Loaded ${agents.length} agent(s): ${agents.map((a) => a.llm.name).join(", ")}`);
  console.log(`App URL: ${appUrl}`);

  return agents;
}

export function getAppUrl(): string {
  return envOrDefault("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
}
