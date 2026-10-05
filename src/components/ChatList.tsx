import { useMemo } from "react";
import useBoundStore from "@/stores/useBoundStore";
import ChatListItem from "./ChatListItem";
import { type ConversationRow, type MessageRow } from "@/supabase/client";
import { timestampDescending } from "@/stores/chatSlice";
import { filters, Filters } from "@/stores/uiSlice";
import { useTranslation } from "@/hooks/useTranslation";
import { useConversationListScroll } from "@/hooks/useConversationListScroll";
import { useConversationSearch } from "@/hooks/useConversationSearch";
import {
  lookupConversationContact,
  useConversationContactIndex,
} from "@/hooks/useConversationContactIndex";
import { conversationMatchesSearch } from "@/utils/conversationSearch";
import Spinner from "./Spinner";

export type ConvMetadata = {
  convId: string;
  conv: ConversationRow;
  alias?: string;
  mostRecentMsg?: MessageRow;
};

function pinnedAscending(a: ConversationRow, b: ConversationRow) {
  const aPin = a.extra?.pinned;
  const bPin = b.extra?.pinned;

  if (!aPin && !bPin) {
    return 0;
  }

  if (aPin && bPin) {
    return +new Date(aPin) > +new Date(bPin) ? 1 : -1;
  }

  return aPin && !bPin ? -1 : 1;
}

const ChatList = () => {
  const { translate: t } = useTranslation();
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);
  const conversations = useBoundStore((state) => state.chat.conversations);
  const messages = useBoundStore((state) => state.chat.messages);
  const filterName = useBoundStore((state) => state.ui.filter);
  const setFilterName = useBoundStore((state) => state.ui.setFilter);
  const searchPattern = useBoundStore((state) => state.ui.searchPattern);
  const setSearchPattern = useBoundStore((state) => state.ui.setSearchPattern);
  const conversationAliases = useBoundStore(
    (state) => state.ui.conversationAliases || {},
  );
  const isSearching = Boolean(searchPattern.trim());

  useConversationSearch(searchPattern);
  const contactIndex = useConversationContactIndex(activeOrgId, conversations);

  function getMostRecentMsg(convId: string): MessageRow | undefined {
    return messages.get(convId)?.values().next().value;
  }

  const items = useMemo(() => {
    let next: ConvMetadata[] = [...conversations]
      .map(([convId, conv]) => ({
        convId,
        conv,
        alias: conversationAliases[convId],
        mostRecentMsg: getMostRecentMsg(convId),
      }))
      .filter(
        (a) =>
          a.conv.organization_id === activeOrgId &&
          filters[filterName](a.conv, a.mostRecentMsg) &&
          !!a.mostRecentMsg,
      );

    if (isSearching) {
      next = next.filter((item) => {
        const info = lookupConversationContact(contactIndex, item.conv);
        return conversationMatchesSearch(
          {
            alias: item.alias,
            name: item.conv.name,
            contactName: info?.name,
            extraName: info?.extraName,
            username: info?.username,
            contactAddress: item.conv.contact_address,
            groupAddress: item.conv.group_address,
          },
          searchPattern,
        );
      });
    } else {
      next.sort(
        (a, b) =>
          pinnedAscending(a.conv, b.conv) ||
          timestampDescending(a.mostRecentMsg, b.mostRecentMsg),
      );
    }

    return next;
    // getMostRecentMsg reads `messages`; include it via messages in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeOrgId,
    contactIndex,
    conversationAliases,
    conversations,
    filterName,
    isSearching,
    messages,
    searchPattern,
  ]);

  const itemIds = items.map((a) => a.convId);

  const { scrollerRef, isLoadingOlder, onScroll } = useConversationListScroll(
    itemIds.length,
    { enabled: !isSearching },
  );

  return (
    <div
      ref={scrollerRef}
      onScroll={onScroll}
      className="flex-1 min-h-0 w-full overflow-y-auto [overflow-anchor:none] [scrollbar-gutter:stable] pt-[10px] px-[10px]"
    >
      {itemIds.length ? (
        <div className="flex flex-col gap-[4px]">
          {itemIds.map((key) => (
            <ChatListItem key={key} itemId={key} />
          ))}
          {isLoadingOlder && (
            <div className="flex justify-center py-2">
              <Spinner size={16} />
            </div>
          )}
        </div>
      ) : (
        <div className="h-full flex items-center justify-center flex-col text-foreground text-[15px] mt-[-24px]">
          {t("Nada por aquí")}
          {(searchPattern || filterName !== Filters.ALL) && (
            <button
              className="text-[13px] text-primary"
              onClick={() => {
                setSearchPattern("");
                setFilterName(Filters.ALL);
              }}
            >
              {t("remover filtros...")}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatList;
