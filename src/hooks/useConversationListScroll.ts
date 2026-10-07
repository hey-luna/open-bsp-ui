import { useCallback, useEffect, useRef, useState } from "react";
import useBoundStore from "@/stores/useBoundStore";
import {
  applyInitDataPage,
  fetchInitDataPage,
  oldestLoadedConversationPreview,
  oldestTimestampInPage,
} from "@/utils/initDataUtils";

const PAGE_LIMIT = 100;
const PER_CONVERSATION = 5;
const SCROLL_BOTTOM_THRESHOLD_PX = 120;

/**
 * Loads older conversations when the user scrolls the chat list toward the
 * bottom. Also keeps paging automatically while the filtered list is too short
 * to scroll (e.g. few "ventana cerrada" hits in the first init_data window).
 */
export function useConversationListScroll(
  itemCount: number,
  options?: {
    enabled?: boolean;
    /** Re-pump when the active filter changes */ fillKey?: string;
  },
) {
  const enabled = options?.enabled ?? true;
  const fillKey = options?.fillKey ?? "";
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeOrgId = useBoundStore((s) => s.ui.activeOrgId);
  // Re-run the fill pump once init_data has seeded at least one preview.
  const previewReady = useBoundStore((s) => {
    if (!activeOrgId) return false;
    for (const [convId, conv] of s.chat.conversations) {
      if (conv.organization_id !== activeOrgId) continue;
      if (s.chat.messages.get(convId)?.size) return true;
    }
    return false;
  });
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const untilRef = useRef<string | null>(null);
  const epochRef = useRef(0);

  useEffect(() => {
    epochRef.current += 1;
    hasMoreRef.current = true;
    untilRef.current = null;
    loadingRef.current = false;
    setHasMore(true);
    setIsLoadingOlder(false);
  }, [activeOrgId]);

  /** @returns true when a page was merged into the store */
  const loadOlder = useCallback(async (): Promise<boolean> => {
    const epoch = epochRef.current;
    if (!enabled || !activeOrgId || !hasMoreRef.current || loadingRef.current) {
      return false;
    }

    const until =
      untilRef.current ?? oldestLoadedConversationPreview(activeOrgId);
    if (!until) return false;

    loadingRef.current = true;
    setIsLoadingOlder(true);

    try {
      const page = await fetchInitDataPage(activeOrgId, {
        limit: PAGE_LIMIT,
        perConversation: PER_CONVERSATION,
        until,
      });

      if (epoch !== epochRef.current) return false;
      if (!page.messages?.length) {
        hasMoreRef.current = false;
        setHasMore(false);
        return false;
      }

      const pageOldest = oldestTimestampInPage(page.messages);
      if (pageOldest && pageOldest >= until) {
        hasMoreRef.current = false;
        setHasMore(false);
        return false;
      }

      applyInitDataPage(page);
      if (pageOldest) untilRef.current = pageOldest;

      if (page.messages.length < PAGE_LIMIT) {
        hasMoreRef.current = false;
        setHasMore(false);
      }

      return true;
    } catch (err) {
      console.error(err);
      return false;
    } finally {
      if (epoch === epochRef.current) {
        loadingRef.current = false;
        setIsLoadingOlder(false);
      }
    }
  }, [activeOrgId, enabled]);

  const shouldFill = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return true; // not mounted yet — keep trying
    const shortList = el.scrollHeight <= el.clientHeight + 1;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return shortList || distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD_PX;
  }, []);

  // Keep paging while the visible (possibly filtered) list can't scroll, or
  // the user is near the bottom. Unlike depending only on itemCount, this
  // continues when a page adds conversations that don't match the filter.
  useEffect(() => {
    if (!enabled || !activeOrgId) return;

    let cancelled = false;

    const pump = async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );

      while (!cancelled && hasMoreRef.current) {
        if (!shouldFill()) break;

        const loaded = await loadOlder();
        if (!loaded) break;

        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      }
    };

    void pump();
    return () => {
      cancelled = true;
    };
  }, [
    activeOrgId,
    enabled,
    fillKey,
    itemCount,
    loadOlder,
    previewReady,
    shouldFill,
  ]);

  const onScroll = useCallback(() => {
    if (shouldFill()) void loadOlder();
  }, [loadOlder, shouldFill]);

  return { scrollerRef, isLoadingOlder, onScroll, hasMore };
}
