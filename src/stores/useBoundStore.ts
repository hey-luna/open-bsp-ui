import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { type ChatSlice, createChatSlice } from "./chatSlice";
import {
  type UISlice,
  createUISlice,
  Filters,
  filters,
  ClosedListSort,
} from "./uiSlice";
import { loadTranslations } from "@/i18n/translations";

export type AppState = {
  chat: ChatSlice;
  ui: UISlice;
};

const useBoundStore = create<AppState>()(
  persist(
    (set, get, api) => ({
      chat: createChatSlice(set, get, api) as ChatSlice,
      ui: createUISlice(set, get, api) as UISlice,
    }),
    {
      name: "app-state",
      storage: createJSONStorage(() => localStorage, {
        reviver: (_key, value: any) => {
          // Just in case we decide to store maps
          if (value && value.type === "map") {
            return new Map(value);
          }
          return value;
        },
        replacer: (_key, value) => {
          // Just in case we decide to store maps
          if (value instanceof Map) {
            return { type: "map", value: Array.from(value.entries()) };
          }
          return value;
        },
      }),
      // Restore the state after hydration
      onRehydrateStorage: (prev) => (state) => {
        if (state) {
          state.ui = {
            ...createUISlice,
            ...prev.ui,
            ...state.ui,
            conversationAliases: state.ui.conversationAliases || {},
          };
          // Migrate removed filter tabs (todas / pendientes / 24h / archivadas)
          if (!(state.ui.filter in filters)) {
            state.ui.filter = Filters.OPEN_WINDOW;
          }
          if (
            state.ui.closedListSort !== ClosedListSort.RECENT &&
            state.ui.closedListSort !== ClosedListSort.LONGEST_CLOSED
          ) {
            state.ui.closedListSort = ClosedListSort.RECENT;
          }
          if (state.ui.language && state.ui.language !== "es") {
            loadTranslations(state.ui.language);
          }
        }
      },
      // Pick the keys to be persisted
      partialize: (state) => ({
        ui: {
          searchPattern: state.ui.searchPattern,
          filter: state.ui.filter,
          closedListSort: state.ui.closedListSort,
          activeOrgId: state.ui.activeOrgId,
          language: state.ui.language,
          conversationAliases: state.ui.conversationAliases,
        },
      }),
    },
  ),
);

export default useBoundStore;

// TODO: for real
export function reset() {
  useBoundStore.setState((state) => {
    return {
      ui: {
        ...state.ui,
        activeOrgId: null,
        activeConvId: null,
        initialized: false,
      },
      chat: {
        ...state.chat,
        organizations: new Map(),
        conversations: new Map(),
        messages: new Map(),
      },
    };
  });
}
