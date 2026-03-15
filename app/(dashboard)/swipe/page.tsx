import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SwipeDeck } from "./swipe-deck";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";

export default async function SwipePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: woos } = await supabase
    .from("woos")
    .select("id, title, images, estimated_value, category")
    .eq("owner_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const activeWoos = woos ?? [];

  return (
    <div className="space-y-3 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-2xl font-serif font-bold tracking-tight">Swipe</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Find Woos you want to trade for
        </p>
      </div>

      {activeWoos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-8 sm:py-16 px-4 sm:px-6 text-center">
          <Package className="h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground mb-3 sm:mb-4" />
          <h2 className="text-base sm:text-lg font-serif font-semibold">No Woos to trade</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 mb-3 sm:mb-4 max-w-sm">
            You need at least one active Woo to start swiping.
          </p>
          <Button asChild>
            <Link href="/intake">Start an Intake</Link>
          </Button>
        </div>
      ) : (
        <SwipeDeck woos={activeWoos} />
      )}
    </div>
  );
}
