import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyMatches } from "./actions";
import { MatchList } from "./match-list";
import { Button } from "@/components/ui/button";
import { Repeat2 } from "lucide-react";

export default async function MatchesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: matches, userId, error } = await getMyMatches();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Matches</h1>
        <p className="text-sm text-muted-foreground">
          Chat and trade with your matches
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : matches.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 px-6 text-center">
          <Repeat2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold">No matches yet</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-sm">
            Start swiping to find Woos you want to trade for. When you and
            another user both swipe right, you&apos;ll match!
          </p>
          <Button asChild>
            <Link href="/swipe">Start Swiping</Link>
          </Button>
        </div>
      ) : (
        <MatchList matches={matches} currentUserId={userId!} />
      )}
    </div>
  );
}
