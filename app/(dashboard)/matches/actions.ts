"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  getMatches as getMatchesCore,
  getMatchDetails as getMatchDetailsCore,
  getMessages as getMessagesCore,
  sendMessage as sendMessageCore,
  proposeTrade as proposeTradeCore,
  approveTrade as approveTradeCore,
  cancelTrade as cancelTradeCore,
  dismissMatch as dismissMatchCore,
  getActiveWoosForTrade as getActiveWoosForTradeCore,
  type MatchWoo,
  type MatchProfile,
  type MatchSummary,
  type TradeWooInfo,
  type TradeInfo,
  type MatchDetail,
  type MessageInfo,
} from "@/lib/trading";

export type {
  MatchWoo,
  MatchProfile,
  MatchSummary,
  TradeWooInfo,
  TradeInfo,
  MatchDetail,
  MessageInfo,
};

export async function getMyMatches(): Promise<{
  data: MatchSummary[];
  userId?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: [], error: "Not authenticated" };

  const result = await getMatchesCore(user.id);
  return { ...result, userId: user.id };
}

export async function getMatchDetails(
  matchId: string
): Promise<{ data: MatchDetail | null; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, error: "Not authenticated" };

  return getMatchDetailsCore(user.id, matchId);
}

export async function getMessages(
  matchId: string,
  limit = 100
): Promise<{ data: MessageInfo[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: [], error: "Not authenticated" };

  return getMessagesCore(user.id, matchId, limit);
}

export async function sendMessage(
  matchId: string,
  content: string,
  messageType: string = "text"
): Promise<{ data: MessageInfo | null; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, error: "Not authenticated" };

  return sendMessageCore(user.id, matchId, content, messageType);
}

export async function proposeTrade(
  matchId: string,
  myWooIds?: string[]
): Promise<{ data: TradeInfo | null; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, error: "Not authenticated" };

  const result = await proposeTradeCore(user.id, matchId, myWooIds);

  if (result.data) {
    revalidatePath(`/matches/${matchId}`);
    revalidatePath("/matches");
  }

  return result;
}

export async function approveTrade(
  tradeId: string
): Promise<{ success: boolean; completed?: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated" };

  const result = await approveTradeCore(user.id, tradeId);

  if (result.completed) {
    revalidatePath("/dashboard");
  }

  return result;
}

export async function cancelTrade(
  tradeId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated" };

  const result = await cancelTradeCore(user.id, tradeId);

  if (result.success) {
    revalidatePath("/matches");
  }

  return result;
}

export async function dismissMatch(
  matchId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated" };

  const result = await dismissMatchCore(user.id, matchId);

  if (result.success) {
    revalidatePath("/matches");
  }

  return result;
}

export async function getMyActiveWoosForTrade() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  return getActiveWoosForTradeCore(user.id);
}
