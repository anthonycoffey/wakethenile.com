/**
 * Ticket helpers for the Astro site. The data itself lives in the show
 * registry (src/lib/shows.ts, ADR 0009) — this file only derives from it.
 */
import { LEGACY_SHOW_ID, SHOWS, TICKET_PRODUCT_IDS } from './shows';

export { TICKET_PRODUCT_IDS };

/**
 * Sep 19 online sales closed (door only). Kept for the dormant /albumrelease
 * page; new code should check `SHOWS[id].onlineSales` instead.
 */
export const EARLY_BIRD_SOLD_OUT = !SHOWS[LEGACY_SHOW_ID].onlineSales;

