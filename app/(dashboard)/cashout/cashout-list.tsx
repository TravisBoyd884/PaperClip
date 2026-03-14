"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Package,
  Truck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MapPin,
} from "lucide-react";

type CashoutEntry = {
  id: string;
  status: string;
  tracking_number: string | null;
  carrier: string | null;
  shipping_address: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  created_at: string;
  updated_at: string;
  woos: { id: string; title: string; images: string[] } | null;
};

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: React.ElementType }
> = {
  requested: { label: "Requested", variant: "secondary", icon: Clock },
  processing: { label: "Processing", variant: "outline", icon: Package },
  shipped: { label: "Shipped", variant: "default", icon: Truck },
  delivered: { label: "Delivered", variant: "default", icon: CheckCircle2 },
  completed: { label: "Completed", variant: "default", icon: CheckCircle2 },
};

const STEPS = ["requested", "processing", "shipped", "delivered", "completed"];

function StatusTimeline({ currentStatus }: { currentStatus: string }) {
  const currentIndex = STEPS.indexOf(currentStatus);

  return (
    <div className="flex items-center gap-1 py-2">
      {STEPS.map((step, i) => {
        const isCompleted = i <= currentIndex;
        const config = STATUS_CONFIG[step];
        return (
          <div key={step} className="flex items-center">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                isCompleted
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
              title={config?.label || step}
            >
              {i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-6 transition-colors ${
                  i < currentIndex ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CashoutCard({ cashout }: { cashout: CashoutEntry }) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[cashout.status] ?? STATUS_CONFIG.requested;
  const StatusIcon = config.icon;
  const addr = cashout.shipping_address;

  return (
    <Card>
      <CardHeader
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {cashout.woos?.images?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cashout.woos.images[0]}
                  alt={cashout.woos.title}
                  className="h-10 w-10 rounded object-cover"
                />
              )}
              {cashout.woos?.title ?? "Unknown Woo"}
            </CardTitle>
            <CardDescription>
              Cash out requested{" "}
              {new Date(cashout.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={config.variant}>
              <StatusIcon className="mr-1 h-3 w-3" />
              {config.label}
            </Badge>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 border-t pt-4">
          <StatusTimeline currentStatus={cashout.status} />

          <div className="rounded-md border p-3 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4" />
              Shipping To
            </div>
            <p className="text-sm text-muted-foreground pl-6">
              {addr?.street && <>{addr.street}<br /></>}
              {[addr?.city, addr?.state, addr?.zip]
                .filter(Boolean)
                .join(", ")}
              {addr?.country && addr.country !== "US" && (
                <><br />{addr.country}</>
              )}
            </p>
          </div>

          {cashout.tracking_number && (
            <p className="text-sm">
              <span className="text-muted-foreground">
                Tracking ({cashout.carrier?.toUpperCase()}):{" "}
              </span>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {cashout.tracking_number}
              </code>
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function CashoutStatusList({ cashouts }: { cashouts: CashoutEntry[] }) {
  if (cashouts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Truck className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No cash outs yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            When you&apos;re ready to receive a physical item, click &quot;Request
            Cash Out&quot; to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {cashouts.map((cashout) => (
        <CashoutCard key={cashout.id} cashout={cashout} />
      ))}
    </div>
  );
}
