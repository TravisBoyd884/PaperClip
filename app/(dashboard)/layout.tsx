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
      <header className="sticky top-0 z-50 px-2 sm:px-4 pt-3 sm:pt-4">
        <div className="mx-auto flex h-12 sm:h-14 max-w-5xl items-center justify-between rounded-full bg-card/80 backdrop-blur-lg shadow-sm border border-border/40 px-3 sm:px-5">
          <Link href="/dashboard" className="text-sm sm:text-lg font-serif font-bold shrink-0 tracking-tight">
            PaperClip
          </Link>
          <nav className="flex items-center gap-0.5 sm:gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-1 sm:gap-1.5 rounded-full px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
