"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  X,
  Heart,
  RefreshCw,
  Loader2,
  SlidersHorizontal,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { SwipeCard, type SwipeDirection } from "./swipe-card";
import { MatchModal } from "./match-modal";
import { getSwipeFeed, recordSwipe } from "./actions";
import type { FeedWoo, SwipeFilters } from "@/lib/trading";

const HEX_CLIP =
  "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

const CATEGORIES = [
  { value: "office", label: "Office" },
  { value: "electronics", label: "Electronics" },
  { value: "furniture", label: "Furniture" },
  { value: "collectible", label: "Collectible" },
  { value: "other", label: "Other" },
];

const CONDITIONS = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

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

function MiniHex({ image, title }: { image?: string; title: string }) {
  return (
    <div className="relative w-8 h-[37px] shrink-0">
      <div
        className="absolute inset-0 bg-border"
        style={{ clipPath: HEX_CLIP }}
      />
      <div
        className="absolute inset-[2px] overflow-hidden bg-muted"
        style={{ clipPath: HEX_CLIP }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground text-[7px]">
            ?
          </div>
        )}
      </div>
    </div>
  );
}

export function SwipeDeck({ woos }: { woos: UserWoo[] }) {
  const [selectedWooIds, setSelectedWooIds] = useState<string[]>(
    woos[0]?.id ? [woos[0].id] : []
  );
  const [feed, setFeed] = useState<FeedWoo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const [animDirection, setAnimDirection] = useState<SwipeDirection>(null);
  const [matchData, setMatchData] = useState<MatchedData | null>(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [conditionFilter, setConditionFilter] = useState<string | undefined>();
  const [priceRange, setPriceRange] = useState<string>("");
  const [nameSearch, setNameSearch] = useState("");

  const primaryWooId = selectedWooIds[0] ?? "";

  const selectedWoos = useMemo(
    () => woos.filter((w) => selectedWooIds.includes(w.id)),
    [woos, selectedWooIds]
  );

  const combinedValue = useMemo(
    () =>
      selectedWoos.reduce(
        (sum, w) => sum + (w.estimated_value ?? 0),
        0
      ),
    [selectedWoos]
  );

  const availableToAdd = useMemo(
    () => woos.filter((w) => !selectedWooIds.includes(w.id)),
    [woos, selectedWooIds]
  );

  const currentWoo = feed[currentIndex];
  const nextWoo = feed[currentIndex + 1];

  const buildFilters = useCallback((): SwipeFilters | undefined => {
    const range = priceRange ? parseFloat(priceRange) : undefined;
    const filters: SwipeFilters = {
      category: categoryFilter,
      condition: conditionFilter,
      nameSearch: nameSearch || undefined,
      swiperValue: combinedValue || undefined,
    };
    if (range && range > 0 && combinedValue > 0) {
      filters.minValue = Math.max(0, combinedValue - range);
      filters.maxValue = combinedValue + range;
    }
    const hasFilters = Object.values(filters).some((v) => v !== undefined);
    return hasFilters ? filters : undefined;
  }, [categoryFilter, conditionFilter, priceRange, nameSearch, combinedValue]);

  const loadFeed = useCallback(
    async (wooId: string, filters?: SwipeFilters) => {
      if (!wooId) return;
      setLoading(true);
      setCurrentIndex(0);
      setAnimDirection(null);
      try {
        const result = await getSwipeFeed(wooId, filters);
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
    if (primaryWooId) {
      loadFeed(primaryWooId, buildFilters());
    }
  }, [primaryWooId, loadFeed, buildFilters]);

  const handleSwipe = useCallback(
    async (direction: "left" | "right") => {
      if (swiping || !currentWoo) return;
      setSwiping(true);
      setAnimDirection(direction);

      await new Promise((r) => setTimeout(r, 280));

      try {
        const result = await recordSwipe(
          primaryWooId,
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
          const myWoo = woos.find((w) => w.id === primaryWooId);
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
    [swiping, currentWoo, primaryWooId, woos]
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "ArrowLeft") handleSwipe("left");
      if (e.key === "ArrowRight") handleSwipe("right");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSwipe]);

  function handlePrimaryChange(wooId: string) {
    setSelectedWooIds([wooId]);
  }

  function addWoo(wooId: string) {
    setSelectedWooIds((prev) => [...prev, wooId]);
  }

  function removeWoo(wooId: string) {
    if (selectedWooIds.length <= 1) return;
    setSelectedWooIds((prev) => prev.filter((id) => id !== wooId));
  }

  function applyFilters() {
    loadFeed(primaryWooId, buildFilters());
  }

  function clearFilters() {
    setCategoryFilter(undefined);
    setConditionFilter(undefined);
    setPriceRange("");
    setNameSearch("");
  }

  const hasActiveFilters =
    categoryFilter || conditionFilter || priceRange || nameSearch;

  return (
    <div className="space-y-4">
      {/* Woo selector with hex preview */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          Trading with:
        </span>
        <div className="flex items-center gap-2">
          {selectedWoos.length > 0 && (
            <div className="flex -space-x-2">
              {selectedWoos.map((w) => (
                <MiniHex key={w.id} image={w.images?.[0]} title={w.title} />
              ))}
            </div>
          )}
          <Select value={primaryWooId} onValueChange={handlePrimaryChange}>
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
      </div>

      {/* Additional Woos chips */}
      {selectedWooIds.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {selectedWoos.map((w) => (
            <Badge
              key={w.id}
              variant={w.id === primaryWooId ? "default" : "secondary"}
              className="gap-1 pr-1"
            >
              {w.title}
              {w.estimated_value != null &&
                ` ($${Number(w.estimated_value).toFixed(2)})`}
              {selectedWooIds.length > 1 && (
                <button
                  onClick={() => removeWoo(w.id)}
                  className="ml-1 rounded-full p-0.5 hover:bg-foreground/20"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          {availableToAdd.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs border-dashed"
                >
                  <Plus className="h-3 w-3" />
                  Add Woo
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {availableToAdd.map((w) => (
                  <DropdownMenuItem
                    key={w.id}
                    onClick={() => addWoo(w.id)}
                  >
                    {w.title}
                    {w.estimated_value != null &&
                      ` ($${Number(w.estimated_value).toFixed(2)})`}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {selectedWoos.length > 1 && (
            <span className="text-xs font-medium text-muted-foreground">
              Combined: ${combinedValue.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* Filter toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-1.5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {hasActiveFilters && (
            <span className="ml-1 h-2 w-2 rounded-full bg-primary" />
          )}
        </Button>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearFilters();
              loadFeed(primaryWooId);
            }}
            className="text-xs"
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          {/* Search */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Search by name
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                placeholder="e.g. keyboards"
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Category
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() =>
                    setCategoryFilter(
                      categoryFilter === c.value ? undefined : c.value
                    )
                  }
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    categoryFilter === c.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-border"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Condition */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Condition
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CONDITIONS.map((c) => (
                <button
                  key={c.value}
                  onClick={() =>
                    setConditionFilter(
                      conditionFilter === c.value ? undefined : c.value
                    )
                  }
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    conditionFilter === c.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-border"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Price range */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Price range (&#177; $ from{" "}
              {selectedWoos.length > 1 ? "combined" : "your Woo"} value)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">&#177; $</span>
              <Input
                type="number"
                min="0"
                step="1"
                value={priceRange}
                onChange={(e) => setPriceRange(e.target.value)}
                placeholder="e.g. 20"
                className="h-8 text-sm w-24"
              />
              {priceRange && combinedValue > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  ${Math.max(0, combinedValue - parseFloat(priceRange || "0")).toFixed(2)}
                  {" - "}${(combinedValue + parseFloat(priceRange || "0")).toFixed(2)}
                </span>
              )}
            </div>
          </div>

          <Button size="sm" onClick={applyFilters} className="w-full">
            Apply Filters
          </Button>
        </div>
      )}

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
              {hasActiveFilters
                ? "Try adjusting your filters or clearing them"
                : "Check back later or try a different Woo"}
            </p>
            <div className="flex gap-2">
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  onClick={() => {
                    clearFilters();
                    loadFeed(primaryWooId);
                  }}
                >
                  Clear Filters
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => loadFeed(primaryWooId, buildFilters())}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Card stack */}
            <div className="relative h-[460px] w-full max-w-sm">
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

              {selectedWoos.length > 0 && (
                <div className="text-center px-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Your Woo{selectedWoos.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-xs font-medium line-clamp-1 max-w-[100px]">
                    {selectedWoos.length === 1
                      ? selectedWoos[0].title
                      : `${selectedWoos.length} Woos`}
                  </p>
                  {selectedWoos.length > 1 && (
                    <p className="text-[10px] text-muted-foreground">
                      ${combinedValue.toFixed(2)}
                    </p>
                  )}
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
