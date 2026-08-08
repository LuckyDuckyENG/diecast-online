/**
 * eBay image URLs carry their size in the filename: `.../s-l225.jpg`.
 *
 * The Browse API hands back the thumbnail — 225px, about 7KB — which is far too
 * small to use as a model image on a car page. Swapping the token asks for a
 * larger render of the same image.
 *
 * Requesting 1600 is safe even when the seller uploaded something smaller:
 * eBay serves the largest size it has rather than 404ing. Measured on a real
 * listing, s-l500, s-l960 and s-l1600 all returned identical bytes (26KB)
 * while s-l225 returned 7KB — so asking for 1600 costs nothing and never
 * degrades what you would otherwise have got.
 */
const EBAY_IMAGE_SIZE = 's-l1600';

export function upscaleEbayImage(url?: string | null): string | null {
  if (!url) return null;
  // Only touch eBay's own image host; a link could be anything.
  if (!/(^|\.)ebayimg\.com/.test(url)) return url;
  return url.replace(/\/s-l\d+\.(jpg|jpeg|png|webp)/i, `/${EBAY_IMAGE_SIZE}.$1`);
}
