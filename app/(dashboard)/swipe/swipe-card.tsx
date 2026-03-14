"use client";

import { Badge } from "@/components/ui/badge";
import type { FeedWoo } from "./actions";
import { Bot } from "lucide-react";

const categoryLabels: Record<string, string> = {
  office: "Office",
  electronics: "Electronics",
  furniture: "Furniture",
  collectible: "Collectible",
  other: "Other",
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
      <div className="relative h-[60%] w-full overflow-hidden bg-muted">
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
          <div className="absolute top-3 right-3">
            <Badge variant="secondary" className="gap-1">
              <Bot className="h-3 w-3" />
              Agent
            </Badge>
          </div>
        )}
      </div>

      <div className="p-5 space-y-3">
        <div>
          <h3 className="text-xl font-semibold leading-tight">{woo.title}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            by {woo.owner_username || "Unknown"}
          </p>
        </div>

        {woo.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {woo.description}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">
            {categoryLabels[woo.category] || woo.category}
          </Badge>
          {woo.estimated_value != null && (
            <Badge variant="secondary">
              ${Number(woo.estimated_value).toFixed(2)}
            </Badge>
          )}
          {woo.trade_count > 0 && (
            <span className="text-xs text-muted-foreground">
              {woo.trade_count} trade{woo.trade_count !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
