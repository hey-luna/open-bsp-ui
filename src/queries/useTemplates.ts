import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  supabase,
  type TemplateData,
  type WhatsAppOrganizationAddressExtra,
} from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";

/** Match the API's Graph version used by whatsapp-management/templates. */
const META_API_VERSION = "v24.0";
/** Meta defaults to ~25; request larger pages and follow `paging.next`. */
const TEMPLATES_PAGE_LIMIT = 100;

function templatesFromInvoke(payload: unknown): TemplateData[] {
  if (Array.isArray(payload)) {
    return payload as TemplateData[];
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const root = payload as { data?: unknown };
  if (Array.isArray(root.data)) {
    return root.data as TemplateData[];
  }
  if (root.data && typeof root.data === "object") {
    const nested = root.data as { data?: unknown };
    if (Array.isArray(nested.data)) {
      return nested.data as TemplateData[];
    }
  }
  return [];
}

function pagingNextUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const paging = (payload as { paging?: unknown }).paging;
  if (!paging || typeof paging !== "object") {
    return null;
  }
  const next = (paging as { next?: unknown }).next;
  return typeof next === "string" && next.length > 0 ? next : null;
}

async function invokeErrorMessage(
  error: unknown,
  data: unknown,
): Promise<string> {
  if (data && typeof data === "object" && "message" in data) {
    const body = data as { message?: unknown; cause?: unknown };
    const message = typeof body.message === "string" ? body.message : "";
    if (message && body.cause !== undefined) {
      return `${message}: ${JSON.stringify(body.cause)}`;
    }
    if (message) {
      return message;
    }
  }

  if (error && typeof error === "object" && "context" in error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        return invokeErrorMessage(undefined, await ctx.json());
      } catch {
        // ignore
      }
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Could not fetch templates";
}

function graphErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const err = (payload as { error?: unknown }).error;
    if (err && typeof err === "object" && "message" in err) {
      const message = (err as { message?: unknown }).message;
      if (typeof message === "string" && message) {
        return message;
      }
    }
  }
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message) {
      return message;
    }
  }
  return fallback;
}

/**
 * Meta's message_templates edge is paginated. Follow every page so the UI
 * (picker, integrations list, and bubble rendering) sees the full catalog.
 */
async function fetchAllMessageTemplates(
  wabaId: string,
  accessToken: string,
): Promise<TemplateData[]> {
  const all: TemplateData[] = [];
  let url: string | null =
    `https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(wabaId)}/message_templates?limit=${TEMPLATES_PAGE_LIMIT}`;

  while (url) {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(graphErrorMessage(payload, "Could not fetch templates"));
    }
    all.push(...templatesFromInvoke(payload));
    url = pagingNextUrl(payload);
  }

  return all;
}

async function listTemplatesViaManagement(
  activeOrgId: string,
  organizationAddress: string,
): Promise<TemplateData[]> {
  const { data, error } = await supabase.functions.invoke(
    "whatsapp-management/templates",
    {
      method: "PUT",
      body: {
        organization_id: activeOrgId,
        organization_address: organizationAddress,
      },
    },
  );

  if (error) {
    throw new Error(await invokeErrorMessage(error, data));
  }

  const all = templatesFromInvoke(data);
  // Management returns Meta's first page as-is (`{ data, paging }`). Follow
  // `paging.next` (token is embedded in the URL) so we still load the rest.
  let nextUrl = pagingNextUrl(data);
  while (nextUrl) {
    const response = await fetch(nextUrl);
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(graphErrorMessage(payload, "Could not fetch templates"));
    }
    all.push(...templatesFromInvoke(payload));
    nextUrl = pagingNextUrl(payload);
  }

  return all;
}

export function useTemplates(organizationAddress?: string) {
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: ["templates", activeOrgId, organizationAddress],
    queryFn: async () => {
      if (!organizationAddress || !activeOrgId) return [];

      const { data: addressRow, error: addressError } = await supabase
        .from("organizations_addresses")
        .select("extra")
        .eq("organization_id", activeOrgId)
        .eq("address", organizationAddress)
        .maybeSingle();

      if (addressError) {
        throw new Error(addressError.message);
      }

      const extra = addressRow?.extra as
        WhatsAppOrganizationAddressExtra | null | undefined;

      // Prefer direct Graph pagination when WABA credentials are on the row.
      // The management edge function only returns Meta's first page.
      if (extra?.waba_id && extra?.access_token) {
        return fetchAllMessageTemplates(extra.waba_id, extra.access_token);
      }

      return listTemplatesViaManagement(activeOrgId, organizationAddress);
    },
    enabled: !!activeOrgId && !!organizationAddress,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async ({
      template,
      organizationAddress,
    }: {
      template: TemplateData;
      organizationAddress: string;
    }) => {
      const { error } = await supabase.functions.invoke(
        "whatsapp-management/templates",
        {
          method: "POST",
          body: {
            organization_id: activeOrgId,
            organization_address: organizationAddress,
            template,
          },
        },
      );

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["templates", activeOrgId, variables.organizationAddress],
      });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async ({
      template,
      organizationAddress,
    }: {
      template: TemplateData;
      organizationAddress: string;
    }) => {
      const { error } = await supabase.functions.invoke(
        "whatsapp-management/templates",
        {
          method: "PATCH",
          body: {
            organization_id: activeOrgId,
            organization_address: organizationAddress,
            template,
          },
        },
      );

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["templates", activeOrgId, variables.organizationAddress],
      });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async ({
      template,
      organizationAddress,
    }: {
      template: TemplateData;
      organizationAddress: string;
    }) => {
      const { error } = await supabase.functions.invoke(
        "whatsapp-management/templates",
        {
          method: "DELETE",
          body: {
            organization_id: activeOrgId,
            organization_address: organizationAddress,
            template,
          },
        },
      );

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["templates", activeOrgId, variables.organizationAddress],
      });
    },
  });
}
