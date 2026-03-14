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
import { Button } from "@/components/ui/button";
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { markAsShipped } from "./actions";

type Warehouse = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

type IntakeItem = {
  id: string;
  name: string;
  description: string | null;
  condition: string;
  category: string | null;
  status: string;
  photos: string[];
  shipping_label_url: string | null;
  intake_tracking_number: string | null;
  created_at: string;
  warehouses: Warehouse | null;
};

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: React.ElementType }
> = {
  requested: { label: "Requested", variant: "secondary", icon: Clock },
  label_generated: { label: "Label Ready", variant: "default", icon: Package },
  in_transit: { label: "In Transit", variant: "outline", icon: Truck },
  received: { label: "Received", variant: "secondary", icon: CheckCircle2 },
  verified: { label: "Verified", variant: "default", icon: CheckCircle2 },
  stored: { label: "Stored & Woo Minted", variant: "default", icon: CheckCircle2 },
};

const STEPS = [
  "requested",
  "label_generated",
  "in_transit",
  "received",
  "verified",
  "stored",
];

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

function ConditionLabel({ condition }: { condition: string }) {
  const labels: Record<string, string> = {
    new: "New",
    like_new: "Like New",
    good: "Good",
    fair: "Fair",
    poor: "Poor",
  };
  return <span>{labels[condition] || condition}</span>;
}

function IntakeCard({ item }: { item: IntakeItem }) {
  const [expanded, setExpanded] = useState(false);
  const [shipping, setShipping] = useState(false);
  const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.requested;
  const StatusIcon = config.icon;

  async function handleMarkShipped() {
    setShipping(true);
    try {
      const result = await markAsShipped(item.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Item marked as shipped!");
      }
    } finally {
      setShipping(false);
    }
  }

  return (
    <Card>
      <CardHeader
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {item.photos?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.photos[0]}
                  alt={item.name}
                  className="h-10 w-10 rounded object-cover"
                />
              )}
              {item.name}
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <ConditionLabel condition={item.condition} />
              {item.category && item.category !== "other" && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="capitalize">{item.category}</span>
                </>
              )}
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
          <StatusTimeline currentStatus={item.status} />

          {item.description && (
            <p className="text-sm text-muted-foreground">{item.description}</p>
          )}

          {item.photos && item.photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {item.photos.map((photo, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={photo}
                  alt={`${item.name} photo ${i + 1}`}
                  className="h-24 w-24 flex-shrink-0 rounded-md object-cover"
                />
              ))}
            </div>
          )}

          {item.warehouses && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MapPin className="h-4 w-4" />
                Ship to: {item.warehouses.name}
              </div>
              <p className="text-sm text-muted-foreground pl-6">
                {item.warehouses.address}
                <br />
                {item.warehouses.city}, {item.warehouses.state}{" "}
                {item.warehouses.zip}
              </p>
              {item.intake_tracking_number && (
                <p className="text-sm pl-6">
                  <span className="text-muted-foreground">Tracking: </span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {item.intake_tracking_number}
                  </code>
                </p>
              )}
            </div>
          )}

          {item.status === "label_generated" && (
            <div className="flex gap-2">
              <Button
                onClick={handleMarkShipped}
                disabled={shipping}
                className="flex-1"
              >
                <Truck className="mr-2 h-4 w-4" />
                {shipping ? "Updating..." : "I've Shipped This Item"}
              </Button>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Created {new Date(item.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

export function IntakeList({ items }: { items: IntakeItem[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No intakes yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Click &quot;New Intake&quot; to send in your first item and start
            trading.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <IntakeCard key={item.id} item={item} />
      ))}
    </div>
  );
}
