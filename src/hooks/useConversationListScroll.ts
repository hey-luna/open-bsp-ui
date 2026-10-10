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

function waitFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Loads older conversations for the chat list.
 *
 * init_data is chronological and shared across filter tabs, so a full "open"
 * viewport used to stop paging and leave "closed" chats unloaded. We keep
 * fetching while the active filter still has fewer items than its org-wide
 * total (or the list is short / near the bottom).
 */
export function useConversationListScroll(
  itemCount: number,
  options?: {
    enabled?: boolean;
    /** Active filter key — re-evaluate fill when the tab changes */
    fillKey?: string;
    /** Org-wide total for the active filter; load until we reach it */
    targetCount?: number;
  },
) {
  const enabled = options?.enabled ?? true;
  const fillKey = options?.fillKey ?? "";
  const targetCount = options?.targetCount ?? 0;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeOrgId = useBoundStore((s) => s.ui.activeOrgId);

  const previewReady = useBoundStore((s) => {
    if (!activeOrgId) return false;
    for (const [convId, conv] of s.chat.conversations) {
      if (conv.organization_id !== activeOrgId) continue;
      if (s.chat.messages.get(convId)?.size) return true;
    }
    return false;
  });

  // Advances after every merged page so the fill effect continues even when
  // the new page adds zero rows for the active filter.
  const loadedConvCount = useBoundStore((s) => {
    if (!activeOrgId) return 0;
    let n = 0;
    for (const [, conv] of s.chat.conversations) {
      if (conv.organization_id === activeOrgId) n++;
    }
    return n;
  });

  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  /** Bumped after every load attempt so the fill effect can continue. */
  const [loadGeneration, setLoadGeneration] = useState(0);

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
    setLoadGeneration(0);
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

      setLoadGeneration((g) => g + 1);
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

  const isNearBottomOrShort = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return true;
    const shortList = el.scrollHeight <= el.clientHeight + 1;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return shortList || distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD_PX;
  }, []);

  const needsMoreForFilter = targetCount > 0 && itemCount < targetCount;

  // Load one page whenever the active tab still needs rows, or the list is
  // short / near the bottom. Depends on loadedConvCount so we continue after
  // pages that only contain the *other* tab's conversations.
  useEffect(() => {
    if (!enabled || !activeOrgId || !previewReady) return;
    if (!hasMoreRef.current || loadingRef.current) return;

    let cancelled = false;

    const pump = async () => {
      await waitFrame();
      if (cancelled || !hasMoreRef.current) return;

      const shouldLoad = isNearBottomOrShort() || needsMoreForFilter;
      if (!shouldLoad) return;

      await loadOlder();
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
    isNearBottomOrShort,
    loadGeneration,
    loadOlder,
    loadedConvCount,
    needsMoreForFilter,
    previewReady,
  ]);

  const onScroll = useCallback(() => {
    if (!enabled || !hasMoreRef.current || loadingRef.current) return;
    if (!isNearBottomOrShort()) return;
    void loadOlder();
  }, [enabled, isNearBottomOrShort, loadOlder]);

  return {
    scrollerRef,
    isLoadingOlder,
    onScroll,
    hasMore,
    /** True while we still owe rows for the active filter's total */
    isFillingFilter: hasMore && needsMoreForFilter,
  };
}
