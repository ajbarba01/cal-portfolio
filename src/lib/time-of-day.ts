export type Meridiem = "AM" | "PM";
export interface Clock {
  hour12: number;
  minute: number;
  meridiem: Meridiem;
}

/** Converts minutes-since-midnight (0–1439) to 12-hour clock parts. */
export function minutesToClock(total: number): Clock {
  const h24 = Math.floor(total / 60);
  const minute = total % 60;
  const meridiem: Meridiem = h24 < 12 ? "AM" : "PM";
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour12, minute, meridiem };
}

/** Converts 12-hour clock parts back to minutes-since-midnight (0–1439). */
export function clockToMinutes(
  hour12: number,
  minute: number,
  meridiem: Meridiem,
): number {
  const base = hour12 % 12; // 12 -> 0
  const h24 = meridiem === "PM" ? base + 12 : base;
  return h24 * 60 + minute;
}
