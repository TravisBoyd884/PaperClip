"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type MatchWoo = {
  id: string;
  title: string;
  images: string[];
  estimated_value: number | null;
  category: string;
  trade_count: number;
  description: string | null;
};

export type MatchProfile = {
  username: string | null;
  avatar_url: string | null;
  is_agent: boolean;
};

export type MatchSummary = {
  id: string;
  status: string;
  created_at: string;
  expires_at: string;
  user_a_id: string;
  user_b_id: string;
  woo_a: MatchWoo;
  woo_b: MatchWoo;
  counterparty: MatchProfile;
  last_message: { content: string; created_at: string } | null;
};

export type MatchDetail = {
  id: string;
  status: string;
  created_at: string;
  expires_at: string;
  user_a_id: string;
  user_b_id: string;
  woo_a_id: string;
  woo_b_id: string;
  woo_a: MatchWoo;
  woo_b: MatchWoo;
  user_a: MatchProfile;
  user_b: MatchProfile;
  active_trade: TradeInfo | null;
};

export type TradeInfo = {
  id: string;
  status: string;
  proposed_by: string;
  approved_by_a: boolean;
  approved_by_b: boolean;
  completed_at: string | null;
  created_at: string;
};

export type MessageInfo = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
  sender: MatchProfile;
};

