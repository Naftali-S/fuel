/**
 * Live Open Food Facts product lookup, one request per scan (per OFF's API
 * rules). Identifies the app, never the user.
 * Data © Open Food Facts contributors, ODbL.
 */
import { OFF_API_FIELDS, offToFoodRecord, type OffProduct } from './off-product';
import type { FoodRecord } from './types';

export const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface OffFetcherOptions {
  appVersion: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export function offUserAgent(appVersion: string): string {
  return `Fuel/${appVersion} (personal nutrition app; https://github.com/Naftali-S/fuel)`;
}

export function createOffFetcher({ appVersion, fetchImpl = fetch, timeoutMs = 8000 }: OffFetcherOptions) {
  return async (gtin: string): Promise<FoodRecord | null> => {
    const url = `${OFF_PRODUCT_URL}${encodeURIComponent(gtin)}?fields=${OFF_API_FIELDS.join(',')}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { 'User-Agent': offUserAgent(appVersion) }, signal: controller.signal });
    } catch (e) {
      throw new Error(controller.signal.aborted ? 'Open Food Facts took too long to respond.' : 'No connection to Open Food Facts.', {
        cause: e,
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Open Food Facts returned HTTP ${res.status}.`);
    const body = (await res.json()) as { status?: number; product?: Partial<OffProduct> };
    if (body.status !== 1 || !body.product) return null;
    return offToFoodRecord({ ...body.product, code: body.product.code ?? gtin });
  };
}
