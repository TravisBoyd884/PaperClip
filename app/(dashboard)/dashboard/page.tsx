import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";
import { WooGrid } from "./woo-grid";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: woos } = await supabase
    .from("woos")
    .select("id, title, images, estimated_value, category, trade_count, status")
    .eq("owner_id", user.id)
    .in("status", ["active", "cashed_out", "burned"])
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold">My Woos</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <SignOutButton />
      </div>

      {woos && woos.length > 0 ? (
        <WooGrid woos={woos} />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold">No Woos yet</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Ship a physical item to a PaperClip warehouse to get your first Woo
            and start trading.
          </p>
          <Button asChild className="mt-4">
            <Link href="/intake">Start an Intake</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
