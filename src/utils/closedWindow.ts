import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

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

/**
 * Human duration since the window closed, e.g. "2 days" / "3 hours"
 * (locale-aware via dayjs relativeTime).
 */
export function formatClosedDuration(
  lastIncomingAt: string | null | undefined,
  now: dayjs.Dayjs,
  locale: string,
): string | null {
  const closedAt = windowClosedAt(lastIncomingAt);
  if (!closedAt) return null;
  return closedAt.locale(locale).to(now, true);
}
