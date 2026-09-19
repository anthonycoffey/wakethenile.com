/**
 * Early bird ticket kill switch.
 *
 * While `true`, online ticket sales are closed: /albumrelease and /shows show
 * the "sold out — tickets at the door" banner, the ticket tiers render as Sold
 * Out, ticket products drop out of the /merch grid (their product pages
 * redirect to /albumrelease), and /api/checkout refuses any ticket line.
 * Door tickets are sold at the merch booth on the Stripe Reader, not here.
 *
 * `functions/api/checkout.ts` keeps its own mirrored flag (a separate Workers
 * bundle can't import this module) — flip both together. See
 * docs/specs/active/early-bird-sold-out.md.
 */
export const EARLY_BIRD_SOLD_OUT = true;

/**
 * Every product that carries a ticket. Mirrors PICKUP_ELIGIBLE_PRODUCT_IDS in
 * functions/api/checkout.ts (see albumrelease-ga-tiers.md's sync checklist).
 */
export const TICKET_PRODUCT_IDS: ReadonlySet<string> = new Set([
  '2480f00d-9317-4ed0-9406-bcef1e34bc71', // Live Show [Early Bird] Ticket
  'b351d11f-4c78-4a1f-b36b-c10d951c96ea', // VIP Fan Experience (ticket + bundle)
  'albumrelease-ga', // GA
  'albumrelease-ga-plus', // GA+
]);
