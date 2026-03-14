"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { WooOverlay } from "./woo-overlay";

export type Woo = {
  id: string;
  title: string;
  images: string[];
  estimated_value: number | null;
  category: string;
  trade_count: number;
  status: string;
};

const HEX_CLIP =
  "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

const categoryLabels: Record<string, string> = {
  office: "Office",
  electronics: "Electronics",
  furniture: "Furniture",
  collectible: "Collectible",
  other: "Other",
};

type ValueTier = {
  bg: string;
  isRainbow?: boolean;
};

function getValueTier(value: number | null): ValueTier {
  if (value == null) return { bg: "bg-border" };
  if (value < 5) return { bg: "bg-sky-300" };
  if (value < 10) return { bg: "bg-blue-500" };
  if (value < 20) return { bg: "bg-purple-500" };
  if (value < 80) return { bg: "bg-pink-500" };
  if (value < 200) return { bg: "bg-red-500" };
  if (value < 500) return { bg: "bg-amber-400" };
  return { bg: "", isRainbow: true };
}

export function WooGrid({ woos }: { woos: Woo[] }) {
  const [selectedWoo, setSelectedWoo] = useState<Woo | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {woos.map((woo) => {
          const isActive = woo.status === "active";
          const tier = getValueTier(
            woo.estimated_value != null ? Number(woo.estimated_value) : null
          );

          return (
            <button
              key={woo.id}
              onClick={() => isActive && setSelectedWoo(woo)}
              className={`group flex flex-col items-center gap-3 text-center transition-transform ${
                isActive
                  ? "cursor-pointer hover:scale-105"
                  : "cursor-default opacity-50"
              }`}
            >
              <div className="relative w-full aspect-[1/1.15]">
                {/* Border layer */}
                <div
                  className={`absolute inset-0 ${tier.isRainbow ? "woo-rainbow" : tier.bg}`}
                  style={{ clipPath: HEX_CLIP }}
                />

                {/* Image layer (inset to reveal border) */}
                <div
                  className="absolute inset-[3px] overflow-hidden"
                  style={{ clipPath: HEX_CLIP }}
                >
                  {woo.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={woo.images[0]}
                      alt={woo.title}
                      className="h-full w-full object-cover transition-transform group-hover:scale-110"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground text-sm">
                      No image
                    </div>
                  )}
                </div>

                {!isActive && (
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ clipPath: HEX_CLIP }}
                  >
                    <Badge variant="secondary" className="text-xs">
                      Cashed Out
                    </Badge>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium leading-tight line-clamp-2">
                  {woo.title}
                </p>
                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {categoryLabels[woo.category] || woo.category}
                  </Badge>
                  {woo.estimated_value != null && (
                    <span className="text-xs text-muted-foreground">
                      ${Number(woo.estimated_value).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <WooOverlay woo={selectedWoo} onClose={() => setSelectedWoo(null)} />
    </>
  );
}
