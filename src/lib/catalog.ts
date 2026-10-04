/**
 * Catalog reads. The only module that knows catalog endpoint paths.
 */

import { get } from './api';
import type { Category, Product } from './types';

interface ProductsResponse {
  products: Product[];
}

interface CategoriesResponse {
  categories: Category[];
}

export function listProducts(category?: string): Promise<Product[]> {
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  return get<ProductsResponse>(`/products${query}`).then((data) => data.products);
}

/**
 * The detail response is the product object itself, byte-identical to that
 * product's entry in the list, so it is returned directly rather than unwrapped.
 * Verified against the live API.
 */
export function getProduct(slug: string): Promise<Product> {
  return get<Product>(`/products/${encodeURIComponent(slug)}`);
}

/**
 * Reads the category list from the API.
 *
 * Ids and labels come from the server and nowhere else, so the filter row cannot
 * drift from what `?category=` actually validates.
 *
 * The catch is not a workaround for a missing endpoint any more: it handles a
 * transient failure. Categories are decorative, so if they cannot be loaded the
 * catalog still works unfiltered rather than the screen failing outright. An
 * unknown id is a hard 400, which is exactly why nothing is hard-coded here.
 */
export async function listCategories(): Promise<Category[]> {
  try {
    const data = await get<CategoriesResponse>('/categories');
    return data.categories;
  } catch {
    return [];
  }
}
