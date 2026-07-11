import type { CartItem } from './types';

/**
 * Client-side cart persisted to localStorage. Framework-agnostic: mutations
 * dispatch a `wtn:cart` window event so the header badge, drawer, and cart
 * page can re-render. Safe to import on the server (guards on `window`).
 */
const KEY = 'wtn_cart_v1';
const EVENT = 'wtn:cart';

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Stable identity for a cart line. Usually just the SKU, but lines carrying
 * customer-selected options (bundle tee/size) also fold those in, so the same
 * SKU with a different tee/size is a distinct line rather than colliding.
 */
export function lineKey(item: Pick<CartItem, 'sku' | 'options'>): string {
  if (!item.options?.length) return item.sku;
  const opts = item.options
    .map((o) => `${o.name}=${o.value}`)
    .sort()
    .join('&');
  return `${item.sku}|${opts}`;
}

export function getCart(): CartItem[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CartItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(items: CartItem[]): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: items }));
}

/** Add (or increment) a line, keyed by SKU + selected options (see `lineKey`). */
export function addItem(item: CartItem): void {
  const items = getCart();
  const key = lineKey(item);
  const existing = items.find((i) => lineKey(i) === key);
  if (existing) {
    existing.qty += item.qty;
  } else {
    items.push(item);
  }
  save(items);
}

/** Update quantity for the line with this `lineKey` (0 removes it). */
export function updateQty(key: string, qty: number): void {
  const items = getCart();
  const line = items.find((i) => lineKey(i) === key);
  if (!line) return;
  if (qty <= 0) {
    save(items.filter((i) => lineKey(i) !== key));
  } else {
    line.qty = qty;
    save(items);
  }
}

/** Remove the line with this `lineKey`. */
export function removeItem(key: string): void {
  save(getCart().filter((i) => lineKey(i) !== key));
}

export function clearCart(): void {
  save([]);
}

export function cartCount(items: CartItem[] = getCart()): number {
  return items.reduce((n, i) => n + i.qty, 0);
}

export function cartSubtotal(items: CartItem[] = getCart()): number {
  return items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
}

/** Ask the (globally-mounted) cart drawer to open. */
export function openCart(): void {
  if (!hasWindow()) return;
  window.dispatchEvent(new CustomEvent('wtn:cart:open'));
}

/** Subscribe to cart changes; returns an unsubscribe fn. */
export function onCartChange(cb: (items: CartItem[]) => void): () => void {
  if (!hasWindow()) return () => {};
  const handler = () => cb(getCart());
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler); // cross-tab
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
