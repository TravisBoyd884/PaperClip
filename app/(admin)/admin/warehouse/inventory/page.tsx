import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWarehouseInventory } from "../actions";
import { InventoryTable } from "./inventory-table";

export default async function AdminInventoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: staffRecords } = await supabase
    .from("warehouse_staff")
    .select("warehouse_id")
    .eq("profile_id", user.id);

  if (!staffRecords || staffRecords.length === 0) redirect("/dashboard");

  const warehouseIds = staffRecords.map((s) => s.warehouse_id);
  const items = await getWarehouseInventory(warehouseIds);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight">Inventory</h1>
        <p className="text-muted-foreground mt-1">
          All verified and stored items with their linked Woo details.
        </p>
      </div>
      <InventoryTable items={items} />
    </div>
  );
}
