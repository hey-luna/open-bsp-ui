import type { StateCreator } from "zustand";
import type { User } from "@supabase/supabase-js";
import type { AppState } from "./useBoundStore";
import dayjs from "dayjs";
import type {
  ConversationRow,
  MessageRow,
  TemplateData,
} from "@/supabase/client";

export function isArchived(conv: ConversationRow, msg?: MessageRow) {
  const archivedTimestamp: string | null | undefined = conv.extra?.archived;

  return +new Date(archivedTimestamp || 0) > +new Date(msg?.timestamp || 0);
}

/**
 * True when the contact's last incoming message is still within the 24h CS
 * window. `lastIncomingAt` is the newest known non-reaction incoming timestamp:
 * - `string` — known incoming at that time
 * - `null` — confirmed no incoming exists
 * - `undefined` — not hydrated yet; if the latest list preview is still within
 *   24h we treat the window as open so chats don't sit in "closed" and then
 *   jump to "open" once history loads
 */
export function isCustomerServiceWindowOpen(
  lastIncomingAt?: string | null,
  mostRecentMsg?: MessageRow | null,
  now: dayjs.Dayjs = dayjs(),
) {
  if (typeof lastIncomingAt === "string") {
    return now.isBefore(dayjs(lastIncomingAt).add(1, "day"));
  }
  if (lastIncomingAt === null) {
    return false;
  }
  // Unknown: only treat as closed when even the latest activity is outside 24h.
  if (!mostRecentMsg) return false;
  return now.isBefore(dayjs(mostRecentMsg.timestamp).add(1, "day"));
}

export const Filters = {
  OPEN_WINDOW: "en ventana",
  CLOSED_WINDOW: "ventana cerrada",
} as const;

export type Filters = (typeof Filters)[keyof typeof Filters];

/** Sort mode used on the closed-window conversation tab. */
export const ClosedListSort = {
  RECENT: "recent",
  LONGEST_CLOSED: "closed_longest",
} as const;

export type ClosedListSort =
  (typeof ClosedListSort)[keyof typeof ClosedListSort];

export const filters: {
  [key in Filters]: (
    conv: ConversationRow,
    msg?: MessageRow,
    lastIncomingAt?: string | null,
    now?: dayjs.Dayjs,
  ) => boolean;
} = {
  "en ventana": (conv, msg, lastIncomingAt, now) =>
    !isArchived(conv, msg) &&
    isCustomerServiceWindowOpen(lastIncomingAt, msg, now),
  "ventana cerrada": (conv, msg, lastIncomingAt, now) =>
    !isArchived(conv, msg) &&
    !isCustomerServiceWindowOpen(lastIncomingAt, msg, now),
} as const;

export type TemplateDraft = {
  template: TemplateData;
  bodyVarValues: string[];
  headVarValues: string[];
};

export type Language = "es" | "en" | "pt" | "sw" | "fr";

const SUPPORTED_LANGUAGES: Language[] = ["es", "en", "pt", "sw", "fr"];

export function detectDefaultLanguage(): Language {
  const candidates =
    typeof navigator !== "undefined"
      ? [...(navigator.languages ?? []), navigator.language].filter(Boolean)
      : [];

  for (const tag of candidates) {
    const base = tag.toLowerCase().split("-")[0] as Language;
    if (SUPPORTED_LANGUAGES.includes(base)) return base;
  }

  return "en";
}

export type UIState = {
  templatePicker: boolean;
  templateDrafts: Map<string, TemplateDraft>;
  activeOrgId: string | null;
  activeConvId: string | null;
  user: User | null;
  sendAsContact: boolean;
  filter: keyof typeof filters;
  /** Only applies while viewing the closed-window tab. */
  closedListSort: ClosedListSort;
  searchPattern: string;
  isLoading: boolean;
  language: Language;
  /** Per-browser nicknames keyed by conversation id. Not synced to the DB. */
  conversationAliases: Record<string, string>;
};

export type UIActions = {
  toggle: (component: keyof UIState, value?: boolean) => void;
  setActiveOrg: (id: string | null) => void;
  setActiveConv: (id: string | null) => void;
  setUser: (user: User | null) => void;
  setSendAsContact: (sendAsContact: boolean) => void;
  setFilter: (filter: keyof typeof filters) => void;
  setClosedListSort: (sort: ClosedListSort) => void;
  setSearchPattern: (searchPattern: string) => void;
  setTemplateDraft: (convId: string, draft: TemplateDraft | null) => void;
  setLanguage: (lang: Language) => void;
  setConversationAlias: (convId: string, alias: string | null) => void;
};

export type UISlice = UIState & UIActions;

// @ts-expect-error partializing the slice creator's state type
export const createUISlice: StateCreator<Partial<AppState>> = (
  set: (
    partial:
      | AppState
      | Partial<AppState>
      | ((state: AppState) => AppState | Partial<AppState>),
    replace?: boolean,
  ) => void,
) => ({
  templatePicker: false,
  templateDrafts: new Map(),
  activeOrgId: null,
  activeConvId: null,
  user: null,
  sendAsContact: false,
  filter: Filters.OPEN_WINDOW as keyof typeof filters,
  closedListSort: ClosedListSort.RECENT,
  searchPattern: "",
  isLoading: false,
  language: detectDefaultLanguage(),
  conversationAliases: {},
  toggle: (component: keyof UIState, value?: boolean) =>
    set((state) => ({
      ui: {
        ...state.ui,
        [component]: value ?? !state.ui[component],
      },
    })),
  setActiveOrg: (activeOrgId: string | null) =>
    set((state) => ({
      ui: {
        ...state.ui,
        activeOrgId,
      },
    })),
  setActiveConv: (activeConvId: string | null) =>
    set((state) => ({
      ui: {
        ...state.ui,
        activeConvId,
      },
    })),
  setUser: (user: User | null) =>
    set((state) => ({
      ui: {
        ...state.ui,
        user,
      },
    })),
  setSendAsContact: (sendAsContact: boolean) =>
    set((state) => ({
      ui: {
        ...state.ui,
        sendAsContact,
      },
    })),
  setFilter: (filter: keyof typeof filters) =>
    set((state) => ({
      ui: {
        ...state.ui,
        filter,
      },
    })),
  setClosedListSort: (closedListSort: ClosedListSort) =>
    set((state) => ({
      ui: {
        ...state.ui,
        closedListSort,
      },
    })),
  setSearchPattern: (searchPattern: string) =>
    set((state) => ({
      ui: {
        ...state.ui,
        searchPattern,
      },
    })),
  setTemplateDraft: (convId: string, draft: TemplateDraft | null) =>
    set((state) => {
      const templateDrafts = new Map(state.ui.templateDrafts);
      if (draft) {
        templateDrafts.set(convId, draft);
      } else {
        templateDrafts.delete(convId);
      }
      return { ui: { ...state.ui, templateDrafts } };
    }),
  setLanguage: (language: Language) =>
    set((state) => ({
      ui: { ...state.ui, language },
    })),
  setConversationAlias: (convId: string, alias: string | null) =>
    set((state) => {
      const conversationAliases = { ...(state.ui.conversationAliases || {}) };
      const trimmed = alias?.trim();
      if (trimmed) {
        conversationAliases[convId] = trimmed;
      } else {
        delete conversationAliases[convId];
      }
      return { ui: { ...state.ui, conversationAliases } };
    }),
});
