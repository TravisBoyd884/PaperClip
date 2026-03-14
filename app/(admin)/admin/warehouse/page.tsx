import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWarehouseStats } from "./actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Package, PackageCheck, Truck, Warehouse } from "lucide-react";

export default async function WarehouseOverviewPage() {
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
  const stats = await getWarehouseStats(warehouseIds);
  const usagePercent =
    stats.capacity > 0
      ? Math.round((stats.currentCount / stats.capacity) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Warehouse Overview</h1>
        <p className="text-muted-foreground mt-1">
          Manage intakes, inventory, and cash outs.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Intakes
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingIntakes}</div>
            <CardDescription>Items awaiting processing</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Stored Items</CardTitle>
            <PackageCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.storedItems}</div>
            <CardDescription>Verified and minted</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Cash Outs
            </CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingCashouts}</div>
            <CardDescription>Awaiting shipment</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Capacity
            </CardTitle>
            <Warehouse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.currentCount}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {stats.capacity}
              </span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
            <CardDescription className="mt-1">{usagePercent}% used</CardDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
