import Link from "next/link";
import { Package, LayoutDashboard, Repeat2, MessageSquare, LogOut as LogOutIcon, Settings } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/intake", label: "Intake", icon: Package },
  { href: "/swipe", label: "Swipe", icon: Repeat2 },
  { href: "/matches", label: "Matches", icon: MessageSquare },
  { href: "/cashout", label: "Cash Out", icon: LogOutIcon },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-10 sm:h-14 max-w-5xl items-center justify-between px-2 sm:px-4">
          <Link href="/dashboard" className="text-sm sm:text-lg font-bold shrink-0">
            PaperClip
          </Link>
          <nav className="flex items-center gap-0.5 sm:gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-1 sm:gap-1.5 rounded-md px-1.5 py-1 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-2 py-3 sm:px-4 sm:py-8">{children}</main>
    </div>
  );
}
