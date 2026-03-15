"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  getSwipeFeed as getSwipeFeedCore,
  recordSwipe as recordSwipeCore,
  getActiveWoos as getActiveWoosCore,
} from "@/lib/trading";
import type { FeedWoo, SwipeFilters } from "@/lib/trading";

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

  return getSwipeFeedCore(user.id, swiperWooId, filters, limit);
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

  const result = await recordSwipeCore(user.id, swiperWooId, targetWooId, direction);

  if (result.match_id) {
    revalidatePath("/matches");
  }

  return result;
}

export async function getMyActiveWoos() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  return getActiveWoosCore(user.id);
}
