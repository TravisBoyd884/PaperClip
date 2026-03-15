"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  ArrowLeftRight,
  Loader2,
  Bot,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  sendMessage,
  proposeTrade,
  getMatchDetails,
  getMessages,
  type MatchDetail,
  type MessageInfo,
  type TradeInfo,
} from "../actions";
import { TradeCard } from "./trade-card";

const HEX_CLIP =
  "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

function MiniHex({ image, title }: { image?: string; title: string }) {
  return (
    <div className="relative w-10 h-[46px] shrink-0">
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

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatView({
  match: initialMatch,
  initialMessages,
  currentUserId,
}: {
  match: MatchDetail;
  initialMessages: MessageInfo[];
  currentUserId: string;
}) {
  const [match, setMatch] = useState(initialMatch);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [proposing, setProposing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageIdsRef = useRef(new Set(initialMessages.map((m) => m.id)));

  const isUserA = currentUserId === match.user_a_id;
  const myWoo = isUserA ? match.woo_a : match.woo_b;
  const theirWoo = isUserA ? match.woo_b : match.woo_a;
  const theirProfile = isUserA ? match.user_b : match.user_a;
  const isTradeCompleted = match.status === "trade_completed";
  const isCancelled = match.status === "cancelled";
  const isInactive = isTradeCompleted || isCancelled;
  const hasPendingTrade = match.active_trade?.status === "pending";

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Supabase Realtime Broadcast subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`match:${match.id}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "new_message" }, (payload) => {
        const msg = payload.payload as MessageInfo;
        if (!messageIdsRef.current.has(msg.id)) {
          messageIdsRef.current.add(msg.id);
          setMessages((prev) => [...prev, msg]);
        }
      })
      .on("broadcast", { event: "trade_update" }, () => {
        refreshMatch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [match.id]);

  async function refreshMatch() {
    const [matchResult, messagesResult] = await Promise.all([
      getMatchDetails(match.id),
      getMessages(match.id),
    ]);
    if (matchResult.data) setMatch(matchResult.data);
    if (messagesResult.data) {
      setMessages(messagesResult.data);
      messageIdsRef.current = new Set(messagesResult.data.map((m) => m.id));
    }
  }

  async function broadcastMessage(msg: MessageInfo) {
    const supabase = createClient();
    const channel = supabase.channel(`match:${match.id}`);
    await channel.send({
      type: "broadcast",
      event: "new_message",
      payload: msg,
    });
  }

  async function broadcastTradeUpdate() {
    const supabase = createClient();
    const channel = supabase.channel(`match:${match.id}`);
    await channel.send({
      type: "broadcast",
      event: "trade_update",
      payload: {},
    });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    setSending(true);
    const content = input.trim();
    setInput("");

    try {
      const result = await sendMessage(match.id, content);
      if (result.error) {
        toast.error(result.error);
        setInput(content);
        return;
      }
      if (result.data) {
        if (!messageIdsRef.current.has(result.data.id)) {
          messageIdsRef.current.add(result.data.id);
          setMessages((prev) => [...prev, result.data!]);
        }
        broadcastMessage(result.data);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleProposeTrade() {
    if (proposing) return;
    setProposing(true);

    try {
      const result = await proposeTrade(match.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Trade proposed!");
      await refreshMatch();
      broadcastTradeUpdate();
    } finally {
      setProposing(false);
    }
  }

  function handleTradeUpdated() {
    refreshMatch();
    broadcastTradeUpdate();
  }

  return (
    <div className="flex flex-col h-[calc(100svh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b pb-4 mb-4">
        <Button variant="ghost" size="icon" asChild className="shrink-0">
          <Link href="/matches">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <MiniHex
            image={theirWoo?.images?.[0]}
            title={theirWoo?.title ?? ""}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">
                {theirProfile.username ?? "Unknown"}
              </span>
              {theirProfile.is_agent && (
                <Bot className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {theirWoo?.title} ⇄ {myWoo?.title}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isCancelled && (
            <Badge variant="destructive">Woo Unavailable</Badge>
          )}
          {match.status === "trade_completed" && (
            <Badge variant="secondary">Traded</Badge>
          )}
          {!isInactive && !hasPendingTrade && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleProposeTrade}
              disabled={proposing}
            >
              {proposing ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <ArrowLeftRight className="mr-1 h-3 w-3" />
              )}
              Propose Trade
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">
              No messages yet. Say hi!
            </p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.message_type === "system") {
            return (
              <div key={msg.id} className="text-center">
                <span className="text-xs text-muted-foreground italic">
                  {msg.content}
                </span>
              </div>
            );
          }

          if (
            msg.message_type === "trade_proposal" ||
            msg.message_type === "trade_approval"
          ) {
            if (msg.message_type === "trade_proposal" && match.active_trade) {
              let tradeId: string | undefined;
              try {
                tradeId = JSON.parse(msg.content).trade_id;
              } catch {
                tradeId = undefined;
              }

              if (tradeId === match.active_trade.id) {
                return (
                  <div key={msg.id} className="py-2">
                    <TradeCard
                      trade={match.active_trade}
                      currentUserId={currentUserId}
                      userAId={match.user_a_id}
                      wooATitle={match.woo_a?.title ?? "Woo A"}
                      wooBTitle={match.woo_b?.title ?? "Woo B"}
                      onTradeUpdated={handleTradeUpdated}
                    />
                  </div>
                );
              }
            }

            if (msg.message_type === "trade_approval") {
              return (
                <div key={msg.id} className="text-center">
                  <span className="text-xs text-muted-foreground italic">
                    {msg.sender_id === currentUserId ? "You" : (msg.sender?.username ?? "They")} approved the trade
                  </span>
                </div>
              );
            }

            return null;
          }

          const isMine = msg.sender_id === currentUserId;

          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                  isMine
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted rounded-bl-md"
                }`}
              >
                {!isMine && msg.sender && (
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-[10px] font-medium opacity-70">
                      {msg.sender.username ?? "Unknown"}
                    </span>
                    {msg.sender.is_agent && (
                      <Bot className="h-2.5 w-2.5 opacity-70" />
                    )}
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                <p
                  className={`text-[10px] mt-1 ${
                    isMine ? "text-primary-foreground/60" : "text-muted-foreground"
                  }`}
                >
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {!isInactive && (
        <form onSubmit={handleSend} className="flex gap-2 pt-2 border-t">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={sending}
            autoFocus
          />
          <Button type="submit" size="icon" disabled={sending || !input.trim()}>
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      )}

      {isTradeCompleted && (
        <div className="text-center py-3 border-t">
          <p className="text-sm text-muted-foreground">
            This trade has been completed. Woos have been swapped!
          </p>
        </div>
      )}

      {isCancelled && (
        <div className="text-center py-3 border-t">
          <p className="text-sm text-destructive/70">
            This Woo has been traded. This match is no longer available.
          </p>
        </div>
      )}
    </div>
  );
}
