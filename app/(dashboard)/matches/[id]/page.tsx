import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMatchDetails, getMessages } from "../actions";
import { ChatView } from "./chat-view";

export default async function MatchChatPage({
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

  const [matchResult, messagesResult] = await Promise.all([
    getMatchDetails(id),
    getMessages(id),
  ]);

  if (!matchResult.data) {
    redirect("/matches");
  }

  return (
    <ChatView
      match={matchResult.data}
      initialMessages={messagesResult.data}
      currentUserId={user.id}
    />
  );
}
