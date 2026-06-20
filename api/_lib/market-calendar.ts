/**
 * Market trading-calendar helper.
 *
 * Single source of truth for exchange holidays is `market-holidays.json`, which
 * is also served to the Angular "Market Holidays" page so the UI and the crons
 * never drift. Used by the daily-picks crons to avoid generating/emailing
 * recommendations on days the market is closed (weekends and exchange holidays).
 * This complements the evaluator's holiday-safety (it returns no data for
 * non-trading dates) by preventing un-actionable picks in the first place.
 */

import holidaysData from './market-holidays.json';

export type CalendarMarket = 'US' | 'IN';

export interface MarketHoliday {
  date: string; // YYYY-MM-DD (market local calendar date)
  name: string;
}

const LIST: Record<CalendarMarket, MarketHoliday[]> = {
  US: (holidaysData.US as MarketHoliday[]) ?? [],
  IN: (holidaysData.IN as MarketHoliday[]) ?? [],
};

const SETS: Record<CalendarMarket, Set<string>> = {
  US: new Set(LIST.US.map(h => h.date)),
  IN: new Set(LIST.IN.map(h => h.date)),
};

/** Full named holiday list for a market (for the UI / reporting). */
export function getHolidays(market: CalendarMarket): MarketHoliday[] {
  return LIST[market] ?? [];
}

/** Per-market maintenance notes (e.g. NSE variable-date caveat). */
export function getHolidayNotes(): Record<string, string> {
  return ((holidaysData as { notes?: Record<string, string> }).notes) ?? {};
}

/** True if the ISO date (YYYY-MM-DD) falls on a Saturday or Sunday (UTC). */
export function isWeekend(isoDate: string): boolean {
  const day = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** True if the ISO date is a known exchange holiday for the market. */
export function isMarketHoliday(market: CalendarMarket, isoDate: string): boolean {
  return SETS[market]?.has(isoDate) ?? false;
}

/** True if the market is open (not a weekend and not a known holiday). */
export function isMarketOpen(market: CalendarMarket, isoDate: string): boolean {
  return !isWeekend(isoDate) && !isMarketHoliday(market, isoDate);
}
