import { useContext, useMemo } from "react";
import useBoundStore from "@/stores/useBoundStore";
import { filters, Filters } from "@/stores/uiSlice";
import { useTranslation } from "@/hooks/useTranslation";
import { TickContext } from "@/contexts/useTick";
import type { MessageRow } from "@/supabase/client";

export default function ChatFilter() {
  const appliedFilter = useBoundStore((state) => state.ui.filter);
  const setFilter = useBoundStore((state) => state.ui.setFilter);
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);
  const conversations = useBoundStore((state) => state.chat.conversations);
  const messages = useBoundStore((state) => state.chat.messages);
  const tick = useContext(TickContext);

  const { translate: t } = useTranslation();

  const filterNames: { [key in Filters]: string } = {
    "en ventana": t("en ventana"),
    "ventana cerrada": t("ventana cerrada"),
  };

  const counts = useMemo(() => {
    const next: Record<Filters, number> = {
      "en ventana": 0,
      "ventana cerrada": 0,
    };

    for (const [convId, conv] of conversations) {
      if (conv.organization_id !== activeOrgId) continue;

      const convMessages = messages.get(convId);
      const mostRecentMsg: MessageRow | undefined = convMessages
        ?.values()
        .next().value;
      if (!mostRecentMsg) continue;

      let mostRecentIncoming: MessageRow | undefined;
      if (convMessages) {
        for (const msg of convMessages.values()) {
          if (msg.direction === "incoming") {
            mostRecentIncoming = msg;
            break;
          }
        }
      }

      for (const filter of Object.keys(filters) as Filters[]) {
        if (filters[filter](conv, mostRecentMsg, mostRecentIncoming, tick)) {
          next[filter]++;
        }
      }
    }

    return next;
  }, [activeOrgId, conversations, messages, tick]);

  return (
    <div className="px-[20px] pb-[5px] flex gap-3 w-full overflow-x-auto scrollbar-hide shrink-0">
      {(Object.keys(filters) as Filters[]).map((filter) => (
        <button
          key={filter}
          className={
            "text-[14px] text-nowrap capitalize px-[12px] py-[6px] rounded-full" +
            (filter === appliedFilter
              ? " text-foreground bg-primary/10 hover:bg-primary/20 border border-primary"
              : " text-foreground bg-background hover:bg-accent border border-border")
          }
          onClick={() => {
            setFilter(filter);
          }}
        >
          {filterNames[filter]} ({counts[filter]})
        </button>
      ))}
    </div>
  );
}
