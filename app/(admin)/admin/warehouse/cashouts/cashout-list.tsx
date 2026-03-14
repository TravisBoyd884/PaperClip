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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Package,
  Truck,
  CheckCircle2,
  MapPin,
  User,
} from "lucide-react";
import { toast } from "sonner";
import {
  startCashoutProcessing,
  shipCashout,
  markCashoutDelivered,
  completeCashout,
} from "../actions";

type CashoutItem = {
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
  woos: {
    id: string;
    title: string;
    images: string[];
    items: {
      id: string;
      name: string;
      warehouse_id: string;
      warehouses: { name: string } | null;
    };
  } | null;
  profiles: { id: string; username: string | null } | null;
};

const STATUS_BADGES: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  requested: { label: "Requested", variant: "outline" },
  processing: { label: "Processing", variant: "secondary" },
  shipped: { label: "Shipped", variant: "default" },
  delivered: { label: "Delivered", variant: "default" },
  completed: { label: "Completed", variant: "default" },
};

const CARRIERS = [
  { value: "usps", label: "USPS" },
  { value: "ups", label: "UPS" },
  { value: "fedex", label: "FedEx" },
  { value: "dhl", label: "DHL" },
  { value: "other", label: "Other" },
];

function CashoutCard({ cashout }: { cashout: CashoutItem }) {
  const [loading, setLoading] = useState(false);
  const [shipDialogOpen, setShipDialogOpen] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const badge = STATUS_BADGES[cashout.status] ?? STATUS_BADGES.requested;
  const addr = cashout.shipping_address;

  async function handleStartProcessing() {
    setLoading(true);
    const result = await startCashoutProcessing(cashout.id);
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success("Cashout processing started");
  }

  async function handleShip() {
    if (!trackingNumber.trim() || !carrier) {
      toast.error("Please enter tracking number and carrier");
      return;
    }
    setLoading(true);
    const result = await shipCashout(cashout.id, trackingNumber.trim(), carrier);
    setLoading(false);
    setShipDialogOpen(false);
    if (result.error) toast.error(result.error);
    else toast.success("Item shipped and Woo burned");
  }

  async function handleDelivered() {
    setLoading(true);
    const result = await markCashoutDelivered(cashout.id);
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success("Marked as delivered");
  }

  async function handleComplete() {
    setLoading(true);
    const result = await completeCashout(cashout.id);
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success("Cashout completed");
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {cashout.woos?.images?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cashout.woos.images[0]}
                  alt={cashout.woos.title}
                  className="h-14 w-14 rounded-md object-cover flex-shrink-0"
                />
              )}
              <div>
                <CardTitle className="text-base">
                  {cashout.woos?.title ?? "Unknown Woo"}
                </CardTitle>
                <CardDescription className="mt-1">
                  {cashout.woos?.items?.name ?? "Unknown item"}
                </CardDescription>
                {cashout.profiles && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    {cashout.profiles.username ?? "Unknown user"}
                  </div>
                )}
              </div>
            </div>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border p-3 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4" />
              Ship To
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
            <p className="text-xs text-muted-foreground">
              Tracking ({cashout.carrier?.toUpperCase()}):{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                {cashout.tracking_number}
              </code>
            </p>
          )}

          <div className="flex gap-2 pt-1">
            {cashout.status === "requested" && (
              <Button onClick={handleStartProcessing} disabled={loading} size="sm">
                <Package className="mr-2 h-4 w-4" />
                {loading ? "Processing..." : "Start Processing"}
              </Button>
            )}
            {cashout.status === "processing" && (
              <Button
                onClick={() => setShipDialogOpen(true)}
                disabled={loading}
                size="sm"
              >
                <Truck className="mr-2 h-4 w-4" />
                Ship Item
              </Button>
            )}
            {cashout.status === "shipped" && (
              <Button onClick={handleDelivered} disabled={loading} size="sm">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {loading ? "Updating..." : "Mark Delivered"}
              </Button>
            )}
            {cashout.status === "delivered" && (
              <Button onClick={handleComplete} disabled={loading} size="sm">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {loading ? "Completing..." : "Complete"}
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Requested{" "}
            {new Date(cashout.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
        </CardContent>
      </Card>

      <Dialog open={shipDialogOpen} onOpenChange={setShipDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ship Item</DialogTitle>
            <DialogDescription>
              Enter tracking details. This will burn the associated Woo and mark the item as shipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Carrier</Label>
              <Select value={carrier} onValueChange={setCarrier}>
                <SelectTrigger>
                  <SelectValue placeholder="Select carrier..." />
                </SelectTrigger>
                <SelectContent>
                  {CARRIERS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tracking">Tracking Number</Label>
              <Input
                id="tracking"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="e.g. 1Z999AA10123456784"
              />
            </div>
            <Button
              onClick={handleShip}
              disabled={loading || !carrier || !trackingNumber.trim()}
              className="w-full"
            >
              <Truck className="mr-2 h-4 w-4" />
              {loading ? "Shipping..." : "Confirm Shipment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CashoutList({ cashouts }: { cashouts: CashoutItem[] }) {
  if (cashouts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Truck className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No cash out requests</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Cash out requests from users will appear here.
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
