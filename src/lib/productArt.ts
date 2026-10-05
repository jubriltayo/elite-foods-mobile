/**
 * Local product illustrations.
 *
 * `product.imageUrl` is null on every product today, so something local has to
 * stand in. The web shop's illustrations are rasterised to PNG by
 * `scripts/convert-product-art.mjs` and committed, which means the app ships
 * plain images and needs no SVG renderer at runtime.
 *
 * Metro requires a static string per asset, so the map is written out by hand
 * rather than built from a template. Adding a product means adding a line here
 * and re-running the script; a slug that is missing falls back to the generic
 * tile rather than breaking.
 *
 * Presentation only. Nothing here affects what the API returns or how a price is
 * decided.
 */

import type { ImageSourcePropType } from 'react-native';

import fallbackArt from '../../assets/product-art-fallback.png';

export const FALLBACK_ART: ImageSourcePropType = fallbackArt;

/** Slug to local illustration. Keyed by the slug the API returns. */
const ART_BY_SLUG: Record<string, ImageSourcePropType> = {
  'akara-chips': require('../../assets/product-art/akara-chips.png'),
  'cashew-nuts': require('../../assets/product-art/cashew-nuts.png'),
  'chin-chin': require('../../assets/product-art/chin-chin.png'),
  'dodo-ikire': require('../../assets/product-art/dodo-ikire.png'),
  groundnuts: require('../../assets/product-art/groundnuts.png'),
  'kuli-kuli': require('../../assets/product-art/kuli-kuli.png'),
  'plantain-chips': require('../../assets/product-art/plantain-chips.png'),
  'puff-puff': require('../../assets/product-art/puff-puff.png'),
  'soy-milk-drink': require('../../assets/product-art/soy-milk-drink.png'),
  'tigernut-drink': require('../../assets/product-art/tigernut-drink.png'),
  'zobo-drink': require('../../assets/product-art/zobo-drink.png'),
};

/**
 * Chooses what to render for a product, in priority order:
 *
 *  1. the server's own image, once the shop has real photography;
 *  2. the illustration matching the slug;
 *  3. a generic tile.
 *
 * The server value is preferred so real photography wins the moment it exists,
 * and the app never has to be told to switch.
 */
export function productArtFor(slug: string | undefined, imageUrl: string | null | undefined): ImageSourcePropType {
  if (imageUrl) return { uri: imageUrl };
  if (slug && ART_BY_SLUG[slug]) return ART_BY_SLUG[slug];
  return FALLBACK_ART;
}
