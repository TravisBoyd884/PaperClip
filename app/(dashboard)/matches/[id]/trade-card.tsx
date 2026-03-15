"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Check,
  X,
  Loader2,
  ArrowLeftRight,
  PartyPopper,
} from "lucide-react";
import { toast } from "sonner";
import { approveTrade, cancelTrade } from "../actions";
import type { TradeInfo, TradeWooInfo } from "../actions";

const HEX_CLIP =
  "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

function TinyHex({ image, title }: { image?: string; title: string }) {
  return (
    <div className="relative w-7 h-[32px] shrink-0">
      <div
        className="absolute inset-0 bg-border"
        style={{ clipPath: HEX_CLIP }}
      />
      <div
        className="absolute inset-[1.5px] overflow-hidden bg-muted"
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
          <div className="flex h-full w-full items-center justify-center text-muted-foreground text-[6px]">
            ?
          </div>
        )}
      </div>
    </div>
  );
}

function WooSide({ woos, label }: { woos: TradeWooInfo[]; label: string }) {
  const totalValue = woos.reduce(
    (sum, w) => sum + (w.estimated_value ?? 0),
    0
  );

  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <div className="flex -space-x-1">
        {woos.map((w) => (
          <TinyHex key={w.woo_id} image={w.images?.[0]} title={w.title} />
        ))}
      </div>
      <div className="text-center min-w-0">
        {woos.length === 1 ? (
          <p className="text-xs font-medium truncate max-w-[100px]">
            {woos[0].title}
          </p>
        ) : (
          <p className="text-xs font-medium">{woos.length} Woos</p>
        )}
        {totalValue > 0 && (
          <p className="text-[10px] text-muted-foreground">
            ${totalValue.toFixed(2)}
          </p>
        )}
      </div>
    </div>
  );
}

export function TradeCard({
  trade,
  currentUserId,
  userAId,
  onTradeUpdated,
}: {
  trade: TradeInfo;
  currentUserId: string;
  userAId: string;
  onTradeUpdated: () => void;
}) {
  const [loading, setLoading] = useState<"approve" | "cancel" | null>(null);

  const isUserA = currentUserId === userAId;
  const hasApproved = isUserA ? trade.approved_by_a : trade.approved_by_b;
  const otherApproved = isUserA ? trade.approved_by_b : trade.approved_by_a;
  const isCompleted = trade.status === "completed";
  const isCancelled = trade.status === "cancelled";

  const sideAWoos = trade.trade_woos.filter((tw) => tw.side === "a");
  const sideBWoos = trade.trade_woos.filter((tw) => tw.side === "b");
  const hasMultiWoo = trade.trade_woos.length > 2;

  async function handleApprove() {
    setLoading("approve");
    try {
      const result = await approveTrade(trade.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.completed) {
        toast.success("Trade completed! Woos have been swapped.");
      } else {
        toast.success("Trade approved! Waiting for the other party.");
      }
      onTradeUpdated();
    } finally {
      setLoading(null);
    }
  }

  async function handleCancel() {
    setLoading("cancel");
    try {
      const result = await cancelTrade(trade.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Trade cancelled.");
      onTradeUpdated();
    } finally {
      setLoading(null);
    }
  }

  if (isCompleted) {
    return (
      <Card className="mx-auto max-w-sm p-4 border-green-500/50 bg-green-500/5">
        <div className="flex flex-col items-center gap-2 text-center">
          <PartyPopper className="h-8 w-8 text-green-500" />
          <p className="text-sm font-semibold text-green-700 dark:text-green-400">
            Trade Completed!
          </p>
          {trade.trade_woos.length > 0 ? (
            <div className="flex items-center gap-3">
              <WooSide woos={sideAWoos} label="Side A" />
              <span className="text-lg text-muted-foreground">⇄</span>
              <WooSide woos={sideBWoos} label="Side B" />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Woos have been swapped
            </p>
          )}
        </div>
      </Card>
    );
  }

  if (isCancelled) {
    return (
      <Card className="mx-auto max-w-sm p-4 border-muted bg-muted/30">
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-sm text-muted-foreground">Trade Cancelled</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-sm p-4 border-primary/30 bg-primary/5">
      <div className="space-y-3">
        <div className="flex items-center justify-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">
            Trade Proposal{hasMultiWoo ? " (Multi-Woo)" : ""}
          </p>
        </div>

        {trade.trade_woos.length > 0 ? (
          <div className="flex items-center justify-center gap-4">
            <WooSide
              woos={sideAWoos}
              label={isUserA ? "Yours" : "Theirs"}
            />
            <span className="text-lg text-muted-foreground">⇄</span>
            <WooSide
              woos={sideBWoos}
              label={isUserA ? "Theirs" : "Yours"}
            />
          </div>
        ) : (
          <p className="text-xs text-center text-muted-foreground">
            Trade details loading...
          </p>
        )}

        <div className="flex items-center justify-center gap-4 text-xs">
          <span
            className={
              trade.approved_by_a
                ? "text-green-600 dark:text-green-400"
                : "text-muted-foreground"
            }
          >
            {trade.approved_by_a ? "✓" : "○"}{" "}
            {isUserA ? "You" : "Them"}
          </span>
          <span
            className={
              trade.approved_by_b
                ? "text-green-600 dark:text-green-400"
                : "text-muted-foreground"
            }
          >
            {trade.approved_by_b ? "✓" : "○"}{" "}
            {isUserA ? "Them" : "You"}
          </span>
        </div>

        {trade.status === "pending" && (
          <div className="flex gap-2 justify-center">
            {!hasApproved && (
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={loading !== null}
              >
                {loading === "approve" ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Check className="mr-1 h-3 w-3" />
                )}
                Approve
              </Button>
            )}
            {hasApproved && !otherApproved && (
              <p className="text-xs text-muted-foreground italic">
                Waiting for the other party...
              </p>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={loading !== null}
            >
              {loading === "cancel" ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <X className="mr-1 h-3 w-3" />
              )}
              Cancel
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
