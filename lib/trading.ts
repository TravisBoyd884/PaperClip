import { createAdminClient } from "@/lib/supabase/admin";
import { vectorToSql } from "@/lib/embeddings";

export type FeedWoo = {
  id: string;
  title: string;
  description: string | null;
  images: string[];
  category: string;
  condition: string;
  estimated_value: number | null;
  trade_count: number;
  owner_username: string | null;
  owner_avatar_url: string | null;
  owner_is_agent: boolean;
  similarity_score: number | null;
};

export type SwipeFilters = {
  category?: string;
  condition?: string;
  minValue?: number;
  maxValue?: number;
  nameSearch?: string;
  swiperValue?: number;
  wantsEmbedding?: number[];
};

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
  woo_unavailable: boolean;
};

export type TradeWooInfo = {
  id: string;
  woo_id: string;
  title: string;
  images: string[];
  estimated_value: number | null;
  side: "a" | "b";
};

export type TradeInfo = {
  id: string;
  status: string;
  proposed_by: string;
  approved_by_a: boolean;
  approved_by_b: boolean;
  completed_at: string | null;
  created_at: string;
  trade_woos: TradeWooInfo[];
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

export type MessageInfo = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
  sender: MatchProfile;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAdmin() {
  return createAdminClient();
}

async function fetchTradeWoos(
  admin: ReturnType<typeof createAdminClient>,
  tradeId: string
): Promise<TradeWooInfo[]> {
  const { data: tradeWooRows } = await admin
    .from("trade_woos")
    .select("id, woo_id, side")
    .eq("trade_id", tradeId);

  if (!tradeWooRows?.length) return [];

  const wooIds = tradeWooRows.map((tw) => tw.woo_id);
  const { data: woos } = await admin
    .from("woos")
    .select("id, title, images, estimated_value")
    .in("id", wooIds);

  const wooMap = new Map((woos ?? []).map((w) => [w.id, w]));

  return tradeWooRows.map((tw) => {
    const woo = wooMap.get(tw.woo_id);
    return {
      id: tw.id,
      woo_id: tw.woo_id,
      title: woo?.title ?? "Unknown",
      images: woo?.images ?? [],
      estimated_value: woo?.estimated_value ?? null,
      side: tw.side as "a" | "b",
    };
  });
}

async function invalidateUnavailableMatchesCore(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const { data: openMatches } = await admin
    .from("matches")
    .select("id, woo_a_id, woo_b_id, user_a_id, user_b_id")
    .in("status", ["active", "trade_proposed"])
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);

  if (!openMatches?.length) return;

  const wooIds = [
    ...new Set(openMatches.flatMap((m) => [m.woo_a_id, m.woo_b_id])),
  ];

  const { data: woos } = await admin
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
      !wA ||
      !wB ||
      wA.status !== "active" ||
      wB.status !== "active" ||
      wA.owner_id !== m.user_a_id ||
      wB.owner_id !== m.user_b_id
    ) {
      staleMatchIds.push(m.id);
    }
  }

  if (!staleMatchIds.length) return;

  await admin
    .from("trades")
    .update({ status: "cancelled" })
    .in("match_id", staleMatchIds)
    .eq("status", "pending");

  await admin
    .from("matches")
    .update({ status: "trade_unavailable" })
    .in("id", staleMatchIds);
}

// ---------------------------------------------------------------------------
// Core trading functions — parameterised by userId, uses admin client
// ---------------------------------------------------------------------------

