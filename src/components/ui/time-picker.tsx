"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  clockToMinutes,
  minutesToClock,
  type Meridiem,
} from "@/lib/time-of-day";

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const;
const MERIDIEMS: Meridiem[] = ["AM", "PM"];

export interface TimePickerProps {
  /** Minutes since midnight (0–1439). */
  value: number;
  onChange: (minutes: number) => void;
  label: string;
  id: string;
}

/**
 * Controlled time picker rendered as three token-styled Selects (hour / minute / AM-PM).
 * Stores and emits time as minutes-since-midnight.
 */
export function TimePicker({ value, onChange, label, id }: TimePickerProps) {
  const clock = minutesToClock(value);

  function emit(hour12: number, minute: number, meridiem: Meridiem) {
    onChange(clockToMinutes(hour12, minute, meridiem));
  }

  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 text-sm leading-none font-medium" id={id}>
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        <Select
          value={String(clock.hour12)}
          onValueChange={(v) => {
            if (v !== null) emit(Number(v), clock.minute, clock.meridiem);
          }}
        >
          <SelectTrigger aria-label={`${label} hour`} className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HOURS.map((h) => (
              <SelectItem key={h} value={String(h)}>
                {h}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(clock.minute)}
          onValueChange={(v) => {
            if (v !== null) emit(clock.hour12, Number(v), clock.meridiem);
          }}
        >
          <SelectTrigger aria-label={`${label} minute`} className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MINUTES.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {String(m).padStart(2, "0")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={clock.meridiem}
          onValueChange={(v) => {
            if (v !== null) emit(clock.hour12, clock.minute, v as Meridiem);
          }}
        >
          <SelectTrigger aria-label={`${label} AM or PM`} className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MERIDIEMS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </fieldset>
  );
}
