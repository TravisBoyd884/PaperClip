"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

async function requireWarehouseStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const admin = createAdminClient();
  const { data: staffRecords } = await admin
    .from("warehouse_staff")
    .select("*, warehouses(*)")
    .eq("profile_id", user.id);

  if (!staffRecords || staffRecords.length === 0) {
    throw new Error("Not authorized: not warehouse staff");
  }

  return { user, admin, staffRecords, warehouseIds: staffRecords.map((s: any) => s.warehouse_id) };
}

async function requireItemInWarehouse(admin: ReturnType<typeof createAdminClient>, itemId: string, warehouseIds: string[]) {
  const { data: item, error } = await admin
    .from("items")
    .select("*")
    .eq("id", itemId)
    .in("warehouse_id", warehouseIds)
    .single();

  if (error || !item) {
    throw new Error("Item not found or not in your warehouse");
  }

  return item;
}

// ─── Intake Actions ──────────────────────────────────────────────────────────

export async function markItemReceived(itemId: string) {
  const { admin, warehouseIds } = await requireWarehouseStaff();
  const item = await requireItemInWarehouse(admin, itemId, warehouseIds);

  if (item.status !== "in_transit") {
    return { error: `Cannot mark as received: item is ${item.status}, expected in_transit` };
  }

  const { error } = await admin
    .from("items")
    .update({ status: "received" })
    .eq("id", itemId);

  if (error) return { error: error.message };
  revalidatePath("/admin/warehouse");
  return { success: true };
}

export async function verifyItem(itemId: string) {
  const { admin, warehouseIds } = await requireWarehouseStaff();
  const item = await requireItemInWarehouse(admin, itemId, warehouseIds);

  if (item.status !== "received") {
    return { error: `Cannot verify: item is ${item.status}, expected received` };
  }

  const { error } = await admin
    .from("items")
    .update({ status: "verified", verified: true })
    .eq("id", itemId);

  if (error) return { error: error.message };
  revalidatePath("/admin/warehouse");
  return { success: true };
}

