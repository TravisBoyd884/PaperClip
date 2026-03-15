"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, X } from "lucide-react";
import { toast } from "sonner";
import { dismissMatch } from "./actions";
import type { MatchSummary } from "@/lib/trading";

const HEX_CLIP =
  "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function MiniHex({ image, title }: { image?: string; title: string }) {
  return (
    <div className="relative w-8 h-[37px] sm:w-12 sm:h-14 shrink-0">
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
          <div className="flex h-full w-full items-center justify-center text-muted-foreground text-[8px]">
            ?
          </div>
        )}
      </div>
    </div>
  );
}

function DismissButton({ matchId, onDismissed }: { matchId: string; onDismissed: (id: string) => void }) {
  const [dismissing, setDismissing] = useState(false);

  async function handleDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (dismissing) return;
    setDismissing(true);
    onDismissed(matchId);

    const result = await dismissMatch(matchId);
    if (result.error) {
      toast.error(result.error);
    }
    setDismissing(false);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
      onClick={handleDismiss}
      disabled={dismissing}
    >
      <X className="h-3.5 w-3.5" />
    </Button>
  );
}

export function MatchList({
  matches: initialMatches,
  currentUserId,
}: {
  matches: MatchSummary[];
  currentUserId: string;
}) {
  const [matches, setMatches] = useState(initialMatches);

  function handleDismissed(matchId: string) {
    setMatches((prev) => prev.filter((m) => m.id !== matchId));
  }

  return (
    <div className="space-y-3">
      {matches.map((match) => {
        const isUserA = match.user_a_id === currentUserId;
        const myWoo = isUserA ? match.woo_a : match.woo_b;
        const theirWoo = isUserA ? match.woo_b : match.woo_a;
        const lastActivity =
          match.last_message?.created_at ?? match.created_at;

        if (match.woo_unavailable) {
          return (
            <div
              key={match.id}
              className="group flex items-center gap-2 sm:gap-4 rounded-xl border border-destructive/30 p-2 sm:p-4 opacity-60"
            >
              <div className="flex items-center gap-2 grayscale">
                <MiniHex
                  image={theirWoo?.images?.[0]}
                  title={theirWoo?.title ?? ""}
                />
                <span className="text-muted-foreground text-xs">⇄</span>
                <MiniHex
                  image={myWoo?.images?.[0]}
                  title={myWoo?.title ?? ""}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-xs sm:text-sm font-medium truncate">
                    {match.counterparty.username ?? "Unknown"}
                  </span>
                  {match.counterparty.is_agent && (
                    <Bot className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                  <Badge
                    variant="destructive"
                    className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0 shrink-0"
                  >
                    Unavailable
                  </Badge>
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate mt-0.5">
                  {theirWoo?.title}
                  {" ⇄ "}
                  {myWoo?.title}
                </p>
                <p className="text-[10px] sm:text-xs text-destructive/70 mt-0.5 hidden sm:block">
                  This Woo has been traded
                </p>
              </div>

              <DismissButton matchId={match.id} onDismissed={handleDismissed} />
            </div>
          );
        }

        return (
          <Link
            key={match.id}
            href={`/matches/${match.id}`}
            className="group flex items-center gap-2 sm:gap-4 rounded-xl border p-2 sm:p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-2">
              <MiniHex
                image={theirWoo?.images?.[0]}
                title={theirWoo?.title ?? ""}
              />
              <span className="text-muted-foreground text-xs">⇄</span>
              <MiniHex
                image={myWoo?.images?.[0]}
                title={myWoo?.title ?? ""}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-xs sm:text-sm font-medium truncate">
                  {match.counterparty.username ?? "Unknown"}
                </span>
                {match.counterparty.is_agent && (
                  <Bot className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
                {match.status === "trade_proposed" && (
                  <Badge
                    variant="secondary"
                    className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0 shrink-0"
                  >
                    Trade
                  </Badge>
                )}
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate mt-0.5">
                {theirWoo?.title}
                {" ⇄ "}
                {myWoo?.title}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate mt-0.5 hidden sm:block">
                {match.last_message
                  ? match.last_message.content.length > 60
                    ? match.last_message.content.slice(0, 60) + "..."
                    : match.last_message.content
                  : "No messages yet"}
              </p>
            </div>

            <span className="text-[9px] sm:text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
              {timeAgo(lastActivity)}
            </span>

            <DismissButton matchId={match.id} onDismissed={handleDismissed} />
          </Link>
        );
      })}
    </div>
  );
}
