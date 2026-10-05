import { useEffect } from "react";
import { supabase } from "@/supabase/client";
import type { ConversationRow } from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { fetchLatestConversationMessages } from "@/utils/IdbUtils";
import { digitsOnly, sanitizeIlikeTerm } from "@/utils/conversationSearch";

const SEARCH_LIMIT = 50;
const PREVIEW_FETCH_CAP = 30;
const DEBOUNCE_MS = 250;

async function safeSelect<T>(
  fn: () => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  try {
    const { data } = await fn();
    return data ?? [];
  } catch (err) {
    console.error(err);
    return [];
  }
}

/**
 * When the user searches the chat list, hydrate matching conversations that
 * are not in the current init_data window (name / phone / contact name).
 */
export function useConversationSearch(pattern: string) {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  useEffect(() => {
    const query = pattern.trim();
    if (!orgId || !query) return;

    const term = sanitizeIlikeTerm(query);
    const digits = digitsOnly(query);
    if (!term && digits.length < 3) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void runSearch();
    }, DEBOUNCE_MS);

    async function runSearch() {
      try {
        const convsById = new Map<string, ConversationRow>();

        const convRows = await safeSelect(async () => {
          let req = supabase
            .from("conversations")
            .select()
            .eq("organization_id", orgId!);
          if (term && digits.length >= 3) {
            req = req.or(
              `name.ilike.%${term}%,contact_address.ilike.%${digits}%`,
            );
          } else if (term) {
            req = req.ilike("name", `%${term}%`);
          } else {
            req = req.ilike("contact_address", `%${digits}%`);
          }
          return req.limit(SEARCH_LIMIT).throwOnError();
        });
        for (const conv of convRows) convsById.set(conv.id, conv);

        if (term) {
          const [namedContacts, namedByExtra, namedByUsername] =
            await Promise.all([
              safeSelect(async () =>
                supabase
                  .from("contacts")
                  .select("id, addresses:contacts_addresses(address)")
                  .eq("organization_id", orgId!)
                  .ilike("name", `%${term}%`)
                  .limit(SEARCH_LIMIT)
                  .throwOnError(),
              ),
              safeSelect(async () =>
                supabase
                  .from("contacts_addresses")
                  .select("address")
                  .eq("organization_id", orgId!)
                  .filter("extra->>name", "ilike", `%${term}%`)
                  .limit(SEARCH_LIMIT)
                  .throwOnError(),
              ),
              safeSelect(async () =>
                supabase
                  .from("contacts_addresses")
                  .select("address")
                  .eq("organization_id", orgId!)
                  .filter("extra->>username", "ilike", `%${term}%`)
                  .limit(SEARCH_LIMIT)
                  .throwOnError(),
              ),
            ]);

          const addresses = [
            ...namedContacts.flatMap(
              (contact) =>
                contact.addresses
                  ?.map((addr) => addr.address)
                  .filter(Boolean) ?? [],
            ),
            ...namedByExtra.map((addr) => addr.address),
            ...namedByUsername.map((addr) => addr.address),
          ].filter((address): address is string => Boolean(address));

          const uniqueAddresses = [...new Set(addresses)].slice(
            0,
            SEARCH_LIMIT,
          );
          if (uniqueAddresses.length) {
            const extraConvs = await safeSelect(async () =>
              supabase
                .from("conversations")
                .select()
                .eq("organization_id", orgId!)
                .in("contact_address", uniqueAddresses)
                .limit(SEARCH_LIMIT)
                .throwOnError(),
            );
            for (const conv of extraConvs) convsById.set(conv.id, conv);
          }
        }

        if (cancelled) return;

        const matched = [...convsById.values()];
        if (!matched.length) return;

        const { pushConversations, pushMessages } =
          useBoundStore.getState().chat;
        pushConversations(matched);

        const messages = useBoundStore.getState().chat.messages;
        const missingPreview = matched
          .filter((conv) => !messages.get(conv.id)?.size)
          .slice(0, PREVIEW_FETCH_CAP);

        const previews = await Promise.all(
          missingPreview.map((conv) =>
            fetchLatestConversationMessages(conv.id, 1),
          ),
        );
        if (cancelled) return;

        const rows = previews.flat();
        if (rows.length) pushMessages(rows);
      } catch (err) {
        if (!cancelled) console.error(err);
      }
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [orgId, pattern]);
}
