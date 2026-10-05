import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/supabase/client";
import type { ContactAddressExtra, ConversationRow } from "@/supabase/client";
import { queryKeys } from "@/queries/queryKeys";

export type ConversationContactInfo = {
  name?: string;
  extraName?: string;
  username?: string;
};

function mergeInfo(
  into: Map<string, ConversationContactInfo>,
  key: string,
  info: ConversationContactInfo,
) {
  if (!key) return;
  const prev = into.get(key);
  into.set(key, {
    name: info.name || prev?.name,
    extraName: info.extraName || prev?.extraName,
    username: info.username || prev?.username,
  });
}

function infoFromExtra(
  extra: ContactAddressExtra | null | undefined,
): ConversationContactInfo {
  return {
    extraName: extra?.name,
    username: extra && "username" in extra ? extra.username : undefined,
  };
}

type AddressRow = {
  address: string;
  service: string;
  extra: ContactAddressExtra | null;
  contact: { name: string | null } | null;
};

function addAddressRow(
  into: Map<string, ConversationContactInfo>,
  row: AddressRow,
) {
  const info: ConversationContactInfo = {
    name: row.contact?.name || undefined,
    ...infoFromExtra(row.extra),
  };
  mergeInfo(into, row.address, info);
  mergeInfo(into, `${row.service}:${row.address}`, info);
}

/**
 * Names as shown in the chat list: contact name / WhatsApp-IG display name /
 * username, keyed by address and by `service:address`.
 */
export function useConversationContactIndex(
  orgId: string | null,
  conversations: Map<string, ConversationRow>,
) {
  const queryClient = useQueryClient();

  const addresses = useMemo(() => {
    const unique = new Set<string>();
    for (const conv of conversations.values()) {
      if (orgId && conv.organization_id !== orgId) continue;
      if (conv.contact_address) unique.add(conv.contact_address);
    }
    return [...unique].sort();
  }, [conversations, orgId]);

  const { data: fetched } = useQuery({
    queryKey: queryKeys.contacts.conversationSearchIndex(orgId, addresses),
    queryFn: async () => {
      const PAGE = 200;
      const rows: AddressRow[] = [];
      for (let i = 0; i < addresses.length; i += PAGE) {
        const chunk = addresses.slice(i, i + PAGE);
        const { data } = await supabase
          .from("contacts_addresses")
          .select("address, service, extra, contact:contacts(name)")
          .eq("organization_id", orgId!)
          .in("address", chunk)
          .throwOnError();
        rows.push(...((data ?? []) as AddressRow[]));
      }
      return rows;
    },
    enabled: !!orgId && addresses.length > 0,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const map = new Map<string, ConversationContactInfo>();

    for (const conv of conversations.values()) {
      if (!conv.contact_address) continue;
      const cached = queryClient.getQueryData(
        queryKeys.contacts.byAddress(orgId, conv.service, conv.contact_address),
      ) as
        | {
            data?: {
              extra?: ContactAddressExtra | null;
              contact?: { name?: string | null };
            };
          }
        | { name?: string | null }
        | undefined;

      if (cached && "name" in cached && cached.name) {
        mergeInfo(map, conv.contact_address, { name: cached.name });
        mergeInfo(map, `${conv.service}:${conv.contact_address}`, {
          name: cached.name,
        });
      } else if (cached && "data" in cached) {
        const row = cached.data;
        addAddressRow(map, {
          address: conv.contact_address,
          service: conv.service,
          extra: row?.extra ?? null,
          contact: row?.contact ? { name: row.contact.name ?? null } : null,
        });
      }
    }

    for (const row of fetched ?? []) addAddressRow(map, row);

    return map;
  }, [conversations, fetched, orgId, queryClient]);
}

export function lookupConversationContact(
  index: Map<string, ConversationContactInfo>,
  conv: ConversationRow,
): ConversationContactInfo | undefined {
  if (!conv.contact_address) return undefined;
  return (
    index.get(`${conv.service}:${conv.contact_address}`) ||
    index.get(conv.contact_address)
  );
}
