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

/** Add (or increment) a line, keyed by SKU. */
export function addItem(item: CartItem): void {
  const items = getCart();
  const existing = items.find((i) => i.sku === item.sku);
  if (existing) {
    existing.qty += item.qty;
  } else {
    items.push(item);
  }
  save(items);
}

export function updateQty(sku: string, qty: number): void {
  const items = getCart();
  const line = items.find((i) => i.sku === sku);
  if (!line) return;
  if (qty <= 0) {
    save(items.filter((i) => i.sku !== sku));
  } else {
    line.qty = qty;
    save(items);
  }
}

export function removeItem(sku: string): void {
  save(getCart().filter((i) => i.sku !== sku));
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
