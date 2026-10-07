import { supabase, type MessageRow } from "@/supabase/client";
import { isReactionMessage } from "@/utils/ReactionUtils";

/**
 * Newest non-reaction incoming timestamp for a conversation, or `null` if none.
 * Used to hydrate the CS-window filter without waiting for full chat history.
 */
export async function fetchLastIncomingTimestamp(
  conversationId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("messages")
    .select("timestamp, content, direction")
    .eq("conversation_id", conversationId)
    .eq("direction", "incoming")
    .order("timestamp", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(20);

  if (error) throw error;

  for (const row of data ?? []) {
    if (!isReactionMessage(row as MessageRow)) {
      return row.timestamp;
    }
  }

  return null;
}
