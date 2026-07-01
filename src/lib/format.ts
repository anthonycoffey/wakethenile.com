/** Format a USD dollar amount (e.g. 24 → "$24.00"). Returns '' for nullish. */
export function formatPrice(amount: number | undefined | null, currency = 'USD'): string {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

/** Dollars → integer cents for Stripe (24.5 → 2450). */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}
