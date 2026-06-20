import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getHolidays, getHolidayNotes } from '../market-calendar';

/**
 * Returns the configured exchange holidays for both markets, plus maintenance
 * notes. Backs the Angular "Market Holidays" page. Static config, so it can be
 * cached aggressively.
 */
export async function handleMarketHolidays(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json({
    holidays: {
      US: getHolidays('US'),
      IN: getHolidays('IN'),
    },
    notes: getHolidayNotes(),
  });
}
