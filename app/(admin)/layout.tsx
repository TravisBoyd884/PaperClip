import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Package,
  Warehouse,
  PackageCheck,
  LayoutDashboard,
  Truck,
} from "lucide-react";

const adminNavItems = [
  { href: "/admin/warehouse", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/warehouse/intakes", label: "Intakes", icon: Package },
  { href: "/admin/warehouse/inventory", label: "Inventory", icon: PackageCheck },
  { href: "/admin/warehouse/cashouts", label: "Cash Outs", icon: Truck },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: staffRecords } = await supabase
    .from("warehouse_staff")
    .select("*, warehouses(*)")
    .eq("profile_id", user.id);

  if (!staffRecords || staffRecords.length === 0) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-50 px-4 pt-4">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full bg-card/80 backdrop-blur-lg shadow-sm border border-border/40 px-5">
          <div className="flex items-center gap-3">
            <Link href="/admin/warehouse" className="flex items-center gap-2 text-lg font-serif font-bold tracking-tight">
              <Warehouse className="h-5 w-5" />
              PaperClip Admin
            </Link>
            <span className="text-xs text-muted-foreground rounded-full bg-muted px-2.5 py-0.5">
              {staffRecords[0].warehouses?.name ?? "Warehouse"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-1">
              {adminNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <Link
              href="/dashboard"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to App
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
    </div>
  );
}
