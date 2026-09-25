import { supabase } from './supabase';
import { selectAll } from './selectAll';

/**
 * The numbers on /about, read from the database rather than typed.
 *
 * The previous About page claimed "four seasons from 2021 to 2024" for months
 * after the catalogue passed thirty seasons and three thousand models. Typed
 * numbers on a public page rot silently: nothing breaks, nothing errors, the
 * page just quietly starts lying about the thing it exists to describe.
 *
 * Counts only, via `head: true`, so this costs almost nothing — the rows never
 * leave the database. The page revalidates daily, which is far more often than
 * these figures move.
 */
export interface AboutStats {
  cars: number;
  models: number;
  seasons: number;
  firstYear: number | null;
  lastYear: number | null;
  shops: number;
  shopPrices: number;
  ebayListings: number;
}

const count = async (table: string): Promise<number> => {
  const { count: n } = await supabase.from(table).select('*', { count: 'exact', head: true });
  return n ?? 0;
};

export async function getAboutStats(): Promise<AboutStats> {
  const [cars, models, shopPrices, ebayListings, seasonRows, retailerRows] = await Promise.all([
    count('cars'),
    count('models'),
    count('price_history'),
    count('ebay_links'),
    supabase.from('seasons').select('year'),
    /**
     * Shops that have actually supplied a price, not shops we know about --
     * the retailers table holds several we have never read anything from, and
     * claiming those would overstate the comparison.
     *
     * PAGED. A plain .select() stops at 1000 rows without erroring, and there
     * are 6,402 price rows: the first thousand contain only 18 of the 33
     * shops, so this page shipped claiming 18 until the rendered HTML was
     * actually read. One narrow column, so the cost is small.
     */
    selectAll<{ retailer_id: string }>(supabase, 'price_history', 'retailer_id'),
  ]);

  const years = (seasonRows.data || []).map(s => s.year).filter(Boolean) as number[];
  const shops = new Set(retailerRows.map(r => r.retailer_id).filter(Boolean)).size;

  return {
    cars,
    models,
    seasons: years.length,
    firstYear: years.length ? Math.min(...years) : null,
    lastYear: years.length ? Math.max(...years) : null,
    shops,
    shopPrices,
    ebayListings,
  };
}