export async function mintWoo(itemId: string) {
  const { admin, warehouseIds } = await requireWarehouseStaff();
  await requireItemInWarehouse(admin, itemId, warehouseIds);

  const { data, error } = await admin.rpc("mint_woo", {
    p_item_id: itemId,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/warehouse");
  return { success: true, wooId: data };
}

// ─── Cash Out Actions ────────────────────────────────────────────────────────

export async function startCashoutProcessing(cashoutId: string) {
  const { admin, warehouseIds } = await requireWarehouseStaff();

  const { data: cashout, error: fetchErr } = await admin
    .from("cashouts")
    .select("*, woos(*, items(*))")
    .eq("id", cashoutId)
    .single();

  if (fetchErr || !cashout) return { error: "Cashout not found" };
  if (!warehouseIds.includes(cashout.woos?.items?.warehouse_id)) {
    return { error: "Cashout item not in your warehouse" };
  }
  if (cashout.status !== "requested") {
    return { error: `Cannot process: status is ${cashout.status}, expected requested` };
  }

  const { error } = await admin
    .from("cashouts")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", cashoutId);

  if (error) return { error: error.message };
  revalidatePath("/admin/warehouse");
  return { success: true };
}

export async function shipCashout(
  cashoutId: string,
  trackingNumber: string,
  carrier: string
) {
  const { admin, warehouseIds } = await requireWarehouseStaff();

  const { data: cashout, error: fetchErr } = await admin
    .from("cashouts")
    .select("*, woos(*, items(*))")
    .eq("id", cashoutId)
    .single();

  if (fetchErr || !cashout) return { error: "Cashout not found" };
  if (!warehouseIds.includes(cashout.woos?.items?.warehouse_id)) {
    return { error: "Cashout item not in your warehouse" };
  }
  if (cashout.status !== "processing") {
    return { error: `Cannot ship: status is ${cashout.status}, expected processing` };
  }

  // Burn the Woo
  const { error: burnErr } = await admin.rpc("burn_woo", {
    p_woo_id: cashout.woo_id,
  });
  if (burnErr) return { error: `Failed to burn Woo: ${burnErr.message}` };

  // Update item status
  const warehouseId = cashout.woos.items.warehouse_id;
  await admin
    .from("items")
    .update({ status: "shipping_out" })
    .eq("id", cashout.woos.item_id);

  // Decrement warehouse count
  const { data: wh } = await admin
    .from("warehouses")
    .select("current_count")
    .eq("id", warehouseId)
    .single();
  if (wh) {
    await admin
      .from("warehouses")
      .update({ current_count: Math.max(0, wh.current_count - 1) })
      .eq("id", warehouseId);
  }

  // Update cashout
  const { error } = await admin
    .from("cashouts")
    .update({
      status: "shipped",
      tracking_number: trackingNumber,
      carrier,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cashoutId);

  if (error) return { error: error.message };
  revalidatePath("/admin/warehouse");
  return { success: true };
}

export async function markCashoutDelivered(cashoutId: string) {
  const { admin, warehouseIds } = await requireWarehouseStaff();

  const { data: cashout, error: fetchErr } = await admin
    .from("cashouts")
    .select("*, woos(*, items(*))")
    .eq("id", cashoutId)
    .single();

  if (fetchErr || !cashout) return { error: "Cashout not found" };
  if (!warehouseIds.includes(cashout.woos?.items?.warehouse_id)) {
    return { error: "Cashout item not in your warehouse" };
  }
  if (cashout.status !== "shipped") {
    return { error: `Cannot mark delivered: status is ${cashout.status}, expected shipped` };
  }

  await admin
    .from("items")
    .update({ status: "shipped" })
    .eq("id", cashout.woos.item_id);

  const { error } = await admin
    .from("cashouts")
    .update({ status: "delivered", updated_at: new Date().toISOString() })
    .eq("id", cashoutId);

  if (error) return { error: error.message };
  revalidatePath("/admin/warehouse");
  return { success: true };
}

export async function completeCashout(cashoutId: string) {
  const { admin, warehouseIds } = await requireWarehouseStaff();

  const { data: cashout, error: fetchErr } = await admin
    .from("cashouts")
    .select("*, woos(*, items(*))")
    .eq("id", cashoutId)
    .single();

  if (fetchErr || !cashout) return { error: "Cashout not found" };
  if (!warehouseIds.includes(cashout.woos?.items?.warehouse_id)) {
    return { error: "Cashout item not in your warehouse" };
  }
  if (cashout.status !== "delivered") {
    return { error: `Cannot complete: status is ${cashout.status}, expected delivered` };
  }

  const { error } = await admin
    .from("cashouts")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", cashoutId);

  if (error) return { error: error.message };
  revalidatePath("/admin/warehouse");
  return { success: true };
}

// ─── Data Fetching ───────────────────────────────────────────────────────────

export async function getWarehouseStats(warehouseIds: string[]) {
  const admin = createAdminClient();

  const [itemsRes, cashoutsRes, warehousesRes] = await Promise.all([
    admin
      .from("items")
      .select("status, warehouse_id")
      .in("warehouse_id", warehouseIds),
    admin
      .from("cashouts")
      .select("status, woos(items(warehouse_id))")
      .in("status", ["requested", "processing", "shipped"]),
    admin
      .from("warehouses")
      .select("*")
      .in("id", warehouseIds),
  ]);

  const items = itemsRes.data || [];
  const pendingIntakes = items.filter((i) =>
    ["in_transit", "received", "verified"].includes(i.status)
  ).length;
  const storedItems = items.filter((i) => i.status === "stored").length;

  const cashouts = (cashoutsRes.data || []).filter((c: any) => {
    return warehouseIds.includes(c.woos?.items?.warehouse_id);
  });
  const pendingCashouts = cashouts.length;

  const warehouse = warehousesRes.data?.[0];
  const capacity = warehouse?.capacity ?? 0;
  const currentCount = warehouse?.current_count ?? 0;

  return { pendingIntakes, storedItems, pendingCashouts, capacity, currentCount };
}

export async function getWarehouseItems(warehouseIds: string[], statuses: string[]) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("items")
    .select("*, warehouses(*), profiles:owner_id(id, username, avatar_url)")
    .in("warehouse_id", warehouseIds)
    .in("status", statuses)
    .order("created_at", { ascending: false });

  if (error) return [];
  return data || [];
}

export async function getWarehouseInventory(warehouseIds: string[]) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("items")
    .select("*, warehouses(*), woos(*), profiles:owner_id(id, username, avatar_url)")
    .in("warehouse_id", warehouseIds)
    .eq("status", "stored")
    .order("created_at", { ascending: false });

  if (error) return [];
  return data || [];
}

export async function getWarehouseCashouts(warehouseIds: string[]) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("cashouts")
    .select("*, woos(*, items(*, warehouses(*))), profiles:user_id(id, username, avatar_url)")
    .order("created_at", { ascending: false });

  if (error) return [];

  return (data || []).filter((c: any) => {
    return warehouseIds.includes(c.woos?.items?.warehouse_id);
  });
}
