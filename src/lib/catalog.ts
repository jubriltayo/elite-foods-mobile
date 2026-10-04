/**
 * Catalog reads. The only module that knows catalog endpoint paths.
 */

import { ApiError, get } from './api';
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
 * `GET /categories` is being added server-side and answers 404 until it lands,
 * so an absent list is a normal outcome and yields an empty array rather than an
 * error. That is why the filter row can be driven entirely by the response:
 * there is no hard-coded id or label anywhere in this app to rot, and nothing to
 * delete when the endpoint appears.
 */
export async function listCategories(): Promise<Category[]> {
  try {
    const data = await get<CategoriesResponse>('/categories');
    return data.categories;
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'NOT_FOUND' || error.code === 'INTERNAL')) {
      return [];
    }
    throw error;
  }
}
