import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, LogOut, Repeat2, Warehouse } from "lucide-react";

const conditionLabels: Record<string, string> = {
  new: "New",
  like_new: "Like New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

const categoryLabels: Record<string, string> = {
  office: "Office",
  electronics: "Electronics",
  furniture: "Furniture",
  collectible: "Collectible",
  other: "Other",
};

const statusLabels: Record<string, string> = {
  active: "Active",
  in_trade: "In Trade",
  cashed_out: "Cashed Out",
  burned: "Burned",
};

export default async function WooDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: woo, error } = await supabase
    .from("woos")
    .select("*, items(name, description, condition, category, photos, warehouses(name, city, state))")
    .eq("id", id)
    .single();

  if (error || !woo) notFound();

  const item = woo.items as {
    name: string;
    description: string;
    condition: string;
    category: string;
    photos: string[];
    warehouses: { name: string; city: string; state: string } | null;
  } | null;

  const images = woo.images?.length ? woo.images : item?.photos || [];
  const isActive = woo.status === "active";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{woo.title}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge
              variant={isActive ? "default" : "secondary"}
            >
              {statusLabels[woo.status] || woo.status}
            </Badge>
            <Badge variant="outline">
              {categoryLabels[woo.category] || woo.category}
            </Badge>
          </div>
        </div>
        {isActive && (
          <Button asChild>
            <Link href={`/cashout?woo=${woo.id}`}>
              <LogOut className="mr-2 h-4 w-4" />
              Cash Out
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Image gallery */}
        <div className="space-y-4">
          {images.length > 0 ? (
            <>
              <div
                className="mx-auto w-full max-w-xs aspect-[1/1.15] overflow-hidden"
                style={{
                  clipPath:
                    "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={images[0]}
                  alt={woo.title}
                  className="h-full w-full object-cover"
                />
              </div>
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {images.map((url: string, i: number) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt={`${woo.title} ${i + 1}`}
                      className="h-20 w-20 flex-shrink-0 rounded-md object-cover border"
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div
              className="mx-auto flex w-full max-w-xs aspect-[1/1.15] items-center justify-center bg-muted text-muted-foreground"
              style={{
                clipPath:
                  "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
              }}
            >
              No images
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Woo Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {woo.description && (
                <p className="text-sm text-muted-foreground">
                  {woo.description}
                </p>
              )}
              <Separator />
              <div className="grid grid-cols-2 gap-y-3 text-sm">
                {woo.estimated_value != null && (
                  <>
                    <span className="text-muted-foreground">
                      Estimated Value
                    </span>
                    <span className="font-medium">
                      ${Number(woo.estimated_value).toFixed(2)}
                    </span>
                  </>
                )}
                <span className="text-muted-foreground">Trade Count</span>
                <span className="font-medium flex items-center gap-1">
                  <Repeat2 className="h-3.5 w-3.5" />
                  {woo.trade_count}
                </span>
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">
                  {new Date(woo.created_at).toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>

          {item && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Item Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  <span className="text-muted-foreground">Condition</span>
                  <span className="font-medium">
                    {conditionLabels[item.condition] || item.condition}
                  </span>
                  {item.warehouses && (
                    <>
                      <span className="text-muted-foreground">Warehouse</span>
                      <span className="font-medium flex items-center gap-1">
                        <Warehouse className="h-3.5 w-3.5" />
                        {item.warehouses.name}
                      </span>
                      <span className="text-muted-foreground">Location</span>
                      <span className="font-medium">
                        {item.warehouses.city}, {item.warehouses.state}
                      </span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
