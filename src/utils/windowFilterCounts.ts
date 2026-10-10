import dayjs from "dayjs";
import { supabase, type MessageRow } from "@/supabase/client";
import { isReactionMessage } from "@/utils/ReactionUtils";
import type { Filters } from "@/stores/uiSlice";
import { RECENTLY_CLOSED_MAX_DAYS } from "@/utils/closedWindow";

export type WindowFilterCounts = Record<Filters, number>;

const PAGE_SIZE = 1000;

function isArchivedExtra(extra: unknown): boolean {
  if (!extra || typeof extra !== "object") return false;
  return Boolean((extra as { archived?: string | null }).archived);
}

/**
 * Totals for the open / recently-closed / long-closed tabs, independent of
 * which conversations have been scrolled into the local list cache.
 *
 * - open: last incoming within 24h
 * - cerrada 2d: window closed for at most {@link RECENTLY_CLOSED_MAX_DAYS}
 * - ventana cerrada: closed longer than that (or never received a message)
 */
export async function fetchWindowFilterCounts(
  organizationId: string,
): Promise<WindowFilterCounts> {
  const now = dayjs();
  // lastIncoming in (now-3d, now-1d] ⇒ closed for at most 2 days
  // (window closes 1d after last incoming).
  const recentlyClosedLookbackDays = 1 + RECENTLY_CLOSED_MAX_DAYS;
  const sinceOpen = now.subtract(1, "day").toISOString();
  const sinceRecentClosed = now
    .subtract(recentlyClosedLookbackDays, "day")
    .toISOString();

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

  // Newest incoming per conversation within the recently-closed lookback.
  const lastIncoming = new Map<string, string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("messages")
      .select("conversation_id, content, timestamp")
      .eq("organization_id", organizationId)
      .eq("direction", "incoming")
      .gt("timestamp", sinceRecentClosed)
      .order("timestamp", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      if (!activeIds.has(row.conversation_id)) continue;
      if (isReactionMessage(row as MessageRow)) continue;
      if (!lastIncoming.has(row.conversation_id)) {
        lastIncoming.set(row.conversation_id, row.timestamp);
      }
    }

    if (data.length < PAGE_SIZE) break;
  }

  let open = 0;
  let recentlyClosed = 0;
  for (const [, ts] of lastIncoming) {
    if (ts > sinceOpen) open += 1;
    else recentlyClosed += 1;
  }

  const closed = Math.max(0, activeIds.size - open - recentlyClosed);

  return {
    "en ventana": open,
    "cerrada 2d": recentlyClosed,
    "ventana cerrada": closed,
  };
}
