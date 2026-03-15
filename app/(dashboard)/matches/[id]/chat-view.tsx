"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Send,
  ArrowLeftRight,
  Loader2,
  Bot,
  ArrowLeft,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  sendMessage,
  proposeTrade,
  getMatchDetails,
  getMessages,
  getMyActiveWoosForTrade,
  type MatchDetail,
  type MessageInfo,
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

function SmallHex({ image, title }: { image?: string; title: string }) {
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

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

type ProposalWoo = {
  id: string;
  title: string;
  images: string[];
  estimated_value: number | null;
};

function TradeProposalDialog({
  open,
  onOpenChange,
  myMatchedWoo,
  onPropose,
  proposing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myMatchedWoo: ProposalWoo;
  onPropose: (wooIds: string[]) => void;
  proposing: boolean;
}) {
  const [myWoos, setMyWoos] = useState<ProposalWoo[]>([]);
  const [selectedWooIds, setSelectedWooIds] = useState<string[]>([
    myMatchedWoo.id,
  ]);
  const [loadingWoos, setLoadingWoos] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);

  if (open && !lastOpen) {
    setLastOpen(true);
    setSelectedWooIds([myMatchedWoo.id]);
    setLoadingWoos(true);
    getMyActiveWoosForTrade().then((woos) => {
      setMyWoos(
        woos.map((w) => ({
          id: w.id,
          title: w.title,
          images: w.images,
          estimated_value: w.estimated_value,
        }))
      );
      setLoadingWoos(false);
    });
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  const selectedWoos = myWoos.filter((w) => selectedWooIds.includes(w.id));
  const availableToAdd = myWoos.filter(
    (w) => !selectedWooIds.includes(w.id)
  );
  const combinedValue = selectedWoos.reduce(
    (sum, w) => sum + (w.estimated_value ?? 0),
    0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Propose Trade</DialogTitle>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Your Woos in this trade</label>

            {loadingWoos ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                {selectedWoos.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center gap-2 rounded-lg border p-2"
                  >
                    <SmallHex image={w.images?.[0]} title={w.title} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{w.title}</p>
                      {w.estimated_value != null && (
                        <p className="text-xs text-muted-foreground">
                          ${Number(w.estimated_value).toFixed(2)}
                        </p>
                      )}
                    </div>
                    {selectedWooIds.length > 1 && (
                      <button
                        onClick={() =>
                          setSelectedWooIds((prev) =>
                            prev.filter((id) => id !== w.id)
                          )
                        }
                        className="p-1 rounded hover:bg-muted"
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                ))}

                {availableToAdd.length > 0 && (
                  <Select
                    value=""
                    onValueChange={(id) =>
                      setSelectedWooIds((prev) => [...prev, id])
                    }
                  >
                    <SelectTrigger className="w-full h-9 border-dashed">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Plus className="h-3.5 w-3.5" />
                        <span className="text-sm">Add another Woo</span>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {availableToAdd.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.title}
                          {w.estimated_value != null &&
                            ` ($${Number(w.estimated_value).toFixed(2)})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {selectedWoos.length > 1 && (
                  <p className="text-xs text-muted-foreground text-right">
                    Combined value: ${combinedValue.toFixed(2)}
                  </p>
                )}
              </div>
            )}
          </div>

          <Button
            className="w-full"
            onClick={() => onPropose(selectedWooIds)}
            disabled={proposing || selectedWooIds.length === 0}
          >
            {proposing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowLeftRight className="mr-2 h-4 w-4" />
            )}
            Propose Trade ({selectedWoos.length} Woo
            {selectedWoos.length !== 1 ? "s" : ""})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
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
  const [showProposalDialog, setShowProposalDialog] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageIdsRef = useRef(new Set(initialMessages.map((m) => m.id)));

  const isUserA = currentUserId === match.user_a_id;
  const myWoo = isUserA ? match.woo_a : match.woo_b;
  const theirWoo = isUserA ? match.woo_b : match.woo_a;
  const theirProfile = isUserA ? match.user_b : match.user_a;
  const isTradeCompleted = match.status === "trade_completed";
  const isUnavailable = match.status === "cancelled" || match.status === "trade_unavailable";
  const isInactive = isTradeCompleted || isUnavailable;
  const hasPendingTrade = match.active_trade?.status === "pending";

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const refreshMatch = useCallback(async () => {
    const [matchResult, messagesResult] = await Promise.all([
      getMatchDetails(match.id),
      getMessages(match.id),
    ]);
    if (matchResult.data) setMatch(matchResult.data);
    if (messagesResult.data) {
      setMessages(messagesResult.data);
      messageIdsRef.current = new Set(messagesResult.data.map((m) => m.id));
    }
  }, [match.id]);

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
  }, [match.id, refreshMatch]);

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

  async function handleProposeTrade(wooIds: string[]) {
    if (proposing) return;
    setProposing(true);

    try {
      const result = await proposeTrade(match.id, wooIds);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Trade proposed!");
      setShowProposalDialog(false);
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
          {isUnavailable && (
            <Badge variant="destructive">Woo Unavailable</Badge>
          )}
          {match.status === "trade_completed" && (
            <Badge variant="secondary">Traded</Badge>
          )}
          {!isInactive && !hasPendingTrade && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowProposalDialog(true)}
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

      {isUnavailable && (
        <div className="text-center py-3 border-t">
          <p className="text-sm text-destructive/70">
            This Woo has been traded. This match is no longer available.
          </p>
        </div>
      )}

      {myWoo && (
        <TradeProposalDialog
          open={showProposalDialog}
          onOpenChange={setShowProposalDialog}
          myMatchedWoo={{
            id: myWoo.id,
            title: myWoo.title,
            images: myWoo.images,
            estimated_value: myWoo.estimated_value,
          }}
          onPropose={handleProposeTrade}
          proposing={proposing}
        />
      )}
    </div>
  );
}
