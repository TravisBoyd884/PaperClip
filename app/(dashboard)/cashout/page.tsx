import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CashoutForm } from "./cashout-form";
import { CashoutStatusList } from "./cashout-list";

export default async function CashoutPage({
  searchParams,
}: {
  searchParams: Promise<{ woo?: string }>;
}) {
  const { woo: preselectedWooId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const [woosResult, cashoutsResult] = await Promise.all([
    supabase
      .from("woos")
      .select("id, title, images, estimated_value")
      .eq("owner_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase
      .from("cashouts")
      .select("*, woos(id, title, images)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const activeWoos = woosResult.data || [];
  const cashouts = cashoutsResult.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cash Out</h1>
          <p className="text-muted-foreground mt-1">
            Convert a Woo back to its physical item. We&apos;ll ship it to you.
          </p>
        </div>
        <CashoutForm woos={activeWoos} preselectedWooId={preselectedWooId} />
      </div>
      <CashoutStatusList cashouts={cashouts} />
    </div>
  );
}
