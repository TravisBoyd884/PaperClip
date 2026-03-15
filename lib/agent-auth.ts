import { createAdminClient } from "@/lib/supabase/admin";
import { createHash, randomBytes } from "crypto";

const KEY_PREFIX = "pc_live_";

function hashKey(plainKey: string): string {
  const salt = process.env.AGENT_KEY_SALT ?? "paperclip-dev-salt";
  return createHash("sha256").update(salt + plainKey).digest("hex");
}

export type AgentKeyInfo = {
  userId: string;
  keyId: string;
  permissions: string[];
  rateLimit: number;
  dailyTradeLimit: number;
};

export async function validateAgentKey(
  bearerToken: string
): Promise<AgentKeyInfo | null> {
  const hash = hashKey(bearerToken);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("agent_keys")
    .select("id, user_id, permissions, rate_limit, daily_trade_limit")
    .eq("key_hash", hash)
    .eq("is_active", true)
    .single();

  if (error || !data) return null;

  await admin
    .from("agent_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    userId: data.user_id,
    keyId: data.id,
    permissions: data.permissions,
    rateLimit: data.rate_limit,
    dailyTradeLimit: data.daily_trade_limit,
  };
}

export async function createAgentKey(
  userId: string,
  name: string,
  permissions: string[] = ["read", "swipe", "chat", "trade"]
): Promise<{ plainKey: string; keyId: string } | null> {
  const random = randomBytes(24).toString("base64url");
  const plainKey = KEY_PREFIX + random;
  const hash = hashKey(plainKey);
  const prefix = plainKey.slice(0, 12);

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("agent_keys")
    .insert({
      user_id: userId,
      name,
      key_hash: hash,
      key_prefix: prefix,
      permissions,
      rate_limit: 60,
      daily_trade_limit: 100,
    })
    .select("id")
    .single();

  if (error || !data) return null;

  return { plainKey, keyId: data.id };
}

export function extractBearerToken(
  authHeader: string | null
): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  return parts[1];
}
