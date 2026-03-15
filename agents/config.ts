import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import type { AgentLLM, AgentPreferences } from "./llm-adapter.js";
import { ClaudeAdapter } from "./adapters/claude.js";
import { OpenAIAdapter } from "./adapters/openai.js";
import { GeminiAdapter } from "./adapters/gemini.js";
import { GroqAdapter } from "./adapters/groq.js";

config({ path: resolve(process.cwd(), ".agents.env") });
config({ path: resolve(process.cwd(), ".env") });

export interface AgentConfig {
  email: string;
  password: string;
  model: string;
  llm: AgentLLM;
  preferences: AgentPreferences;
}

interface SeedDemoUser {
  email: string;
  preferences?: {
    wants: string[];
    willing_to_trade: string[];
    personality: string;
  };
}

interface DBAgentPreferences {
  wants?: string[];
  willing_to_trade?: string[];
  personality?: string;
  swipe_model?: string;
  chat_model?: string;
}

const EMPTY_PREFS: AgentPreferences = { wants: [], willing_to_trade: [], personality: "" };

function loadPreferencesFromSeed(email: string): AgentPreferences {
  try {
    const seedPath = resolve(process.cwd(), "supabase", "seed-data.json");
    const seedData = JSON.parse(readFileSync(seedPath, "utf-8"));
    const demoUser = seedData.demo_users?.find(
      (u: SeedDemoUser) => u.email === email
    );
    if (demoUser?.preferences) {
      return demoUser.preferences;
    }
  } catch {
    // seed-data.json not found or malformed
  }
  return EMPTY_PREFS;
}

async function loadPreferencesFromDB(email: string): Promise<{ prefs: AgentPreferences; swipeModel?: string; chatModel?: string } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data } = await supabase
      .from("profiles")
      .select("agent_preferences")
      .eq("email", email)
      .single();

    if (!data?.agent_preferences) return null;

    const dbPrefs = data.agent_preferences as DBAgentPreferences;
    return {
      prefs: {
        wants: dbPrefs.wants ?? [],
        willing_to_trade: dbPrefs.willing_to_trade ?? [],
        personality: dbPrefs.personality ?? "",
      },
      swipeModel: dbPrefs.swipe_model,
      chatModel: dbPrefs.chat_model,
    };
  } catch {
    return null;
  }
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

export async function loadAgentConfigs(): Promise<AgentConfig[]> {
  const appUrl = envOrDefault("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  const agents: AgentConfig[] = [];

  // Agent 1: Claude
  const a1Email = envOrDefault("AGENT_1_EMAIL", "agent1@paperclip.demo");
  const a1Pass = envOrDefault("AGENT_1_PASSWORD", "paperclip-demo-agent-1");
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const dbResult = await loadPreferencesFromDB(a1Email);
    const preferences = dbResult?.prefs ?? loadPreferencesFromSeed(a1Email);
    agents.push({
      email: a1Email,
      password: a1Pass,
      model: "claude",
      llm: new ClaudeAdapter(anthropicKey, dbResult?.chatModel, dbResult?.swipeModel),
      preferences,
    });
  } else {
    console.warn("ANTHROPIC_API_KEY not set — skipping Claude agent");
  }

  // Agent 2: GPT
  const a2Email = envOrDefault("AGENT_2_EMAIL", "agent2@paperclip.demo");
  const a2Pass = envOrDefault("AGENT_2_PASSWORD", "paperclip-demo-agent-2");
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const dbResult = await loadPreferencesFromDB(a2Email);
    const preferences = dbResult?.prefs ?? loadPreferencesFromSeed(a2Email);
    agents.push({
      email: a2Email,
      password: a2Pass,
      model: "gpt",
      llm: new OpenAIAdapter(openaiKey, dbResult?.chatModel, dbResult?.swipeModel),
      preferences,
    });
  } else {
    console.warn("OPENAI_API_KEY not set — skipping GPT agent");
  }

  // Agent 3: Gemini
  const a3Email = envOrDefault("AGENT_3_EMAIL", "agent3@paperclip.demo");
  const a3Pass = envOrDefault("AGENT_3_PASSWORD", "paperclip-demo-agent-3");
  const geminiKey = process.env.GOOGLE_AI_API_KEY;
  if (geminiKey) {
    const dbResult = await loadPreferencesFromDB(a3Email);
    const preferences = dbResult?.prefs ?? loadPreferencesFromSeed(a3Email);
    agents.push({
      email: a3Email,
      password: a3Pass,
      model: "gemini",
      llm: new GeminiAdapter(geminiKey, dbResult?.chatModel, dbResult?.swipeModel),
      preferences,
    });
  } else {
    console.warn("GOOGLE_AI_API_KEY not set — skipping Gemini agent");
  }

  // Agent 4: Groq/Llama
  const a4Email = envOrDefault("AGENT_4_EMAIL", "agent4@paperclip.demo");
  const a4Pass = envOrDefault("AGENT_4_PASSWORD", "paperclip-demo-agent-4");
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const dbResult = await loadPreferencesFromDB(a4Email);
    const preferences = dbResult?.prefs ?? loadPreferencesFromSeed(a4Email);
    agents.push({
      email: a4Email,
      password: a4Pass,
      model: "groq",
      llm: new GroqAdapter(groqKey, dbResult?.chatModel, dbResult?.swipeModel),
      preferences,
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
