"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, LogOut } from "lucide-react";
import type { Woo } from "./woo-grid";

export function WooOverlay({
  woo,
  onClose,
}: {
  woo: Woo | null;
  onClose: () => void;
}) {
  const router = useRouter();

  if (!woo) return null;

  return (
    <Dialog open={!!woo} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">{woo.title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-5 py-2">
          <div
            className="w-40 aspect-[1/1.15] overflow-hidden"
            style={{
              clipPath:
                "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
            }}
          >
            {woo.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={woo.images[0]}
                alt={woo.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground text-sm">
                No image
              </div>
            )}
          </div>

          {woo.estimated_value != null && (
            <Badge variant="secondary">
              ${Number(woo.estimated_value).toFixed(2)}
            </Badge>
          )}

          <div className="flex w-full gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                onClose();
                router.push(`/woos/${woo.id}`);
              }}
            >
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                onClose();
                router.push(`/cashout?woo=${woo.id}`);
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Cash Out
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
