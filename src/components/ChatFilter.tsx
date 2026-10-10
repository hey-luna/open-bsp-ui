import useBoundStore from "@/stores/useBoundStore";
import {
  filters,
  Filters,
  ClosedListSort,
  isClosedFilter,
} from "@/stores/uiSlice";
import { useTranslation } from "@/hooks/useTranslation";
import { useWindowFilterCounts } from "@/hooks/useWindowFilterCounts";
import { ArrowDownUp } from "lucide-react";

export default function ChatFilter() {
  const appliedFilter = useBoundStore((state) => state.ui.filter);
  const setFilter = useBoundStore((state) => state.ui.setFilter);
  const closedListSort = useBoundStore((state) => state.ui.closedListSort);
  const setClosedListSort = useBoundStore(
    (state) => state.ui.setClosedListSort,
  );
  const counts = useWindowFilterCounts();

  const { translate: t } = useTranslation();

  const filterNames: { [key in Filters]: string } = {
    "en ventana": t("en ventana"),
    "cerrada 2d": t("cerrada 2d"),
    "ventana cerrada": t("ventana cerrada"),
  };

  const showClosedSort = isClosedFilter(appliedFilter);

  return (
    <div className="px-[20px] pb-[5px] flex gap-3 w-full items-center overflow-x-auto scrollbar-hide shrink-0">
      {(Object.keys(filters) as Filters[]).map((filter) => (
        <button
          key={filter}
          className={
            "text-[14px] text-nowrap px-[12px] py-[6px] rounded-full first-letter:uppercase" +
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
      {showClosedSort && (
        <button
          type="button"
          className="ml-auto text-[13px] text-nowrap flex items-center gap-1.5 px-[10px] py-[6px] rounded-full text-foreground bg-background hover:bg-accent border border-border first-letter:uppercase"
          onClick={() => {
            setClosedListSort(
              closedListSort === ClosedListSort.RECENT
                ? ClosedListSort.LONGEST_CLOSED
                : ClosedListSort.RECENT,
            );
          }}
          title={
            closedListSort === ClosedListSort.RECENT
              ? t("Más tiempo cerrada")
              : t("Recientes")
          }
        >
          <ArrowDownUp className="h-[14px] w-[14px] shrink-0" />
          {closedListSort === ClosedListSort.RECENT
            ? t("Recientes")
            : t("Más tiempo cerrada")}
        </button>
      )}
    </div>
  );
}
