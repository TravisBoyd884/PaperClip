import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignOutButton } from "./sign-out-button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Welcome!</CardTitle>
          <CardDescription>
            You are signed in. Your user record exists in the Supabase
            auth.users table.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 text-sm">
            <div className="flex gap-2">
              <span className="font-medium text-muted-foreground">
                User ID:
              </span>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {user.id}
              </code>
            </div>
            <div className="flex gap-2">
              <span className="font-medium text-muted-foreground">Email:</span>
              <span>{user.email}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-medium text-muted-foreground">
                Provider:
              </span>
              <span>{user.app_metadata.provider}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-medium text-muted-foreground">
                Created:
              </span>
              <span>{new Date(user.created_at).toLocaleString()}</span>
            </div>
          </div>
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}
