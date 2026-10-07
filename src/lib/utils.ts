import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInCalendarDays, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 'YYYY-MM-DD' for a date in the browser's local timezone (not UTC). */
export function toDayKey(date: Date = new Date()): string {
  return format(date, 'yyyy-MM-dd')
}

/** Day key of a date stored by the API (UTC midnight of the day). */
export function apiDayKey(value: string | Date | null | undefined): string | null {
  if (!value) return null
  return new Date(value).toISOString().slice(0, 10)
}

/** Calendar days from today until a due date (negative = overdue). */
export function dueInDays(dueDate: string | Date | null | undefined): number | null {
  const dueKey = apiDayKey(dueDate)
  if (!dueKey) return null
  return differenceInCalendarDays(parseISO(dueKey), parseISO(toDayKey()))
}

/** Only allow http(s) links into href — blocks javascript: and data: URLs. */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined
  } catch {
    return undefined
  }
}
