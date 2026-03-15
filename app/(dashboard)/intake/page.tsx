import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IntakeForm } from "./intake-form";
import { IntakeList } from "./intake-list";

export default async function IntakePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: items } = await supabase
    .from("items")
    .select("*, warehouses(*)")
    .eq("owner_id", user.id)
    .in("status", [
      "requested",
      "label_generated",
      "in_transit",
      "received",
      "verified",
      "stored",
    ])
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight">Intake</h1>
          <p className="text-muted-foreground mt-1">
            Send in physical items to receive tradeable Woos.
          </p>
        </div>
        <IntakeForm />
      </div>
      <IntakeList items={items || []} />
    </div>
  );
}
