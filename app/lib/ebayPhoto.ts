/**
 * The eBay listing photo, used as a LAST RESORT when a model has no picture of
 * its own and no shop that could ever supply one.
 *
 * Nothing here writes to the database, and that is the whole point.
 *
 * A retailer sweep fills `models.image_url` through `attachRetailerLink`, whose
 * guard is `.update({ image_url }).is('image_url', null)` -- so the FIRST photo
 * written is permanent and every later shop is refused. That is correct for a
 * product shot: one clean photo, no churn. But it means writing an eBay photo
 * into that column spends the single slot on a snapshot of somebody's
 * second-hand item, and the model then becomes invisible to every future
 * sweep. Horizondiecast, Yuui and Notjustcollectibles are still unswept and
 * carry exactly the back-catalogue stock these old models come from, so a
 * clean shot plausibly IS still coming.
 *
 * Resolving the picture at render time instead costs nothing -- these pages are
 * ISR and rebuild daily -- keeps `image_url` null, and lets a card upgrade
 * itself from the eBay snapshot to the product shot the day a sweep lands,
 * with nothing to migrate or undo.
 */


/**
 * eBay stores every image at 225px -- all 5,574 of them. That is a thumbnail,
 * and a 4:3 card is nowhere near it, so the size token has to be swapped.
 *
 * Verified against real images in this set: 225px is ~8KB, 500px is ~30KB and
 * 1600px is 70-300KB. These are genuinely larger renders from eBay's CDN, not
 * upscales of the thumbnail. 500 is the one that suits a card; 1600 would put
 * a third of a megabyte into a grid for no visible gain.
 */
export const EBAY_PHOTO_WIDTH = 500;

export function upsizeEbayPhoto(url: string | null | undefined): string | null {
  if (!url) return null;
  // Only rewrite the size token eBay actually uses. Anything else is left
  // alone rather than guessed at, so an unexpected URL shape degrades to the
  // image we were given instead of a 404.
  return url.replace(/s-l\d+\.(jpg|jpeg|png|webp)/i, `s-l${EBAY_PHOTO_WIDTH}.$1`);
}

type EbayRow = { model_id: string | null; ebay_image?: string | null };
type PriceRow = { model_id: string | null };

/**
 * model_id -> eBay photo, for models where eBay is the ONLY place it sells.
 *
 * A model a shop stocks is left out even when it currently has no picture,
 * because its photo is coming from the shop's own feed and a product shot
 * beats a used-item snapshot. Measured when this was built: of the 73 models
 * with no image but an eBay photo available, ZERO had a retailer link, so this
 * condition excludes nothing today. It is here for the sweeps that have not
 * run yet.
 *
 * "Has a retailer" means a `price_history` row exists at all, not a fresh or
 * in-stock one. A delisted link will not produce a photo, but reading
 * staleness here would start showing eBay snapshots for models that are simply
 * between sweeps -- and the conservative direction is to show FEWER of them.
 */
export function buildEbayPhotoMap(
  ebayRows: EbayRow[],
  retailerRows: PriceRow[]
): Map<string, string> {
  const hasRetailer = new Set<string>();
  for (const r of retailerRows) if (r.model_id) hasRetailer.add(r.model_id);

  const photos = new Map<string, string>();
  for (const r of ebayRows) {
    if (!r.model_id || !r.ebay_image) continue;
    if (hasRetailer.has(r.model_id)) continue;
    // First listing wins, so the picture does not change identity every time
    // the refresh reorders rows or a seller relists.
    if (photos.has(r.model_id)) continue;
    const url = upsizeEbayPhoto(r.ebay_image);
    if (url) photos.set(r.model_id, url);
  }
  return photos;
}

/**
 * The photo for a car, given its models. Returns null when the car already has
 * a real image or when no model qualifies -- callers should prefer
 * `image_url` and fall back to this.
 */
export function ebayPhotoForVariants(
  variants: { id: string }[],
  photos: Map<string, string>
): string | null {
  for (const v of variants) {
    const hit = photos.get(v.id);
    if (hit) return hit;
  }
  return null;
}
