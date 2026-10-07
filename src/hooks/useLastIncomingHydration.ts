import { useEffect, useRef } from "react";
import useBoundStore from "@/stores/useBoundStore";
import { fetchLastIncomingTimestamp } from "@/utils/lastIncoming";

const CONCURRENCY = 6;

/**
 * For conversations whose last-incoming watermark is still unknown (list
 * previews often only keep recent outgoing messages), fetch it from the DB so
 * open/closed window tabs don't flip when a chat is opened.
 */
export function useLastIncomingHydration() {
  const activeOrgId = useBoundStore((s) => s.ui.activeOrgId);
  const conversations = useBoundStore((s) => s.chat.conversations);
  const rememberLastIncomingAt = useBoundStore(
    (s) => s.chat.rememberLastIncomingAt,
  );
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    if (!activeOrgId) return;

    let cancelled = false;

    const run = async () => {
      while (!cancelled) {
        const { lastIncomingAt } = useBoundStore.getState().chat;
        const missing: string[] = [];

        for (const [convId, conv] of conversations) {
          if (conv.organization_id !== activeOrgId) continue;
          if (lastIncomingAt.has(convId)) continue;
          if (inFlight.current.has(convId)) continue;
          missing.push(convId);
        }

        if (!missing.length) return;

        const batch = missing.slice(0, CONCURRENCY);
        await Promise.all(
          batch.map(async (convId) => {
            inFlight.current.add(convId);
            try {
              const ts = await fetchLastIncomingTimestamp(convId);
              if (!cancelled) rememberLastIncomingAt(convId, ts);
            } catch (err) {
              console.error(err);
            } finally {
              inFlight.current.delete(convId);
            }
          }),
        );
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, conversations, rememberLastIncomingAt]);
}
