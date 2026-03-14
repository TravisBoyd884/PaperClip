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
  User,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { markItemReceived, verifyItem, mintWoo } from "../actions";

type IntakeItem = {
  id: string;
  name: string;
  description: string | null;
  condition: string;
  category: string | null;
  status: string;
  photos: string[];
  intake_tracking_number: string | null;
  created_at: string;
  profiles: { id: string; username: string | null; avatar_url: string | null } | null;
};

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  in_transit: { label: "In Transit", variant: "outline" },
  received: { label: "Received", variant: "secondary" },
  verified: { label: "Verified", variant: "default" },
};

const CONDITION_LABELS: Record<string, string> = {
  new: "New",
  like_new: "Like New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

function IntakeItemCard({ item }: { item: IntakeItem }) {
  const [loading, setLoading] = useState(false);
  const [mintDialogOpen, setMintDialogOpen] = useState(false);
  const [estimatedValue, setEstimatedValue] = useState("");
  const badge = STATUS_BADGES[item.status] ?? STATUS_BADGES.in_transit;

  async function handleReceive() {
    setLoading(true);
    const result = await markItemReceived(item.id);
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success(`"${item.name}" marked as received`);
  }

  async function handleVerify() {
    setLoading(true);
    const result = await verifyItem(item.id);
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success(`"${item.name}" verified`);
  }

  async function handleMint() {
    setLoading(true);
    const value = estimatedValue ? parseFloat(estimatedValue) : undefined;
    const result = await mintWoo(item.id, value);
    setLoading(false);
    setMintDialogOpen(false);
    if (result.error) toast.error(result.error);
    else toast.success(`Woo minted for "${item.name}"`);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {item.photos?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.photos[0]}
                  alt={item.name}
                  className="h-16 w-16 rounded-md object-cover flex-shrink-0"
                />
              )}
              <div>
                <CardTitle className="text-base">{item.name}</CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <span>{CONDITION_LABELS[item.condition] ?? item.condition}</span>
                  {item.category && item.category !== "other" && (
                    <>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="capitalize">{item.category}</span>
                    </>
                  )}
                </CardDescription>
                {item.profiles && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    {item.profiles.username ?? "Unknown user"}
                  </div>
                )}
              </div>
            </div>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {item.description && (
            <p className="text-sm text-muted-foreground">{item.description}</p>
          )}

          {item.photos && item.photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {item.photos.map((photo, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={photo}
                  alt={`${item.name} photo ${i + 1}`}
                  className="h-20 w-20 flex-shrink-0 rounded-md object-cover"
                />
              ))}
            </div>
          )}

          {item.intake_tracking_number && (
            <p className="text-xs text-muted-foreground">
              Tracking:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                {item.intake_tracking_number}
              </code>
            </p>
          )}

          <div className="flex gap-2 pt-1">
            {item.status === "in_transit" && (
              <Button onClick={handleReceive} disabled={loading} size="sm">
                <Package className="mr-2 h-4 w-4" />
                {loading ? "Updating..." : "Mark Received"}
              </Button>
            )}
            {item.status === "received" && (
              <Button onClick={handleVerify} disabled={loading} size="sm">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {loading ? "Verifying..." : "Verify Item"}
              </Button>
            )}
            {item.status === "verified" && (
              <Button
                onClick={() => setMintDialogOpen(true)}
                disabled={loading}
                size="sm"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Mint Woo
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Submitted{" "}
            {new Date(item.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
        </CardContent>
      </Card>

      <Dialog open={mintDialogOpen} onOpenChange={setMintDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mint Woo for &quot;{item.name}&quot;</DialogTitle>
            <DialogDescription>
              This will create a tradeable Woo and make it available on the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="estimated-value">Estimated Value ($)</Label>
              <Input
                id="estimated-value"
                type="number"
                step="0.01"
                min="0"
                placeholder="Optional"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Used for sorting and filtering. Leave blank to skip.
              </p>
            </div>
            <Button onClick={handleMint} disabled={loading} className="w-full">
              <Sparkles className="mr-2 h-4 w-4" />
              {loading ? "Minting..." : "Mint Woo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function IntakeItemList({ items }: { items: IntakeItem[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Truck className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No pending intakes</h3>
          <p className="text-sm text-muted-foreground mt-1">
            All incoming items have been processed.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <IntakeItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}
