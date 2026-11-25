/**
 * Show registry — the ONE place a live show and its ticket products are
 * declared. See docs/specs/adrs/0009-per-show-ticketing-shared-registry.md.
 *
 * Imported by the Astro site AND by every Pages Function under functions/api
 * (`../../src/lib/shows`). Cloudflare bundles each Function with esbuild, so
 * this file must stay dependency-free plain TypeScript: no imports, no Node
 * or browser globals at module scope. Adding one breaks checkout.
 *
 * Adding a show: one SHOWS entry, its products in TICKET_PRODUCTS, its booth
 * SKU in DOOR_TICKET_SKUS. Nothing else in the code needs to change.
 */

export type TicketTier = 'ga' | 'vip' | 'ga-plus';

export interface ShowInfo {
  id: string;
  /** The Sanity `show` document that renders this show's /shows row. */
  sanityShowId: string;
  /** Short name for staff screens / emails, e.g. "Dec 4 · Maggie Mae's". */
  label: string;
  /** Headline billing for public pages. */
  billing: string;
  /** Opening act line, if any. */
  support?: string;
  /** Button-length promo, e.g. "Dec 4 with Gators" (home page CTA). */
  promo?: string;
  /** "December 4" — how the date reads in copy. */
  dateText: string;
  venue: string;
  city: string;
  /** "Doors 8:00 PM · Gators 9:00 PM" */
  timesText?: string;
  age?: string;
  /** Doors, as an absolute instant. Drives which show the door admits. */
  startsAt: string;
  /** HubSpot contact property flagging attendees of this show. */
  hubspotProperty: string;
  /** False closes online ticket sales for this show (door only). */
  onlineSales: boolean;
  /** Price at the door, for "sold out online" copy. */
  doorPrice?: number;
  /** Stripe payment description, e.g. "Dec 04 Maggie Mae's with Gators". */
  paymentDescription?: string;
  /** Show poster/flyer (site-relative), used for the Stripe line-item image. */
  poster?: string;
}

export const SHOWS: Record<string, ShowInfo> = {
  '2026-09-19': {
    id: '2026-09-19',
    sanityShowId: '',
    label: 'Sep 19 · Album Release Party',
    billing: 'Wake the Nile — Album Release Party',
    dateText: 'September 19',
    venue: 'Dwell Coworking Manchaca Auditorium',
    city: 'Austin, TX',
    startsAt: '2026-09-19T20:00:00-05:00',
    hubspotProperty: 'wtn_show_2026_09_19',
    onlineSales: false,
  },
  '2026-12-04': {
    id: '2026-12-04',
    sanityShowId: 'show-2026-12-04',
    label: "Dec 4 · Maggie Mae's",
    billing: 'Wake the Nile',
    support: 'with special guests Gators',
    promo: 'Dec 4 with Gators',
    dateText: 'December 4',
    venue: "Maggie Mae's (Upstairs)",
    city: 'Austin, TX',
    timesText: 'Doors 8:00 PM · Gators 9:00 PM',
    age: '21+',
    startsAt: '2026-12-04T20:00:00-06:00',
    hubspotProperty: 'wtn_show_2026_12_04',
    onlineSales: true,
    doorPrice: 30,
    paymentDescription: "Dec 04 Maggie Mae's with Gators",
    poster: '/images/shows/2026-12-04-poster-900.jpg',
  },
};

/** Orders written before the `show` field existed all belong to Sep 19. */
export const LEGACY_SHOW_ID = '2026-09-19';

export interface TicketProduct {
  show: string;
  tier: TicketTier;
  /** Sale order within a show: the lowest `phase` with stock is on sale. */
  phase?: number;
  /** Customer-facing name of the phase, e.g. "Early Bird". */
  phaseLabel?: string;
  /**
   * A time-boxed deal (PROMOS key). Promo products sit OUTSIDE the phase
   * sequence: they sell alongside whichever phase is current.
   */
  promo?: string;
}

/**
 * A time-boxed ticket deal. The window and allowed quantities are enforced by
 * /api/checkout; price and stock live on the Sanity product like any ticket.
 * See docs/specs/active/black-friday-ticket-promo.md.
 */
export interface TicketPromo {
  id: string;
  /** Badge text, e.g. "Black Friday". */
  label: string;
  /** Sale window [startsAt, endsAt) — absolute instants. */
  startsAt: string;
  endsAt: string;
  /** Visual deadline for the on-page countdown (may be before endsAt). */
  countdownTo?: string;
  /** Countdown caption, e.g. "Black Friday ends in". */
  countdownLabel?: string;
  /** Copy shown between countdownTo and endsAt. */
  extendedText?: string;
  /** The only cart quantities allowed, e.g. [2, 4]. */
  quantities: number[];
  /** Value written to HUBSPOT_PROMO_PROPERTY for buyers. */
  hubspotValue: string;
  /** Appended to the show's Stripe payment description. */
  paymentSuffix?: string;
}

export const PROMOS: Record<string, TicketPromo> = {
  bf2026: {
    id: 'bf2026',
    label: 'Black Friday',
    startsAt: '2026-11-24T00:00:00-06:00',
    endsAt: '2026-11-30T00:00:00-06:00', // Sun Nov 29, 11:59:59 PM Central
    countdownTo: '2026-11-28T00:00:00-06:00', // end of Black Friday
    countdownLabel: 'Black Friday ends in',
    extendedText: 'Black Friday pricing extended through Sunday at midnight',
    quantities: [2, 4],
    hubspotValue: 'BF2026',
    paymentSuffix: 'Black Friday',
  },
};

/** HubSpot contact property recording the last ticket deal a buyer used. */
export const HUBSPOT_PROMO_PROPERTY = 'wtn_ticket_promo';

