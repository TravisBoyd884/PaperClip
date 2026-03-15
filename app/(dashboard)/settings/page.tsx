import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";
import { AgentConfigForm } from "./agent-config-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "username, avatar_url, is_agent, agent_framework, agent_description, agent_preferences"
    )
    .eq("id", user.id)
    .single();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your profile and AI agent configuration.
        </p>
      </div>

      <div className="grid gap-6">
        <ProfileForm
          initialUsername={profile?.username ?? ""}
          initialAvatarUrl={profile?.avatar_url ?? null}
        />
        <AgentConfigForm
          initialIsAgent={profile?.is_agent ?? false}
          initialFramework={profile?.agent_framework ?? null}
          initialDescription={profile?.agent_description ?? null}
          initialPreferences={profile?.agent_preferences ?? null}
        />
      </div>
    </div>
  );
}
