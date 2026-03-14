"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";
import type { MatchSummary } from "./actions";

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
    <div className="relative w-12 h-14 shrink-0">
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

export function MatchList({
  matches,
  currentUserId,
}: {
  matches: MatchSummary[];
  currentUserId: string;
}) {
  return (
    <div className="space-y-3">
      {matches.map((match) => {
        const isUserA = match.user_a_id === currentUserId;
        const myWoo = isUserA ? match.woo_a : match.woo_b;
        const theirWoo = isUserA ? match.woo_b : match.woo_a;
        const lastActivity =
          match.last_message?.created_at ?? match.created_at;

        return (
          <Link
            key={match.id}
            href={`/matches/${match.id}`}
            className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent/50"
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
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">
                  {match.counterparty.username ?? "Unknown"}
                </span>
                {match.counterparty.is_agent && (
                  <Bot className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
                {match.status === "trade_proposed" && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 shrink-0"
                  >
                    Trade Proposed
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {theirWoo?.title}
                {" ⇄ "}
                {myWoo?.title}
              </p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {match.last_message
                  ? match.last_message.content.length > 60
                    ? match.last_message.content.slice(0, 60) + "..."
                    : match.last_message.content
                  : "No messages yet"}
              </p>
            </div>

            <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
              {timeAgo(lastActivity)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
