"use client";

import { Badge } from "@/components/ui/badge";
import type { FeedWoo } from "@/lib/trading";
import { Bot } from "lucide-react";

const categoryLabels: Record<string, string> = {
  office: "Office",
  electronics: "Electronics",
  furniture: "Furniture",
  collectible: "Collectible",
  other: "Other",
};

const conditionLabels: Record<string, string> = {
  new: "New",
  like_new: "Like New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

export type SwipeDirection = "left" | "right" | null;

export function SwipeCard({
  woo,
  animating,
  direction,
}: {
  woo: FeedWoo;
  animating: boolean;
  direction: SwipeDirection;
}) {
  const translateX =
    animating && direction === "left"
      ? "-150%"
      : animating && direction === "right"
        ? "150%"
        : "0";
  const rotate =
    animating && direction === "left"
      ? "-15deg"
      : animating && direction === "right"
        ? "15deg"
        : "0deg";

  return (
    <div
      className="absolute inset-0 rounded-2xl overflow-hidden bg-card border shadow-lg transition-all duration-300 ease-out"
      style={{
        transform: `translateX(${translateX}) rotate(${rotate})`,
        opacity: animating ? 0 : 1,
      }}
    >
      <div className="relative h-[55%] sm:h-[60%] w-full overflow-hidden bg-muted">
        {woo.images?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={woo.images[0]}
            alt={woo.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            No image
          </div>
        )}

        {woo.owner_is_agent && (
          <div className="absolute top-2 right-2 sm:top-3 sm:right-3">
            <Badge variant="secondary" className="gap-1 text-[10px] sm:text-xs">
              <Bot className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              Agent
            </Badge>
          </div>
        )}
      </div>

      <div className="p-2.5 sm:p-5 space-y-1.5 sm:space-y-3">
        <div>
          <h3 className="text-sm sm:text-xl font-semibold leading-tight">{woo.title}</h3>
          <p className="text-[10px] sm:text-sm text-muted-foreground mt-0.5">
            by {woo.owner_username || "Unknown"}
          </p>
        </div>

        {woo.description && (
          <p className="text-[10px] sm:text-sm text-muted-foreground line-clamp-1 sm:line-clamp-2">
            {woo.description}
          </p>
        )}

        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
          <Badge variant="outline" className="text-[9px] sm:text-xs px-1.5 sm:px-2.5 py-0 sm:py-0.5">
            {categoryLabels[woo.category] || woo.category}
          </Badge>
          {woo.condition && (
            <Badge variant="outline" className="text-muted-foreground text-[9px] sm:text-xs px-1.5 sm:px-2.5 py-0 sm:py-0.5">
              {conditionLabels[woo.condition] || woo.condition}
            </Badge>
          )}
          {woo.estimated_value != null && (
            <Badge variant="secondary" className="text-[9px] sm:text-xs px-1.5 sm:px-2.5 py-0 sm:py-0.5">
              ${Number(woo.estimated_value).toFixed(2)}
            </Badge>
          )}
          {woo.trade_count > 0 && (
            <span className="text-[9px] sm:text-xs text-muted-foreground">
              {woo.trade_count} trade{woo.trade_count !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
