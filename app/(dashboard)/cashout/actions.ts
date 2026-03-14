"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createCashout(wooId: string, shippingAddress: {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  if (!shippingAddress.street?.trim() || !shippingAddress.city?.trim() || !shippingAddress.zip?.trim()) {
    return { error: "Street, city, and zip are required" };
  }

  const { data: woo, error: wooErr } = await supabase
    .from("woos")
    .select("id, status, owner_id")
    .eq("id", wooId)
    .eq("owner_id", user.id)
    .single();

  if (wooErr || !woo) return { error: "Woo not found or not owned by you" };
  if (woo.status !== "active") return { error: `Woo is not available for cash out (status: ${woo.status})` };

  const { data: existingCashout } = await supabase
    .from("cashouts")
    .select("id")
    .eq("woo_id", wooId)
    .in("status", ["requested", "processing", "shipped"])
    .single();

  if (existingCashout) return { error: "A cash out is already in progress for this Woo" };

  const { error: updateErr } = await supabase
    .from("woos")
    .update({ status: "cashed_out", updated_at: new Date().toISOString() })
    .eq("id", wooId)
    .eq("owner_id", user.id);

  if (updateErr) return { error: updateErr.message };

  const { error: insertErr } = await supabase
    .from("cashouts")
    .insert({
      woo_id: wooId,
      user_id: user.id,
      shipping_address: shippingAddress,
    });

  if (insertErr) return { error: insertErr.message };

  revalidatePath("/cashout");
  return { success: true };
}

export async function getMyCashouts() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: [], error: "Not authenticated" };

  const { data, error } = await supabase
    .from("cashouts")
    .select("*, woos(id, title, images, item_id)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function getMyActiveWoos() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("woos")
    .select("id, title, images, estimated_value")
    .eq("owner_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  return data || [];
}
