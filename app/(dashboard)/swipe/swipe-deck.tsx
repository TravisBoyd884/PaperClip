"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Heart, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SwipeCard, type SwipeDirection } from "./swipe-card";
import { MatchModal } from "./match-modal";
import { getSwipeFeed, recordSwipe, type FeedWoo } from "./actions";

type UserWoo = {
  id: string;
  title: string;
  images: string[];
  estimated_value: number | null;
  category: string;
};

type MatchedData = {
  match_id: string;
  your_woo: { title: string; images: string[] };
  their_woo: { title: string; images: string[] };
};

export function SwipeDeck({ woos }: { woos: UserWoo[] }) {
  const [selectedWooId, setSelectedWooId] = useState<string>(
    woos[0]?.id ?? ""
  );
  const [feed, setFeed] = useState<FeedWoo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const [animDirection, setAnimDirection] = useState<SwipeDirection>(null);
  const [matchData, setMatchData] = useState<MatchedData | null>(null);

  const currentWoo = feed[currentIndex];
  const nextWoo = feed[currentIndex + 1];

  const loadFeed = useCallback(
    async (wooId: string) => {
      if (!wooId) return;
      setLoading(true);
      setCurrentIndex(0);
      setAnimDirection(null);
      try {
        const result = await getSwipeFeed(wooId);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setFeed(result.data);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedWooId) {
      loadFeed(selectedWooId);
    }
  }, [selectedWooId, loadFeed]);

  const handleSwipe = useCallback(
    async (direction: "left" | "right") => {
      if (swiping || !currentWoo) return;
      setSwiping(true);
      setAnimDirection(direction);

      await new Promise((r) => setTimeout(r, 280));

      try {
        const result = await recordSwipe(
          selectedWooId,
          currentWoo.id,
          direction
        );

        if (result.error) {
          toast.error(result.error);
          setAnimDirection(null);
          setSwiping(false);
          return;
        }

        if (result.match_id && result.matched_woo) {
          const myWoo = woos.find((w) => w.id === selectedWooId);
          setMatchData({
            match_id: result.match_id,
            your_woo: {
              title: myWoo?.title ?? "",
              images: myWoo?.images ?? [],
            },
            their_woo: {
              title: result.matched_woo.title,
              images: result.matched_woo.images,
            },
          });
        }
      } finally {
        setAnimDirection(null);
        setCurrentIndex((i) => i + 1);
        setSwiping(false);
      }
    },
    [swiping, currentWoo, selectedWooId, woos]
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") handleSwipe("left");
      if (e.key === "ArrowRight") handleSwipe("right");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSwipe]);

  const selectedWoo = woos.find((w) => w.id === selectedWooId);

  return (
    <div className="space-y-6">
      {/* Woo selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          Trading with:
        </span>
        <Select value={selectedWooId} onValueChange={setSelectedWooId}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue placeholder="Select a Woo to offer..." />
          </SelectTrigger>
          <SelectContent>
            {woos.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.title}
                {w.estimated_value != null &&
                  ` ($${Number(w.estimated_value).toFixed(2)})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Card area */}
      <div className="flex flex-col items-center gap-6">
        {loading ? (
          <div className="flex h-[460px] w-full max-w-sm items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !currentWoo ? (
          <div className="flex h-[460px] w-full max-w-sm flex-col items-center justify-center rounded-2xl border border-dashed text-center px-6">
            <p className="text-lg font-medium">No more Woos to swipe on</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Check back later or try a different Woo
            </p>
            <Button
              variant="outline"
              onClick={() => loadFeed(selectedWooId)}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        ) : (
          <>
            {/* Card stack */}
            <div className="relative h-[460px] w-full max-w-sm">
              {/* Next card (peeking behind) */}
              {nextWoo && (
                <div className="absolute inset-0 rounded-2xl overflow-hidden bg-card border shadow-sm scale-[0.96] opacity-60">
                  <div className="relative h-[60%] w-full overflow-hidden bg-muted">
                    {nextWoo.images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={nextWoo.images[0]}
                        alt={nextWoo.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        No image
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Current card */}
              <SwipeCard
                woo={currentWoo}
                animating={!!animDirection}
                direction={animDirection}
              />
            </div>

            {/* Swipe buttons */}
            <div className="flex items-center gap-6">
              <Button
                variant="outline"
                size="icon"
                className="h-14 w-14 rounded-full border-2 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => handleSwipe("left")}
                disabled={swiping}
              >
                <X className="h-7 w-7" />
              </Button>

              {selectedWoo && (
                <div className="text-center px-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Your Woo
                  </p>
                  <p className="text-xs font-medium line-clamp-1 max-w-[100px]">
                    {selectedWoo.title}
                  </p>
                </div>
              )}

              <Button
                variant="outline"
                size="icon"
                className="h-14 w-14 rounded-full border-2 border-pink-500 text-pink-500 hover:bg-pink-500 hover:text-white"
                onClick={() => handleSwipe("right")}
                disabled={swiping}
              >
                <Heart className="h-7 w-7" />
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Use ← → arrow keys or buttons to swipe
            </p>
          </>
        )}
      </div>

      <MatchModal data={matchData} onClose={() => setMatchData(null)} />
    </div>
  );
}
