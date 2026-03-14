import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWarehouseCashouts } from "../actions";
import { CashoutList } from "./cashout-list";

export default async function AdminCashoutsPage() {
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
  const cashouts = await getWarehouseCashouts(warehouseIds);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cash Outs</h1>
        <p className="text-muted-foreground mt-1">
          Process cash out requests: pull items, ship, and track delivery.
        </p>
      </div>
      <CashoutList cashouts={cashouts} />
    </div>
  );
}
