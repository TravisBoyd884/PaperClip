"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SSE_URL = "http://localhost:3001/api/events";

const AGENT_COLORS: Record<string, string> = {
  Claude: "#e97451",
  GPT: "#10a37f",
  Gemini: "#4285f4",
  Llama: "#7c3aed",
};

const AGENT_STROKE: Record<string, string> = {
  Claude: "stroke-orange-500",
  GPT: "stroke-emerald-500",
  Gemini: "stroke-blue-500",
  Llama: "stroke-violet-500",
};

const AGENT_BG: Record<string, string> = {
  Claude: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  GPT: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Gemini: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  Llama: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

interface AgentEvent {
  type: string;
  agent: string;
  detail: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

interface AgentSummary {
  name: string;
  model: string;
  phase: string;
  swipesDone: number;
  tradesDone: number;
  valueHistory: { trades: number; value: number }[];
  preferences: { wants: string[]; willing_to_trade: string[] };
}

type EventIcon = "swipe" | "match" | "message" | "trade_proposed" | "trade_approved" | "trade_completed" | "phase" | "round" | "error" | "init" | "value_update";

function eventIcon(type: string): string {
  const icons: Record<string, string> = {
    swipe: "👆",
    match: "💘",
    message: "💬",
    trade_proposed: "🤝",
    trade_approved: "✅",
    trade_completed: "🎉",
    phase: "⚙️",
    round: "🔄",
    error: "❌",
    value_update: "📊",
  };
  return icons[type] ?? "📌";
}

function phaseLabel(phase: string): string {
  return { swipe: "Swiping", matches: "Chatting", approve: "Reviewing Trades" }[phase] ?? phase;
}

// ---------------------------------------------------------------------------
// SVG Chart
// ---------------------------------------------------------------------------

function ValueChart({ agents }: { agents: AgentSummary[] }) {
  const agentsWithHistory = agents.filter((a) => a.valueHistory.length > 0);
  if (agentsWithHistory.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Waiting for trade data...
      </div>
    );
  }

  const allValues = agentsWithHistory.flatMap((a) => a.valueHistory.map((v) => v.value));
  const allTrades = agentsWithHistory.flatMap((a) => a.valueHistory.map((v) => v.trades));

  const minVal = Math.min(...allValues) * 0.9;
  const maxVal = Math.max(...allValues) * 1.1;
  const maxTrades = Math.max(...allTrades, 1);

  const W = 600;
  const H = 250;
  const PAD = { top: 20, right: 20, bottom: 35, left: 55 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const scaleX = (t: number) => PAD.left + (t / maxTrades) * plotW;
  const scaleY = (v: number) => PAD.top + plotH - ((v - minVal) / (maxVal - minVal || 1)) * plotH;

  const yTicks = 5;
  const yStep = (maxVal - minVal) / yTicks;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* Grid lines */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const val = minVal + i * yStep;
        const y = scaleY(val);
        return (
          <g key={i}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} className="stroke-muted-foreground/20" strokeWidth={0.5} />
            <text x={PAD.left - 8} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
              ${Math.round(val)}
            </text>
          </g>
        );
      })}

      {/* X axis ticks */}
      {Array.from({ length: Math.min(maxTrades + 1, 11) }, (_, i) => {
        const t = Math.round((i / Math.min(maxTrades, 10)) * maxTrades);
        const x = scaleX(t);
        return (
          <g key={i}>
            <line x1={x} y1={PAD.top} x2={x} y2={H - PAD.bottom} className="stroke-muted-foreground/10" strokeWidth={0.5} />
            <text x={x} y={H - PAD.bottom + 16} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {t}
            </text>
          </g>
        );
      })}

      {/* Axis labels */}
      <text x={W / 2} y={H - 4} textAnchor="middle" className="fill-muted-foreground text-[11px]">
        Trades Completed
      </text>
      <text
        x={12}
        y={H / 2}
        textAnchor="middle"
        transform={`rotate(-90, 12, ${H / 2})`}
        className="fill-muted-foreground text-[11px]"
      >
        Inventory Value ($)
      </text>

      {/* Lines */}
      {agentsWithHistory.map((agent) => {
        if (agent.valueHistory.length < 1) return null;
        const points = agent.valueHistory.map((v) => `${scaleX(v.trades)},${scaleY(v.value)}`).join(" ");
        const color = AGENT_COLORS[agent.name] ?? "#888";
        return (
          <g key={agent.name}>
            <polyline
              points={points}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {agent.valueHistory.map((v, i) => (
              <circle
                key={i}
                cx={scaleX(v.trades)}
                cy={scaleY(v.value)}
                r={3.5}
                fill={color}
                className="opacity-80"
              />
            ))}
          </g>
        );
      })}

      {/* Legend */}
      {agentsWithHistory.map((agent, i) => {
        const color = AGENT_COLORS[agent.name] ?? "#888";
        const x = PAD.left + i * 100;
        return (
          <g key={agent.name}>
            <rect x={x} y={4} width={12} height={12} rx={2} fill={color} className="opacity-80" />
            <text x={x + 16} y={14} className="fill-foreground text-[10px] font-medium">
              {agent.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const addEvent = useCallback((event: AgentEvent) => {
    setEvents((prev) => {
      const next = [...prev, event];
      return next.length > 200 ? next.slice(-200) : next;
    });
  }, []);

  useEffect(() => {
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      const es = new EventSource(SSE_URL);
      eventSourceRef.current = es;

      es.onopen = () => setConnected(true);

      es.onmessage = (e) => {
        try {
          const event: AgentEvent = JSON.parse(e.data);

          if (event.type === "init" && event.data) {
            const initAgents = event.data.agents as AgentSummary[];
            const initEvents = event.data.recentEvents as AgentEvent[];
            if (initAgents) setAgents(initAgents);
            if (initEvents) setEvents(initEvents.filter((ev) => ev.type !== "init"));
            return;
          }

          if (event.type === "round" && event.data?.agents) {
            setAgents(event.data.agents as AgentSummary[]);
          }

          if (event.type === "value_update" && event.data?.history) {
            setAgents((prev) =>
              prev.map((a) =>
                a.name === event.agent
                  ? { ...a, valueHistory: event.data!.history as { trades: number; value: number }[] }
                  : a
              )
            );
          }

          if (event.type !== "init") {
            addEvent(event);
          }
        } catch {}
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        retryTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      eventSourceRef.current?.close();
      clearTimeout(retryTimeout);
    };
  }, [addEvent]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events]);

  const displayEvents = events.filter((e) => e.type !== "phase" && e.type !== "value_update");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Live view of autonomous trading agents
          </p>
        </div>
        <Badge variant={connected ? "default" : "outline"} className={connected ? "bg-emerald-600" : ""}>
          {connected ? "Connected" : "Disconnected"}
        </Badge>
      </div>

      {!connected && agents.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-lg font-medium mb-2">Agent Runner Not Active</p>
            <p className="text-muted-foreground mb-4">
              Start the agent runner to see live trading activity.
            </p>
            <code className="bg-muted px-3 py-1.5 rounded-md text-sm font-mono">
              pnpm agents
            </code>
          </CardContent>
        </Card>
      )}

      {/* Agent Cards */}
      {agents.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {agents.map((agent) => (
            <Card key={agent.name} size="sm">
              <CardHeader className="pb-0">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: AGENT_COLORS[agent.name] ?? "#888" }}
                  />
                  <CardTitle className="text-sm">{agent.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <Badge variant="outline" className={`mb-2 text-[10px] ${AGENT_BG[agent.name] ?? ""}`}>
                  {phaseLabel(agent.phase)}
                </Badge>
                <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  <div>Swipes</div>
                  <div className="font-medium text-foreground text-right">{agent.swipesDone}</div>
                  <div>Trades</div>
                  <div className="font-medium text-foreground text-right">{agent.tradesDone}</div>
                  <div>Value</div>
                  <div className="font-medium text-foreground text-right">
                    ${agent.valueHistory.length > 0
                      ? agent.valueHistory[agent.valueHistory.length - 1].value.toFixed(0)
                      : "—"}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Value Chart */}
      {agents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Inventory Value Over Trades</CardTitle>
          </CardHeader>
          <CardContent>
            <ValueChart agents={agents} />
          </CardContent>
        </Card>
      )}

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Feed</CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={feedRef} className="h-80 overflow-y-auto space-y-1 font-mono text-xs">
            {displayEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                {connected ? "Waiting for agent activity..." : "Connect to the agent runner to see events"}
              </p>
            ) : (
              displayEvents.map((event, i) => {
                const time = new Date(event.timestamp).toLocaleTimeString("en-US", { hour12: false });
                const color = AGENT_COLORS[event.agent];
                return (
                  <div key={i} className="flex gap-2 py-0.5 hover:bg-muted/50 rounded px-1 items-start">
                    <span className="text-muted-foreground shrink-0 w-16">{time}</span>
                    <span className="shrink-0 w-5 text-center">{eventIcon(event.type)}</span>
                    <span
                      className="font-semibold shrink-0 w-14"
                      style={{ color: color ?? "inherit" }}
                    >
                      {event.agent === "system" ? "SYS" : event.agent}
                    </span>
                    <span className="text-foreground break-words min-w-0">{event.detail}</span>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
