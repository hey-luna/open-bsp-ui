import dayjs from "dayjs";
import { supabase, type MessageRow } from "@/supabase/client";
import { isReactionMessage } from "@/utils/ReactionUtils";
import type { Filters } from "@/stores/uiSlice";

export type WindowFilterCounts = Record<Filters, number>;

const PAGE_SIZE = 1000;

function isArchivedExtra(extra: unknown): boolean {
  if (!extra || typeof extra !== "object") return false;
  return Boolean((extra as { archived?: string | null }).archived);
}

/**
 * Totals for the open/closed window tabs, independent of which conversations
 * have been scrolled into the local list cache.
 */
export async function fetchWindowFilterCounts(
  organizationId: string,
): Promise<WindowFilterCounts> {
  const since = dayjs().subtract(1, "day").toISOString();

  const activeIds = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, extra")
      .eq("organization_id", organizationId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      if (!isArchivedExtra(row.extra)) activeIds.add(row.id);
    }

    if (data.length < PAGE_SIZE) break;
  }

  const openIds = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("messages")
      .select("conversation_id, content")
      .eq("organization_id", organizationId)
      .eq("direction", "incoming")
      .gt("timestamp", since)
      .order("timestamp", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      if (!activeIds.has(row.conversation_id)) continue;
      if (isReactionMessage(row as MessageRow)) continue;
      openIds.add(row.conversation_id);
    }

    if (data.length < PAGE_SIZE) break;
  }

  const open = openIds.size;
  const closed = Math.max(0, activeIds.size - open);

  return {
    "en ventana": open,
    "ventana cerrada": closed,
  };
}
