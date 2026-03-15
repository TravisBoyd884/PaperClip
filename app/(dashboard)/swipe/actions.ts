"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

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
};

export type SwipeFilters = {
  category?: string;
  condition?: string;
  minValue?: number;
  maxValue?: number;
  nameSearch?: string;
  swiperValue?: number;
};

export async function getSwipeFeed(
  swiperWooId: string,
  filters?: SwipeFilters,
  limit = 20
): Promise<{ data: FeedWoo[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: [], error: "Not authenticated" };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_swipe_feed", {
    p_user_id: user.id,
    p_swiper_woo_id: swiperWooId,
    p_limit: limit,
    p_category: filters?.category ?? null,
    p_condition: filters?.condition ?? null,
    p_min_value: filters?.minValue ?? null,
    p_max_value: filters?.maxValue ?? null,
    p_name_search: filters?.nameSearch ?? null,
    p_swiper_value: filters?.swiperValue ?? null,
  });

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
    })),
  };
}

export async function recordSwipe(
  swiperWooId: string,
  targetWooId: string,
  direction: "left" | "right"
): Promise<{
  success: boolean;
  match_id?: string;
  matched_woo?: { id: string; title: string; images: string[] };
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated" };

  const { data: swiperWoo } = await supabase
    .from("woos")
    .select("id, owner_id")
    .eq("id", swiperWooId)
    .eq("owner_id", user.id)
    .single();

  if (!swiperWoo) return { success: false, error: "You don't own this Woo" };

  const { error: insertErr } = await supabase.from("swipes").insert({
    swiper_id: user.id,
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
    const admin = createAdminClient();
    const { data: matchId, error: matchErr } = await admin.rpc("check_match", {
      p_swiper_woo_id: swiperWooId,
      p_target_woo_id: targetWooId,
    });

    if (matchErr) {
      return { success: true };
    }

    if (matchId) {
      const { data: targetWoo } = await supabase
        .from("woos")
        .select("id, title, images")
        .eq("id", targetWooId)
        .single();

      revalidatePath("/matches");
      return {
        success: true,
        match_id: matchId,
        matched_woo: targetWoo ?? undefined,
      };
    }
  }

  return { success: true };
}

export async function getMyActiveWoos() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("woos")
    .select("id, title, images, estimated_value, category")
    .eq("owner_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  return data || [];
}