export async function getActiveWoos(userId: string) {
  const admin = getAdmin();
  const { data } = await admin
    .from("woos")
    .select("id, title, images, estimated_value, category")
    .eq("owner_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  return data || [];
}

export async function getSwipeFeed(
  userId: string,
  swiperWooId: string,
  filters?: SwipeFilters,
  limit = 20
): Promise<{ data: FeedWoo[]; error?: string }> {
  const admin = getAdmin();

  const rpcParams: Record<string, unknown> = {
    p_user_id: userId,
    p_swiper_woo_id: swiperWooId,
    p_limit: limit,
    p_category: filters?.category ?? null,
    p_condition: filters?.condition ?? null,
    p_min_value: filters?.minValue ?? null,
    p_max_value: filters?.maxValue ?? null,
    p_name_search: filters?.nameSearch ?? null,
    p_swiper_value: filters?.swiperValue ?? null,
    p_wants_embedding: filters?.wantsEmbedding
      ? vectorToSql(filters.wantsEmbedding)
      : null,
  };

  const { data, error } = await admin.rpc("get_swipe_feed", rpcParams);

  if (error) return { data: [], error: error.message };

  return {
    data: (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      title: row.title as string,
      description: row.description as string | null,
      images: row.images as string[],
      category: row.category as string,
      condition: row.condition as string,
      estimated_value: row.estimated_value as number | null,
      trade_count: row.trade_count as number,
      owner_username: row.owner_username as string | null,
      owner_avatar_url: row.owner_avatar_url as string | null,
      owner_is_agent: row.owner_is_agent as boolean,
      similarity_score: (row.similarity_score as number) ?? null,
    })),
  };
}

export async function recordSwipe(
  userId: string,
  swiperWooId: string,
  targetWooId: string,
  direction: "left" | "right"
): Promise<{
  success: boolean;
  match_id?: string;
  matched_woo?: { id: string; title: string; images: string[] };
  error?: string;
}> {
  const admin = getAdmin();

  const { data: swiperWoo } = await admin
    .from("woos")
    .select("id, owner_id")
    .eq("id", swiperWooId)
    .eq("owner_id", userId)
    .single();

  if (!swiperWoo) return { success: false, error: "You don't own this Woo" };

  const { error: insertErr } = await admin.from("swipes").insert({
    swiper_id: userId,
    swiper_woo_id: swiperWooId,
    target_woo_id: targetWooId,
    direction,
  });

  if (insertErr) {
    if (insertErr.code === "23505") {
      return { success: false, error: "Already swiped on this Woo" };
    }
    return { success: false, error: insertErr.message };
  }

  if (direction === "right") {
    const { data: matchId, error: matchErr } = await admin.rpc("check_match", {
      p_swiper_woo_id: swiperWooId,
      p_target_woo_id: targetWooId,
    });

    if (matchErr) {
      return { success: true };
    }

    if (matchId) {
      const { data: targetWoo } = await admin
        .from("woos")
        .select("id, title, images")
        .eq("id", targetWooId)
        .single();

      return {
        success: true,
        match_id: matchId,
        matched_woo: targetWoo ?? undefined,
      };
    }
  }

  return { success: true };
}