async function invalidateUnavailableMatches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const { data: openMatches } = await supabase
    .from("matches")
    .select("id, woo_a_id, woo_b_id, user_a_id, user_b_id")
    .in("status", ["active", "trade_proposed"])
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);

  if (!openMatches?.length) return;

  const wooIds = [
    ...new Set(openMatches.flatMap((m) => [m.woo_a_id, m.woo_b_id])),
  ];

  const { data: woos } = await supabase
    .from("woos")
    .select("id, status, owner_id")
    .in("id", wooIds);

  if (!woos) return;

  const wooMap = new Map(woos.map((w) => [w.id, w]));

  const staleMatchIds: string[] = [];
  for (const m of openMatches) {
    const wA = wooMap.get(m.woo_a_id);
    const wB = wooMap.get(m.woo_b_id);
    if (
      !wA || !wB ||
      wA.status !== "active" || wB.status !== "active" ||
      wA.owner_id !== m.user_a_id || wB.owner_id !== m.user_b_id
    ) {
      staleMatchIds.push(m.id);
    }
  }

  if (!staleMatchIds.length) return;

  await supabase
    .from("trades")
    .update({ status: "cancelled" })
    .in("match_id", staleMatchIds)
    .eq("status", "pending");

  await supabase
    .from("matches")
    .update({ status: "cancelled" })
    .in("id", staleMatchIds);
}

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

  await invalidateUnavailableMatches(supabase, user.id);

  const { data: matches, error } = await supabase
    .from("matches")
    .select(
      `
      id, status, created_at, expires_at, user_a_id, user_b_id,
      woo_a:woos!matches_woo_a_id_fkey(id, title, images, estimated_value, category, trade_count, description),
      woo_b:woos!matches_woo_b_id_fkey(id, title, images, estimated_value, category, trade_count, description)
    `
    )
    .in("status", ["active", "trade_proposed"])
    .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  if (!matches?.length) return { data: [], userId: user.id };

  const matchIds = matches.map((m) => m.id);
  const counterpartyIds = matches.map((m) =>
    m.user_a_id === user.id ? m.user_b_id : m.user_a_id
  );

  const [profilesResult, messagesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, avatar_url, is_agent")
      .in("id", counterpartyIds),
    supabase
      .from("messages")
      .select("match_id, content, created_at")
      .in("match_id", matchIds)
      .order("created_at", { ascending: false }),
  ]);

  const profileMap = new Map(
    (profilesResult.data ?? []).map((p) => [p.id, p])
  );

  const lastMessageMap = new Map<
    string,
    { content: string; created_at: string }
  >();
  for (const msg of messagesResult.data ?? []) {
    if (!lastMessageMap.has(msg.match_id)) {
      lastMessageMap.set(msg.match_id, {
        content: msg.content,
        created_at: msg.created_at,
      });
    }
  }

  const result: MatchSummary[] = matches.map((m) => {
    const counterpartyId =
      m.user_a_id === user.id ? m.user_b_id : m.user_a_id;
    const profile = profileMap.get(counterpartyId);
    // woo_a and woo_b come back as single objects from the join
    const wooA = m.woo_a as unknown as MatchWoo;
    const wooB = m.woo_b as unknown as MatchWoo;

    return {
      id: m.id,
      status: m.status,
      created_at: m.created_at,
      expires_at: m.expires_at,
      user_a_id: m.user_a_id,
      user_b_id: m.user_b_id,
      woo_a: wooA,
      woo_b: wooB,
      counterparty: {
        username: profile?.username ?? null,
        avatar_url: profile?.avatar_url ?? null,
        is_agent: profile?.is_agent ?? false,
      },
      last_message: lastMessageMap.get(m.id) ?? null,
    };
  });

  result.sort((a, b) => {
    const aTime = a.last_message?.created_at ?? a.created_at;
    const bTime = b.last_message?.created_at ?? b.created_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  return { data: result, userId: user.id };
}

export async function getMatchDetails(
  matchId: string
): Promise<{ data: MatchDetail | null; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, error: "Not authenticated" };

  const { data: match, error } = await supabase
    .from("matches")
    .select(
      `
      id, status, created_at, expires_at, user_a_id, user_b_id, woo_a_id, woo_b_id,
      woo_a:woos!matches_woo_a_id_fkey(id, title, images, estimated_value, category, trade_count, description),
      woo_b:woos!matches_woo_b_id_fkey(id, title, images, estimated_value, category, trade_count, description)
    `
    )
    .eq("id", matchId)
    .single();

  if (error || !match) return { data: null, error: "Match not found" };

  if (match.user_a_id !== user.id && match.user_b_id !== user.id) {
    return { data: null, error: "Not a participant" };
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, is_agent")
    .in("id", [match.user_a_id, match.user_b_id]);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );
  const profileA = profileMap.get(match.user_a_id);
  const profileB = profileMap.get(match.user_b_id);

  let activeTrade: TradeInfo | null = null;
  const { data: trades } = await supabase
    .from("trades")
    .select(
      "id, status, proposed_by, approved_by_a, approved_by_b, completed_at, created_at"
    )
    .eq("match_id", matchId)
    .in("status", ["pending", "completed"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (trades?.length) {
    activeTrade = trades[0];
  }

  return {
    data: {
      id: match.id,
      status: match.status,
      created_at: match.created_at,
      expires_at: match.expires_at,
      user_a_id: match.user_a_id,
      user_b_id: match.user_b_id,
      woo_a_id: match.woo_a_id,
      woo_b_id: match.woo_b_id,
      woo_a: match.woo_a as unknown as MatchWoo,
      woo_b: match.woo_b as unknown as MatchWoo,
      user_a: {
        username: profileA?.username ?? null,
        avatar_url: profileA?.avatar_url ?? null,
        is_agent: profileA?.is_agent ?? false,
      },
      user_b: {
        username: profileB?.username ?? null,
        avatar_url: profileB?.avatar_url ?? null,
        is_agent: profileB?.is_agent ?? false,
      },
      active_trade: activeTrade,
    },
  };
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

  const { data: messages, error } = await supabase
    .from("messages")
    .select(
      `
      id, match_id, sender_id, content, message_type, created_at,
      sender:profiles!messages_sender_id_fkey(username, avatar_url, is_agent)
    `
    )
    .eq("match_id", matchId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) return { data: [], error: error.message };

  return {
    data: (messages ?? []).map((m) => ({
      id: m.id,
      match_id: m.match_id,
      sender_id: m.sender_id,
      content: m.content,
      message_type: m.message_type,
      created_at: m.created_at,
      sender: m.sender as unknown as MatchProfile,
    })),
  };
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
  if (!content.trim()) return { data: null, error: "Message cannot be empty" };

  const { data: match } = await supabase
    .from("matches")
    .select("id, user_a_id, user_b_id, status")
    .eq("id", matchId)
    .single();

  if (!match) return { data: null, error: "Match not found" };
  if (match.user_a_id !== user.id && match.user_b_id !== user.id) {
    return { data: null, error: "Not a participant" };
  }

  const { data: msg, error } = await supabase
    .from("messages")
    .insert({
      match_id: matchId,
      sender_id: user.id,
      content,
      message_type: messageType,
    })
    .select(
      `
      id, match_id, sender_id, content, message_type, created_at,
      sender:profiles!messages_sender_id_fkey(username, avatar_url, is_agent)
    `
    )
    .single();

  if (error) return { data: null, error: error.message };

  return {
    data: {
      ...msg,
      sender: msg.sender as unknown as MatchProfile,
    },
  };
}

export async function proposeTrade(
  matchId: string
): Promise<{ data: TradeInfo | null; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, error: "Not authenticated" };

  const { data: match } = await supabase
    .from("matches")
    .select("id, woo_a_id, woo_b_id, user_a_id, user_b_id, status")
    .eq("id", matchId)
    .single();

  if (!match) return { data: null, error: "Match not found" };
  if (match.user_a_id !== user.id && match.user_b_id !== user.id) {
    return { data: null, error: "Not a participant" };
  }
  if (match.status !== "active") {
    return { data: null, error: "Match is not active" };
  }

  const { data: existingTrade } = await supabase
    .from("trades")
    .select("id")
    .eq("match_id", matchId)
    .eq("status", "pending")
    .single();

  if (existingTrade) {
    return { data: null, error: "A trade is already pending for this match" };
  }

  const { data: woos } = await supabase
    .from("woos")
    .select("id, status, owner_id")
    .in("id", [match.woo_a_id, match.woo_b_id]);

  const wooA = woos?.find((w) => w.id === match.woo_a_id);
  const wooB = woos?.find((w) => w.id === match.woo_b_id);

  if (
    !wooA || !wooB ||
    wooA.status !== "active" || wooB.status !== "active" ||
    wooA.owner_id !== match.user_a_id || wooB.owner_id !== match.user_b_id
  ) {
    await supabase
      .from("matches")
      .update({ status: "cancelled" })
      .eq("id", matchId);

    return {
      data: null,
      error: "One of the Woos is no longer available for trading",
    };
  }

  const isUserA = match.user_a_id === user.id;

  const { data: trade, error: tradeErr } = await supabase
    .from("trades")
    .insert({
      match_id: matchId,
      woo_a_id: match.woo_a_id,
      woo_b_id: match.woo_b_id,
      proposed_by: user.id,
      approved_by_a: isUserA,
      approved_by_b: !isUserA,
    })
    .select(
      "id, status, proposed_by, approved_by_a, approved_by_b, completed_at, created_at"
    )
    .single();

  if (tradeErr) return { data: null, error: tradeErr.message };

  await supabase
    .from("matches")
    .update({ status: "trade_proposed" })
    .eq("id", matchId);

  await supabase.from("messages").insert({
    match_id: matchId,
    sender_id: user.id,
    content: JSON.stringify({ trade_id: trade.id }),
    message_type: "trade_proposal",
  });

  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/matches");
  return { data: trade };
}

export async function approveTrade(
  tradeId: string
): Promise<{ success: boolean; completed?: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated" };

  const { data: trade } = await supabase
    .from("trades")
    .select(
      "id, match_id, status, approved_by_a, approved_by_b, woo_a_id, woo_b_id"
    )
    .eq("id", tradeId)
    .eq("status", "pending")
    .single();

  if (!trade) return { success: false, error: "Trade not found or not pending" };

  const { data: match } = await supabase
    .from("matches")
    .select("user_a_id, user_b_id")
    .eq("id", trade.match_id)
    .single();

  if (!match) return { success: false, error: "Match not found" };
  if (match.user_a_id !== user.id && match.user_b_id !== user.id) {
    return { success: false, error: "Not a participant" };
  }

  const { data: woos } = await supabase
    .from("woos")
    .select("id, status, owner_id")
    .in("id", [trade.woo_a_id, trade.woo_b_id]);

  const wooA = woos?.find((w) => w.id === trade.woo_a_id);
  const wooB = woos?.find((w) => w.id === trade.woo_b_id);

  if (
    !wooA || !wooB ||
    wooA.status !== "active" || wooB.status !== "active" ||
    wooA.owner_id !== match.user_a_id || wooB.owner_id !== match.user_b_id
  ) {
    await supabase
      .from("trades")
      .update({ status: "cancelled" })
      .eq("id", tradeId);

    await supabase
      .from("matches")
      .update({ status: "cancelled" })
      .eq("id", trade.match_id);

    return {
      success: false,
      error: "One of the Woos is no longer available for trading",
    };
  }

  const isUserA = match.user_a_id === user.id;

  if (isUserA && trade.approved_by_a) {
    return { success: false, error: "You already approved this trade" };
  }
  if (!isUserA && trade.approved_by_b) {
    return { success: false, error: "You already approved this trade" };
  }

  const updateField = isUserA
    ? { approved_by_a: true }
    : { approved_by_b: true };

  const { error: updateErr } = await supabase
    .from("trades")
    .update(updateField)
    .eq("id", tradeId);

  if (updateErr) return { success: false, error: updateErr.message };

  await supabase.from("messages").insert({
    match_id: trade.match_id,
    sender_id: user.id,
    content: JSON.stringify({ trade_id: tradeId }),
    message_type: "trade_approval",
  });

  const bothApproved = isUserA
    ? true && trade.approved_by_b
    : trade.approved_by_a && true;

  if (bothApproved) {
    const admin = createAdminClient();
    const { error: execErr } = await admin.rpc("execute_trade", {
      p_trade_id: tradeId,
    });

    if (execErr) return { success: false, error: execErr.message };

    await supabase.from("messages").insert({
      match_id: trade.match_id,
      sender_id: user.id,
      content: "Trade completed! Woos have been swapped.",
      message_type: "system",
    });

    revalidatePath("/dashboard");
    revalidatePath(`/matches/${trade.match_id}`);
    revalidatePath("/matches");
    return { success: true, completed: true };
  }

  revalidatePath(`/matches/${trade.match_id}`);
  return { success: true, completed: false };
}

export async function cancelTrade(
  tradeId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated" };

  const { data: trade } = await supabase
    .from("trades")
    .select("id, match_id, status")
    .eq("id", tradeId)
    .eq("status", "pending")
    .single();

  if (!trade) return { success: false, error: "Trade not found or not pending" };

  const { data: match } = await supabase
    .from("matches")
    .select("user_a_id, user_b_id")
    .eq("id", trade.match_id)
    .single();

  if (!match) return { success: false, error: "Match not found" };
  if (match.user_a_id !== user.id && match.user_b_id !== user.id) {
    return { success: false, error: "Not a participant" };
  }

  const { error: updateErr } = await supabase
    .from("trades")
    .update({ status: "cancelled" })
    .eq("id", tradeId);

  if (updateErr) return { success: false, error: updateErr.message };

  await supabase
    .from("matches")
    .update({ status: "active" })
    .eq("id", trade.match_id);

  await supabase.from("messages").insert({
    match_id: trade.match_id,
    sender_id: user.id,
    content: "Trade cancelled.",
    message_type: "system",
  });

  revalidatePath(`/matches/${trade.match_id}`);
  revalidatePath("/matches");
  return { success: true };
}
