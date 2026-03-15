"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WooOverlay } from "./woo-overlay";

export type Woo = {
  id: string;
  title: string;
  description: string | null;
  images: string[];
  estimated_value: number | null;
  category: string;
  trade_count: number;
  status: string;
  condition: string;
};

const conditionLabels: Record<string, string> = {
  new: "New",
  like_new: "Like New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};


export function WooGrid({ woos }: { woos: Woo[] }) {
  const [selectedWoo, setSelectedWoo] = useState<Woo | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {woos.map((woo) => {
          const isActive = woo.status === "active";
          return (
            <button
              key={woo.id}
              onClick={() => isActive && setSelectedWoo(woo)}
              className={`text-left transition-transform ${
                isActive
                  ? "cursor-pointer hover:scale-[1.02]"
                  : "cursor-default opacity-50"
              }`}
            >
              <Card className="overflow-hidden shadow-sm">
                <div className="relative aspect-[4/3] w-full overflow-hidden">
                  {woo.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={woo.images[0]}
                      alt={woo.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground text-sm">
                      No image
                    </div>
                  )}

                  {!isActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Badge variant="secondary" className="text-xs">
                        Cashed Out
                      </Badge>
                    </div>
                  )}
                </div>

                <CardHeader className="pb-0">
                  <CardTitle className="line-clamp-1 text-sm sm:text-base">
                    {woo.title}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-2">
                  {woo.description && (
                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                      {woo.description}
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {conditionLabels[woo.condition] ?? woo.condition}
                    </Badge>
                    {woo.estimated_value != null && (
                      <span className="text-[10px] sm:text-xs text-muted-foreground">
                        ${Number(woo.estimated_value).toFixed(2)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      <WooOverlay woo={selectedWoo} onClose={() => setSelectedWoo(null)} />
    </>
  );
}
