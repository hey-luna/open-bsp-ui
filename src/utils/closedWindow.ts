import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/es";
import "dayjs/locale/en";
import "dayjs/locale/pt";
import "dayjs/locale/fr";
import "dayjs/locale/sw";

dayjs.extend(relativeTime);

/** Closed-window chats stay in the "recently closed" tab for this long. */
export const RECENTLY_CLOSED_MAX_DAYS = 2;

/**
 * Instant the customer-service window closed (24h after the last non-reaction
 * incoming message). `null` when there was never an incoming message.
 */
export function windowClosedAt(
  lastIncomingAt: string | null | undefined,
): dayjs.Dayjs | null {
  if (typeof lastIncomingAt !== "string") return null;
  return dayjs(lastIncomingAt).add(1, "day");
}

/** Milliseconds the window has been closed; `Number.POSITIVE_INFINITY` if never opened. */
export function closedDurationMs(
  lastIncomingAt: string | null | undefined,
  now: dayjs.Dayjs = dayjs(),
): number {
  const closedAt = windowClosedAt(lastIncomingAt);
  if (!closedAt) return Number.POSITIVE_INFINITY;
  return Math.max(0, now.valueOf() - closedAt.valueOf());
}

/** True when the window is closed and has been for at most `maxDays`. */
export function isClosedAtMostDays(
  lastIncomingAt: string | null | undefined,
  maxDays: number,
  now: dayjs.Dayjs = dayjs(),
): boolean {
  const ms = closedDurationMs(lastIncomingAt, now);
  if (!Number.isFinite(ms)) return false;
  return ms <= maxDays * 24 * 60 * 60 * 1000;
}

/**
 * Relative time since the window closed, with locale suffix
 * (e.g. English "3 days ago", Spanish "hace 3 días").
 */
export function formatClosedDuration(
  lastIncomingAt: string | null | undefined,
  now: dayjs.Dayjs,
  locale: string,
): string | null {
  const closedAt = windowClosedAt(lastIncomingAt);
  if (!closedAt) return null;
  return closedAt.locale(locale).from(now.locale(locale));
}
