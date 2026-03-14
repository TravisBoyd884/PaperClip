"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

function generateMockTrackingNumber(): string {
  const prefix = "PC";
  const digits = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 10)
  ).join("");
  return `${prefix}${digits}`;
}

function generateMockLabelUrl(warehouseName: string): string {
  return `/api/shipping-label?warehouse=${encodeURIComponent(warehouseName)}&t=${Date.now()}`;
}

export async function createIntake(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const condition = formData.get("condition") as string;
  const category = formData.get("category") as string;
  const photoUrls = formData.getAll("photoUrls") as string[];

  if (!name?.trim()) {
    return { error: "Item name is required" };
  }

  if (!condition) {
    return { error: "Condition is required" };
  }

  const admin = createAdminClient();

  const { data: warehouse, error: whError } = await admin
    .from("warehouses")
    .select("*")
    .eq("status", "active")
    .order("current_count", { ascending: true })
    .limit(1)
    .single();

  if (whError || !warehouse) {
    return { error: "No available warehouse found" };
  }

  const trackingNumber = generateMockTrackingNumber();
  const labelUrl = generateMockLabelUrl(warehouse.name);

  const { data: item, error: insertError } = await supabase
    .from("items")
    .insert({
      owner_id: user.id,
      warehouse_id: warehouse.id,
      name: name.trim(),
      description: description?.trim() || null,
      condition,
      category: category || "other",
      photos: photoUrls.filter(Boolean),
      status: "label_generated",
      shipping_label_url: labelUrl,
      intake_tracking_number: trackingNumber,
    })
    .select()
    .single();

  if (insertError) {
    return { error: insertError.message };
  }

  revalidatePath("/intake");
  return { data: item };
}

export async function markAsShipped(itemId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("items")
    .update({ status: "in_transit" })
    .eq("id", itemId)
    .eq("owner_id", user.id)
    .eq("status", "label_generated");

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/intake");
  return { success: true };
}

export async function getMyIntakes() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated", data: [] };
  }

  const { data, error } = await supabase
    .from("items")
    .select("*, warehouses(*)")
    .eq("owner_id", user.id)
    .in("status", [
      "requested",
      "label_generated",
      "in_transit",
      "received",
      "verified",
      "stored",
    ])
    .order("created_at", { ascending: false });

  if (error) {
    return { error: error.message, data: [] };
  }

  return { data: data || [] };
}

export async function uploadPhoto(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const file = formData.get("file") as File;
  if (!file) {
    return { error: "No file provided" };
  }

  const ext = file.name.split(".").pop();
  const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("item-photos")
    .upload(fileName, file);

  if (uploadError) {
    return { error: uploadError.message };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("item-photos").getPublicUrl(fileName);

  return { url: publicUrl };
}