/** Is this deal on sale at `now`? */
export const promoOpen = (promo: TicketPromo | undefined, now: number = Date.now()): boolean =>
  !!promo && now >= Date.parse(promo.startsAt) && now < Date.parse(promo.endsAt);

/** The deal a ticket product belongs to, if any. */
export const promoForProduct = (productId: string | null | undefined): TicketPromo | undefined => {
  const id = productId ? TICKET_PRODUCTS[productId]?.promo : undefined;
  return id ? PROMOS[id] : undefined;
};

/** Sanity product _id → the show and tier it admits to. */
export const TICKET_PRODUCTS: Record<string, TicketProduct> = {
  '2480f00d-9317-4ed0-9406-bcef1e34bc71': { show: '2026-09-19', tier: 'ga' }, // Live Show Ticket (/releaseparty)
  'b351d11f-4c78-4a1f-b36b-c10d951c96ea': { show: '2026-09-19', tier: 'vip' }, // VIP Fan Experience
  'albumrelease-ga': { show: '2026-09-19', tier: 'ga' }, // GA (/albumrelease)
  'albumrelease-ga-plus': { show: '2026-09-19', tier: 'ga-plus' }, // GA Plus (/albumrelease)
  'dec4-ga-early': { show: '2026-12-04', tier: 'ga', phase: 1, phaseLabel: 'Early Bird' },
  'dec4-ga': { show: '2026-12-04', tier: 'ga', phase: 2, phaseLabel: 'GA' },
  'dec4-bf': { show: '2026-12-04', tier: 'ga', promo: 'bf2026' }, // Black Friday 2 for $30 / 4 for $60
};

/**
 * Booth (card reader) SKUs that grant admission. Honoured on the booth path
 * only — a web cart's sku comes from the client and must never mint a ticket.
 */
export const DOOR_TICKET_SKUS: Record<string, { show: string; tier: TicketTier }> = {
  'TICKET-DOOR-GA': { show: '2026-09-19', tier: 'ga' },
  'TICKET-DOOR-GA-DEC4': { show: '2026-12-04', tier: 'ga' },
};

/** If a cart mixes tiers, the order's headline tier is the best perk present. */
export const TIER_PRIORITY: TicketTier[] = ['vip', 'ga-plus', 'ga'];

export const TICKET_PRODUCT_IDS: ReadonlySet<string> = new Set(Object.keys(TICKET_PRODUCTS));

export const ticketProduct = (productId: string | null | undefined): TicketProduct | undefined =>
  productId ? TICKET_PRODUCTS[productId] : undefined;

export const showInfo = (id: string | null | undefined): ShowInfo | undefined =>
  SHOWS[id || LEGACY_SHOW_ID];

/** Products for one show, in sale order (deal products excluded). */
export const productsForShow = (showId: string): string[] =>
  Object.entries(TICKET_PRODUCTS)
    .filter(([, p]) => p.show === showId && !p.promo)
    .sort(([, a], [, b]) => (a.phase ?? 0) - (b.phase ?? 0))
    .map(([id]) => id);

/** Deal products for one show (any window — callers check promoOpen). */
export const promoProductsForShow = (showId: string): string[] =>
  Object.entries(TICKET_PRODUCTS)
    .filter(([, p]) => p.show === showId && !!p.promo)
    .map(([id]) => id);

/**
 * Cart stepper for a deal line: the next allowed quantity in `dir`
 * (0 = remove the line), or null when the product isn't a deal.
 */
export function dealQtyStep(productId: string, current: number, dir: 1 | -1): number | null {
  const promo = promoForProduct(productId);
  if (!promo) return null;
  const qs = [...promo.quantities].sort((a, b) => a - b);
  if (dir > 0) return qs.find((q) => q > current) ?? current;
  return [...qs].reverse().find((q) => q < current) ?? 0;
}

/** A show stays "at the door" until 12 hours after doors open. */
const DOOR_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * The show the door is admitting right now: the earliest show that hasn't
 * ended yet (doors + 12 h). After the last show, the last show.
 */
export function doorShowAt(now: number = Date.now()): ShowInfo {
  const ordered = Object.values(SHOWS).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return ordered.find((s) => now < Date.parse(s.startsAt) + DOOR_WINDOW_MS) ?? ordered[ordered.length - 1];
}

/** True once a show's door window (doors + 12 h) has closed. */
export const showEnded = (show: ShowInfo, now: number = Date.now()): boolean =>
  now >= Date.parse(show.startsAt) + DOOR_WINDOW_MS;

/**
 * Can tickets for this show be checked in (or un-checked) right now? Only
 * the door show, and only until its window closes — so a past show's list
 * is frozen for good, including the LAST show once it's over (doorShowAt
 * still returns it, for the attendee list default, but its door is shut).
 */
export function checkinOpen(showId: string | null | undefined, now: number = Date.now()): boolean {
  const show = SHOWS[showId || LEGACY_SHOW_ID];
  if (!show) return false;
  return doorShowAt(now).id === show.id && !showEnded(show, now);
}

export type ShowStatus = 'open' | 'upcoming' | 'past';

/** Staff-facing state of a show: door open now, later, or done. */
export function showStatus(show: ShowInfo, now: number = Date.now()): ShowStatus {
  if (checkinOpen(show.id, now)) return 'open';
  return showEnded(show, now) ? 'past' : 'upcoming';
}

/** The registry entry behind a Sanity `show` document, if we sell it. */
export const showForSanityDoc = (sanityId: string | null | undefined): ShowInfo | undefined =>
  sanityId ? Object.values(SHOWS).find((s) => s.sanityShowId === sanityId) : undefined;

export const tierText = (t: string | null | undefined): string =>
  t === 'vip' ? 'VIP' : t === 'ga-plus' ? 'GA+' : 'GA';
