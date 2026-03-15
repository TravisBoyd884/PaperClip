"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Heart, MessageSquare } from "lucide-react";

const HEX_CLIP =
  "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

type MatchedData = {
  match_id: string;
  your_woo: { title: string; images: string[] };
  their_woo: { title: string; images: string[] };
};

export function MatchModal({
  data,
  onClose,
}: {
  data: MatchedData | null;
  onClose: () => void;
}) {
  const router = useRouter();

  if (!data) return null;

  return (
    <Dialog open={!!data} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[90vw] sm:max-w-md text-center">
        <DialogTitle className="sr-only">It&apos;s a Match!</DialogTitle>

        <div className="space-y-4 sm:space-y-6 py-2 sm:py-4">
          <div className="space-y-1.5 sm:space-y-2">
            <Heart className="h-7 w-7 sm:h-10 sm:w-10 text-accent mx-auto fill-accent animate-pulse" />
            <h2 className="text-xl sm:text-3xl font-serif font-bold tracking-tight">It&apos;s a Match!</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              You both want to trade. Start chatting!
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 sm:gap-6">
            <WooHex
              title={data.your_woo.title}
              image={data.your_woo.images?.[0]}
              label="Yours"
            />
            <div className="text-2xl font-bold text-muted-foreground">⇄</div>
            <WooHex
              title={data.their_woo.title}
              image={data.their_woo.images?.[0]}
              label="Theirs"
            />
          </div>

          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={onClose}>
              Keep Swiping
            </Button>
            <Button
              variant="accent"
              onClick={() => {
                onClose();
                router.push(`/matches/${data.match_id}`);
              }}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Go to Chat
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WooHex({
  title,
  image,
  label,
}: {
  title: string;
  image?: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 sm:gap-2">
      <div className="relative w-16 sm:w-24 aspect-[1/1.15]">
        <div
          className="absolute inset-0 woo-rainbow"
          style={{ clipPath: HEX_CLIP }}
        />
        <div
          className="absolute inset-[3px] overflow-hidden bg-muted"
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
            <div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
              No image
            </div>
          )}
        </div>
      </div>
      <div className="text-center">
        <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
        <p className="text-xs sm:text-sm font-medium line-clamp-1 max-w-[80px] sm:max-w-[100px]">
          {title}
        </p>
      </div>
    </div>
  );
}
