import { useContext, useEffect, useState } from "react";
import useBoundStore from "@/stores/useBoundStore";
import { TickContext } from "@/contexts/useTick";
import {
  fetchWindowFilterCounts,
  type WindowFilterCounts,
} from "@/utils/windowFilterCounts";
import { Filters } from "@/stores/uiSlice";

const EMPTY: WindowFilterCounts = {
  [Filters.OPEN_WINDOW]: 0,
  [Filters.RECENTLY_CLOSED]: 0,
  [Filters.CLOSED_WINDOW]: 0,
};

/**
 * Org-wide open/closed window totals (not limited to conversations already
 * loaded into the chat list). Refreshes on org change, every minute tick
 * (24h window expiry), and when the last-incoming index grows (new messages).
 */
export function useWindowFilterCounts(): WindowFilterCounts {
  const activeOrgId = useBoundStore((s) => s.ui.activeOrgId);
  const lastIncomingCount = useBoundStore((s) => s.chat.lastIncomingAt.size);
  const tick = useContext(TickContext);
  const [counts, setCounts] = useState<WindowFilterCounts>(EMPTY);

  useEffect(() => {
    if (!activeOrgId) {
      setCounts(EMPTY);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const next = await fetchWindowFilterCounts(activeOrgId);
        if (!cancelled) setCounts(next);
      } catch (err) {
        console.error(err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, lastIncomingCount, tick]);

  return counts;
}