export async function getMatches(
  userId: string
): Promise<{ data: MatchSummary[]; error?: string }> {
  const admin = getAdmin();

  await invalidateUnavailableMatchesCore(admin, userId);

  const { data: matches, error } = await admin
    .from("matches")
    .select(
      `
      id, status, created_at, expires_at, user_a_id, user_b_id,
      woo_a:woos!matches_woo_a_id_fkey(id, title, images, estimated_value, category, trade_count, description),
      woo_b:woos!matches_woo_b_id_fkey(id, title, images, estimated_value, category, trade_count, description)
    `
    )
    .in("status", ["active", "trade_proposed", "trade_unavailable"])
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  if (!matches?.length) return { data: [] };

  const matchIds = matches.map((m) => m.id);
  const counterpartyIds = matches.map((m) =>
    m.user_a_id === userId ? m.user_b_id : m.user_a_id
  );

  const [profilesResult, messagesResult] = await Promise.all([
    admin
      .from("profiles")
      .select("id, username, avatar_url, is_agent")
      .in("id", counterpartyIds),
    admin
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
      m.user_a_id === userId ? m.user_b_id : m.user_a_id;
    const profile = profileMap.get(counterpartyId);
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
      woo_unavailable: m.status === "trade_unavailable",
    };
  });

  result.sort((a, b) => {
    const aTime = a.last_message?.created_at ?? a.created_at;
    const bTime = b.last_message?.created_at ?? b.created_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  return { data: result };
}

export async function getMatchDetails(
  userId: string,
  matchId: string
): Promise<{ data: MatchDetail | null; error?: string }> {
  const admin = getAdmin();

  const { data: match, error } = await admin
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

  if (match.user_a_id !== userId && match.user_b_id !== userId) {
    return { data: null, error: "Not a participant" };
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, username, avatar_url, is_agent")
    .in("id", [match.user_a_id, match.user_b_id]);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );
  const profileA = profileMap.get(match.user_a_id);
  const profileB = profileMap.get(match.user_b_id);

  let activeTrade: TradeInfo | null = null;
  const { data: trades } = await admin
    .from("trades")
    .select(
      "id, status, proposed_by, approved_by_a, approved_by_b, completed_at, created_at"
    )
    .eq("match_id", matchId)
    .in("status", ["pending", "completed"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (trades?.length) {
    const tradeWoos = await fetchTradeWoos(admin, trades[0].id);
    activeTrade = { ...trades[0], trade_woos: tradeWoos };
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
  userId: string,
  matchId: string,
  limit = 100
): Promise<{ data: MessageInfo[]; error?: string }> {
  const admin = getAdmin();

  const { data: match } = await admin
    .from("matches")
    .select("user_a_id, user_b_id")
    .eq("id", matchId)
    .single();

  if (!match) return { data: [], error: "Match not found" };
  if (match.user_a_id !== userId && match.user_b_id !== userId) {
    return { data: [], error: "Not a participant" };
  }

  const { data: messages, error } = await admin
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
  userId: string,
  matchId: string,
  content: string,
  messageType: string = "text"
): Promise<{ data: MessageInfo | null; error?: string }> {
  const admin = getAdmin();

  if (!content.trim()) return { data: null, error: "Message cannot be empty" };

  const { data: match } = await admin
    .from("matches")
    .select("id, user_a_id, user_b_id, status")
    .eq("id", matchId)
    .single();

  if (!match) return { data: null, error: "Match not found" };
  if (match.user_a_id !== userId && match.user_b_id !== userId) {
    return { data: null, error: "Not a participant" };
  }

  const { data: msg, error } = await admin
    .from("messages")
    .insert({
      match_id: matchId,
      sender_id: userId,
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
  userId: string,
  matchId: string,
  myWooIds?: string[]
): Promise<{ data: TradeInfo | null; error?: string }> {
  const admin = getAdmin();

  const { data: match } = await admin
    .from("matches")
    .select("id, woo_a_id, woo_b_id, user_a_id, user_b_id, status")
    .eq("id", matchId)
    .single();

  if (!match) return { data: null, error: "Match not found" };
  if (match.user_a_id !== userId && match.user_b_id !== userId) {
    return { data: null, error: "Not a participant" };
  }
  if (match.status !== "active") {
    return { data: null, error: "Match is not active" };
  }

  const { data: existingTrade } = await admin
    .from("trades")
    .select("id")
    .eq("match_id", matchId)
    .eq("status", "pending")
    .single();

  if (existingTrade) {
    return { data: null, error: "A trade is already pending for this match" };
  }

  const isUserA = match.user_a_id === userId;

  const sideAWooIds = isUserA
    ? (myWooIds?.length ? myWooIds : [match.woo_a_id])
    : [match.woo_a_id];
  const sideBWooIds = isUserA
    ? [match.woo_b_id]
    : (myWooIds?.length ? myWooIds : [match.woo_b_id]);

  const allWooIds = [...new Set([...sideAWooIds, ...sideBWooIds])];

  const { data: woos } = await admin
    .from("woos")
    .select("id, status, owner_id")
    .in("id", allWooIds);

  if (!woos) {
    return { data: null, error: "Could not verify Woos" };
  }

  const wooMap = new Map(woos.map((w) => [w.id, w]));

  for (const wooId of sideAWooIds) {
    const w = wooMap.get(wooId);
    if (!w || w.status !== "active" || w.owner_id !== match.user_a_id) {
      await admin
        .from("matches")
        .update({ status: "trade_unavailable" })
        .eq("id", matchId);
      return {
        data: null,
        error: "One of the Woos is no longer available for trading",
      };
    }
  }

  for (const wooId of sideBWooIds) {
    const w = wooMap.get(wooId);
    if (!w || w.status !== "active" || w.owner_id !== match.user_b_id) {
      await admin
        .from("matches")
        .update({ status: "trade_unavailable" })
        .eq("id", matchId);
      return {
        data: null,
        error: "One of the Woos is no longer available for trading",
      };
    }
  }

  const { data: trade, error: tradeErr } = await admin
    .from("trades")
    .insert({
      match_id: matchId,
      woo_a_id: match.woo_a_id,
      woo_b_id: match.woo_b_id,
      proposed_by: userId,
      approved_by_a: isUserA,
      approved_by_b: !isUserA,
    })
    .select(
      "id, status, proposed_by, approved_by_a, approved_by_b, completed_at, created_at"
    )
    .single();

  if (tradeErr) return { data: null, error: tradeErr.message };

  const tradeWooInserts = [
    ...sideAWooIds.map((wooId) => ({
      trade_id: trade.id,
      woo_id: wooId,
      side: "a" as const,
    })),
    ...sideBWooIds.map((wooId) => ({
      trade_id: trade.id,
      woo_id: wooId,
      side: "b" as const,
    })),
  ];

  await admin.from("trade_woos").insert(tradeWooInserts);

  await admin
    .from("matches")
    .update({ status: "trade_proposed" })
    .eq("id", matchId);

  await admin.from("messages").insert({
    match_id: matchId,
    sender_id: userId,
    content: JSON.stringify({ trade_id: trade.id }),
    message_type: "trade_proposal",
  });

  const tradeWoos = await fetchTradeWoos(admin, trade.id);

  return { data: { ...trade, trade_woos: tradeWoos } };
}

export async function approveTrade(
  userId: string,
  tradeId: string
): Promise<{ success: boolean; completed?: boolean; error?: string }> {
  const admin = getAdmin();

  const { data: trade } = await admin
    .from("trades")
    .select(
      "id, match_id, status, approved_by_a, approved_by_b, woo_a_id, woo_b_id"
    )
    .eq("id", tradeId)
    .eq("status", "pending")
    .single();

  if (!trade) return { success: false, error: "Trade not found or not pending" };

  const { data: match } = await admin
    .from("matches")
    .select("user_a_id, user_b_id")
    .eq("id", trade.match_id)
    .single();

  if (!match) return { success: false, error: "Match not found" };
  if (match.user_a_id !== userId && match.user_b_id !== userId) {
    return { success: false, error: "Not a participant" };
  }

  const { data: tradeWooRows } = await admin
    .from("trade_woos")
    .select("woo_id, side")
    .eq("trade_id", tradeId);

  const allWooIds = (tradeWooRows ?? []).map((tw) => tw.woo_id);

  if (allWooIds.length === 0) {
    allWooIds.push(trade.woo_a_id, trade.woo_b_id);
  }

  const { data: woos } = await admin
    .from("woos")
    .select("id, status, owner_id")
    .in("id", allWooIds);

  const wooMap = new Map((woos ?? []).map((w) => [w.id, w]));

  const twRows = tradeWooRows?.length
    ? tradeWooRows
    : [
        { woo_id: trade.woo_a_id, side: "a" },
        { woo_id: trade.woo_b_id, side: "b" },
      ];

  for (const tw of twRows) {
    const w = wooMap.get(tw.woo_id);
    const expectedOwner = tw.side === "a" ? match.user_a_id : match.user_b_id;
    if (!w || w.status !== "active" || w.owner_id !== expectedOwner) {
      await admin
        .from("trades")
        .update({ status: "cancelled" })
        .eq("id", tradeId);

      await admin
        .from("matches")
        .update({ status: "trade_unavailable" })
        .eq("id", trade.match_id);

      return {
        success: false,
        error: "One of the Woos is no longer available for trading",
      };
    }
  }

  const isUserA = match.user_a_id === userId;

  if (isUserA && trade.approved_by_a) {
    return { success: false, error: "You already approved this trade" };
  }
  if (!isUserA && trade.approved_by_b) {
    return { success: false, error: "You already approved this trade" };
  }

  const updateField = isUserA
    ? { approved_by_a: true }
    : { approved_by_b: true };

  const { error: updateErr } = await admin
    .from("trades")
    .update(updateField)
    .eq("id", tradeId);

  if (updateErr) return { success: false, error: updateErr.message };

  await admin.from("messages").insert({
    match_id: trade.match_id,
    sender_id: userId,
    content: JSON.stringify({ trade_id: tradeId }),
    message_type: "trade_approval",
  });

  const bothApproved = isUserA
    ? true && trade.approved_by_b
    : trade.approved_by_a && true;

  if (bothApproved) {
    const { error: execErr } = await admin.rpc("execute_trade", {
      p_trade_id: tradeId,
    });

    if (execErr) return { success: false, error: execErr.message };

    await admin.from("messages").insert({
      match_id: trade.match_id,
      sender_id: userId,
      content: "Trade completed! Woos have been swapped.",
      message_type: "system",
    });

    return { success: true, completed: true };
  }

  return { success: true, completed: false };
}

export async function cancelTrade(
  userId: string,
  tradeId: string
): Promise<{ success: boolean; error?: string }> {
  const admin = getAdmin();

  const { data: trade } = await admin
    .from("trades")
    .select("id, match_id, status")
    .eq("id", tradeId)
    .eq("status", "pending")
    .single();

  if (!trade) return { success: false, error: "Trade not found or not pending" };

  const { data: match } = await admin
    .from("matches")
    .select("user_a_id, user_b_id")
    .eq("id", trade.match_id)
    .single();

  if (!match) return { success: false, error: "Match not found" };
  if (match.user_a_id !== userId && match.user_b_id !== userId) {
    return { success: false, error: "Not a participant" };
  }

  const { error: updateErr } = await admin
    .from("trades")
    .update({ status: "cancelled" })
    .eq("id", tradeId);

  if (updateErr) return { success: false, error: updateErr.message };

  await admin
    .from("matches")
    .update({ status: "active" })
    .eq("id", trade.match_id);

  await admin.from("messages").insert({
    match_id: trade.match_id,
    sender_id: userId,
    content: "Trade cancelled.",
    message_type: "system",
  });

  return { success: true };
}

export async function dismissMatch(
  userId: string,
  matchId: string
): Promise<{ success: boolean; error?: string }> {
  const admin = getAdmin();

  const { data: match } = await admin
    .from("matches")
    .select("id, user_a_id, user_b_id, status")
    .eq("id", matchId)
    .single();

  if (!match) return { success: false, error: "Match not found" };
  if (match.user_a_id !== userId && match.user_b_id !== userId) {
    return { success: false, error: "Not a participant" };
  }
  if (match.status === "trade_completed") {
    return { success: false, error: "Cannot dismiss a completed trade" };
  }

  await admin
    .from("trades")
    .update({ status: "cancelled" })
    .eq("match_id", matchId)
    .eq("status", "pending");

  const { error: updateErr } = await admin
    .from("matches")
    .update({ status: "dismissed" })
    .eq("id", matchId);

  if (updateErr) return { success: false, error: updateErr.message };

  return { success: true };
}

export async function getActiveWoosForTrade(userId: string) {
  const admin = getAdmin();
  const { data } = await admin
    .from("woos")
    .select("id, title, images, estimated_value, category")
    .eq("owner_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  return data || [];
}
