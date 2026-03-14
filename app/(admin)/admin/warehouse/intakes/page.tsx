import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWarehouseItems } from "../actions";
import { IntakeItemList } from "./intake-item-list";

export default async function AdminIntakesPage() {
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
  const items = await getWarehouseItems(warehouseIds, [
    "in_transit",
    "received",
    "verified",
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Pending Intakes</h1>
        <p className="text-muted-foreground mt-1">
          Process incoming items: receive, verify, and mint Woos.
        </p>
      </div>
      <IntakeItemList items={items} />
    </div>
  );
}
