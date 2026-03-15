import { createAdminClient } from "@/lib/supabase/admin";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

interface EmbeddingResponse {
  data: { embedding: number[] }[];
}

export async function generateEmbedding(
  text: string
): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) return null;

    const json: EmbeddingResponse = await res.json();
    return json.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

export async function generateEmbeddings(
  texts: string[]
): Promise<(number[] | null)[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return texts.map(() => null);

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) return texts.map(() => null);

    const json: EmbeddingResponse = await res.json();
    const sorted = json.data.sort(
      (a: { embedding: number[] } & { index?: number }, b: { embedding: number[] } & { index?: number }) =>
        ((a as unknown as { index: number }).index ?? 0) - ((b as unknown as { index: number }).index ?? 0)
    );
    return sorted.map((d) => d.embedding);
  } catch {
    return texts.map(() => null);
  }
}

export function buildWooEmbeddingText(woo: {
  title: string;
  description?: string | null;
  category?: string | null;
  condition?: string | null;
}): string {
  const parts = [woo.title];
  if (woo.description) parts.push(woo.description);
  if (woo.category) parts.push(`Category: ${woo.category}`);
  if (woo.condition) parts.push(`Condition: ${woo.condition}`);
  return parts.join(". ");
}

export function buildPreferenceEmbeddingText(prefs: {
  wants?: string[];
  willing_to_trade?: string[];
  personality?: string;
}): string {
  const parts: string[] = [];
  if (prefs.wants?.length) parts.push(`Wants: ${prefs.wants.join(", ")}`);
  if (prefs.willing_to_trade?.length)
    parts.push(`Willing to trade: ${prefs.willing_to_trade.join(", ")}`);
  if (prefs.personality) parts.push(prefs.personality);
  return parts.join(". ");
}

export function vectorToSql(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export async function storeWooEmbedding(
  wooId: string,
  embedding: number[]
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("woos")
    .update({ embedding: vectorToSql(embedding) } as Record<string, unknown>)
    .eq("id", wooId);
}

export async function storePreferenceEmbedding(
  userId: string,
  embedding: number[]
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ preference_embedding: vectorToSql(embedding) } as Record<string, unknown>)
    .eq("id", userId);
}
