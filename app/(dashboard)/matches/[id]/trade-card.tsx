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
import type { TradeInfo } from "../actions";

export function TradeCard({
  trade,
  currentUserId,
  userAId,
  wooATitle,
  wooBTitle,
  onTradeUpdated,
}: {
  trade: TradeInfo;
  currentUserId: string;
  userAId: string;
  wooATitle: string;
  wooBTitle: string;
  onTradeUpdated: () => void;
}) {
  const [loading, setLoading] = useState<"approve" | "cancel" | null>(null);

  const isUserA = currentUserId === userAId;
  const hasApproved = isUserA ? trade.approved_by_a : trade.approved_by_b;
  const otherApproved = isUserA ? trade.approved_by_b : trade.approved_by_a;
  const isCompleted = trade.status === "completed";
  const isCancelled = trade.status === "cancelled";

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
          <p className="text-xs text-muted-foreground">
            {wooATitle} ⇄ {wooBTitle}
          </p>
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
          <p className="text-sm font-semibold">Trade Proposal</p>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          {wooATitle} ⇄ {wooBTitle}
        </p>

        <div className="flex items-center justify-center gap-4 text-xs">
          <span
            className={
              trade.approved_by_a
                ? "text-green-600 dark:text-green-400"
                : "text-muted-foreground"
            }
          >
            {trade.approved_by_a ? "✓" : "○"} User A
          </span>
          <span
            className={
              trade.approved_by_b
                ? "text-green-600 dark:text-green-400"
                : "text-muted-foreground"
            }
          >
            {trade.approved_by_b ? "✓" : "○"} User B
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
