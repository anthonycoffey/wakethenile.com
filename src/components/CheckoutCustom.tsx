import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  CheckoutElementsProvider,
  useCheckoutElements,
  ContactDetailsElement,
  ShippingAddressElement,
  PaymentElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} from '@stripe/react-stripe-js/checkout';
import { getCart } from '../lib/cart';

interface Props {
  publishableKey?: string;
}

// Dark, gold-on-black theme to match the site (Stripe Appearance API).
const appearance = {
  theme: 'night' as const,
  variables: {
    colorPrimary: '#ddae2d',
    colorBackground: '#0d0d0d',
    colorText: '#e8dcc0',
    colorTextSecondary: '#cbb27a',
    colorDanger: '#ff6b6b',
    fontFamily: '"Martel Sans", system-ui, sans-serif',
    borderRadius: '8px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': {
      backgroundColor: '#151515',
      border: '1px solid rgba(221,174,45,0.30)',
      color: '#e8dcc0',
    },
    '.Input:focus': { border: '1px solid #ddae2d', boxShadow: '0 0 0 1px #ddae2d' },
    '.Label': { color: '#cbb27a', fontWeight: '600' },
    '.Tab, .Block, .PickerItem': {
      backgroundColor: '#151515',
      border: '1px solid rgba(221,174,45,0.25)',
    },
    '.Tab--selected, .PickerItem--selected': { borderColor: '#ddae2d' },
  },
};

// checkout amounts come through as pre-formatted strings or {amount} objects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function amountText(a: any): string {
  if (a == null) return '';
  if (typeof a === 'string') return a;
  if (typeof a === 'object') return a.amount ?? a.total?.amount ?? '';
  return String(a);
}

// Pickup-only products (ticket + VIP experience bundle) — these carts ship
// nothing. Mirrors PICKUP_ELIGIBLE_PRODUCT_IDS in functions/api/checkout.ts.
const TICKET_PRODUCT_ID = '2480f00d-9317-4ed0-9406-bcef1e34bc71';
const EXPERIENCE_PRODUCT_ID = 'b351d11f-4c78-4a1f-b36b-c10d951c96ea'; // includes pickup-at-show merch
const PICKUP_PRODUCT_IDS = new Set([TICKET_PRODUCT_ID, EXPERIENCE_PRODUCT_ID]);

function CheckoutForm({
  allPickup,
  hasPickupMerch,
  clientSecret,
}: {
  allPickup: boolean;
  hasPickupMerch: boolean;
  clientSecret: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = useCheckoutElements() as any;
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState('');
  const shippingInit = useRef(false);

  // --- Promo code state ---
  const [promoCode, setPromoCode] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoMsg, setPromoMsg] = useState<string | null>(null);
  const [promoIsError, setPromoIsError] = useState(false);
  // Stripe has a known live-mode quirk: applyPromotionCode() can wrongly
  // report "invalid" if the Payment Element hasn't finished loading yet.
  // Gate the Apply button on its onReady callback so that can't happen.
  const [paymentReady, setPaymentReady] = useState(false);

  const checkout = state?.type === 'success' ? state.checkout : null;

  // Pre-select the first shipping option so the total is complete immediately.
  useEffect(() => {
    if (checkout && !shippingInit.current) {
      const opts = checkout.shippingOptions;
      if (opts && opts.length && !checkout.selectedShippingOption) {
        shippingInit.current = true;
        Promise.resolve(checkout.updateShippingOption(opts[0].id)).catch(() => {});
      }
    }
  }, [checkout]);

  // Auto-apply a promo armed by the presale upsell (see /superfans → /merch
  // modal). On success it clears the flag so a reload can't reapply.
  //
  // Stripe's applyPromotionCode() can spuriously return "invalid" for a valid
  // code if it's called the instant the Payment Element reports ready (a known
  // timing quirk — same reason the manual Apply button is gated on
  // `paymentReady`). So we retry with backoff across a few seconds.
  //
  // Critical: this effect depends ONLY on `paymentReady`, and reads the live
  // `checkout` from a ref. `useCheckout()` hands back a new `checkout` object
  // reference on every state change (e.g. the shipping-option auto-select above
  // fires right at load), so depending on `checkout` here would tear down and
  // re-run this effect mid-flight — cancelling the retry loop before any
  // attempt lands, which is exactly what broke the first version of this fix.
  const autoPromoStarted = useRef(false);
  const checkoutRef = useRef(checkout);
  checkoutRef.current = checkout;
  const promoAppliedRef = useRef(promoApplied);
  promoAppliedRef.current = promoApplied;
  useEffect(() => {
    if (!paymentReady || autoPromoStarted.current) return;
    const code = typeof window !== 'undefined' ? sessionStorage.getItem('wtn_promo') : null;
    if (!code) return;
    autoPromoStarted.current = true;
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 6 && !cancelled; attempt++) {
        await new Promise((r) => setTimeout(r, attempt === 0 ? 800 : 1000));
        if (cancelled || promoAppliedRef.current) return;
        const co = checkoutRef.current;
        if (!co) continue;
        try {
          const res = await co.applyPromotionCode(code);
          if (res?.type !== 'error') {
            setPromoApplied(true);
            setPromoCode(code);
            setPromoIsError(false);
            setPromoMsg('15% show offer applied.');
            if (typeof window !== 'undefined') sessionStorage.removeItem('wtn_promo');
            return;
          }
        } catch {
          /* transient — retry */
        }
      }
    })();
    // Only cancels on unmount now (paymentReady never flips back to false),
    // so ordinary re-renders can't kill the retry loop.
    return () => {
      cancelled = true;
    };
  }, [paymentReady]);

  if (state?.type === 'loading') return <p className="checkout__msg">Loading secure checkout…</p>;
  if (state?.type === 'error')
    return (
      <div className="checkout__msg checkout__msg--error">
        <p>{state.error?.message ?? 'Checkout error.'}</p>
        <a href="/cart">← Back to cart</a>
      </div>
    );
  if (!checkout) return <p className="checkout__msg">Loading…</p>;

  const total = amountText(checkout.total?.total ?? checkout.total);

  const applyPromo = async () => {
    const code = promoCode.trim();
    if (!code || promoBusy || !paymentReady) return;
    setPromoBusy(true);
    setPromoMsg(null);
    setPromoIsError(false);
    try {
      const res = await checkout.applyPromotionCode(code);
      if (res?.type === 'error') {
        setPromoIsError(true);
        setPromoMsg(res.error?.message ?? 'That code isn’t valid.');
      } else {
        setPromoApplied(true);
        setPromoIsError(false);
        setPromoMsg('Promo code applied.');
      }
    } catch (err) {
      setPromoIsError(true);
      setPromoMsg(err instanceof Error ? err.message : 'That code isn’t valid.');
    }
    setPromoBusy(false);
  };

  const removePromo = async () => {
    if (promoBusy) return;
    setPromoBusy(true);
    try {
      await checkout.removePromotionCode();
      setPromoApplied(false);
      setPromoCode('');
      setPromoMsg(null);
      setPromoIsError(false);
    } catch (err) {
      setPromoIsError(true);
      setPromoMsg(err instanceof Error ? err.message : 'Could not remove the code.');
    }
    setPromoBusy(false);
  };

  // Enter key in the promo field should apply the code, not submit payment.
  const onPromoKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyPromo();
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      // Pickup-only orders collect no address, so persist the typed name onto
      // the session for the order/ticket. Best-effort — never blocks payment.
      if (allPickup && buyerName.trim()) {
        try {
          await fetch('/api/set-buyer-name', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionId: clientSecret.split('_secret_')[0],
              name: buyerName.trim(),
            }),
          });
        } catch {
          /* non-blocking */
        }
      }
      const res = await checkout.confirm();
      if (res?.type === 'error') setMessage(res.error?.message ?? 'Payment failed.');
      // success → Stripe redirects to the return_url automatically.
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Payment failed.');
    }
    setSubmitting(false);
  };

  return (
    <form className="ccheckout" onSubmit={onSubmit}>
      <section className="ccheckout__section">
        <h3 className="ccheckout__h">Contact</h3>
        <ContactDetailsElement />
      </section>

      {allPickup ? (
        <section className="ccheckout__section">
          <h3 className="ccheckout__h">Your name</h3>
          <input
            type="text"
            className="ccheckout__promo-input ccheckout__nameinput"
            placeholder="Full name"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            autoComplete="name"
            aria-label="Full name"
          />
          <p className="ccheckout__notice">
            {hasPickupMerch ? (
              <>
                🎟️ Your ticket &amp; merch — your QR ticket is shown right after checkout and emailed
                to you; pick up your merch at the Merch booth on show night. Nothing ships.
              </>
            ) : (
              <>
                🎟️ Digital ticket — your ticket &amp; QR code are shown right after checkout and
                emailed to you. Nothing ships.
              </>
            )}
          </p>
        </section>
      ) : (
        <section className="ccheckout__section">
          <h3 className="ccheckout__h">Shipping address</h3>
          <ShippingAddressElement />
        </section>
      )}

      {checkout.shippingOptions?.length > 0 && (
        <section className="ccheckout__section">
          <h3 className="ccheckout__h">Shipping</h3>
          <div className="ccheckout__ships">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {checkout.shippingOptions.map((o: any, idx: number) => (
              <label key={o.id} className="ccheckout__ship">
                <input
                  type="radio"
                  name="shipopt"
                  defaultChecked={idx === 0}
                  onChange={() => checkout.updateShippingOption(o.id)}
                />
                <span className="ccheckout__ship-name">{o.displayName ?? o.label ?? 'Shipping'}</span>
                <span className="ccheckout__ship-amt">{amountText(o.amount)}</span>
              </label>
            ))}
          </div>
          <p className="ccheckout__shipnote">We currently ship within the US only — no international shipping.</p>
        </section>
      )}

      <section className="ccheckout__section">
        <h3 className="ccheckout__h">Promo code</h3>
        <div className="ccheckout__promo">
          <input
            type="text"
            className="ccheckout__promo-input"
            placeholder="Enter code"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            onKeyDown={onPromoKeyDown}
            disabled={promoBusy || promoApplied || submitting}
            autoComplete="off"
            aria-label="Promo code"
          />
          {!promoApplied ? (
            <button
              type="button"
              className="ccheckout__promo-btn"
              onClick={applyPromo}
              disabled={promoBusy || submitting || !promoCode.trim() || !paymentReady}
            >
              {!paymentReady ? 'Loading…' : promoBusy ? 'Applying…' : 'Apply'}
            </button>
          ) : (
            <button
              type="button"
              className="ccheckout__promo-btn ccheckout__promo-btn--remove"
              onClick={removePromo}
              disabled={promoBusy || submitting}
            >
              Remove
            </button>
          )}
        </div>
        {promoMsg && (
          <p
            className={
              promoIsError ? 'ccheckout__promo-msg ccheckout__promo-msg--error' : 'ccheckout__promo-msg ccheckout__promo-msg--success'
            }
          >
            {promoMsg}
          </p>
        )}
      </section>

      <section className="ccheckout__section">
        <h3 className="ccheckout__h">Payment</h3>
        <PaymentElement onReady={() => setPaymentReady(true)} />
      </section>

      {total && (
        <div className="ccheckout__total">
          <span>Total</span>
          <span>{total}</span>
        </div>
      )}

      <button
        className="ccheckout__pay"
        type="submit"
        disabled={submitting || state.type !== 'success' || (allPickup && !buyerName.trim())}
      >
        {submitting ? 'Processing…' : total ? `Pay ${total}` : 'Pay now'}
      </button>

      {message && <p className="ccheckout__error">{message}</p>}
    </form>
  );
}

export default function CheckoutCustom({ publishableKey }: Props) {
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [ui, setUi] = useState<'loading' | 'empty' | 'error' | 'ready'>('loading');
  const [err, setErr] = useState<string | null>(null);
  const [allPickup, setAllPickup] = useState(false);
  const [hasPickupMerch, setHasPickupMerch] = useState(false);

  useEffect(() => {
    if (!publishableKey) {
      setUi('error');
      setErr('Checkout isn’t configured yet — the Stripe publishable key is missing.');
      return;
    }
    const cart = getCart();
    const items = cart.map((i) => ({
      productId: i.productId,
      sku: i.sku,
      qty: i.qty,
      options: i.options,
    }));
    if (items.length === 0) {
      setUi('empty');
      return;
    }
    setAllPickup(cart.length > 0 && cart.every((i) => PICKUP_PRODUCT_IDS.has(i.productId)));
    setHasPickupMerch(cart.some((i) => i.productId === EXPERIENCE_PRODUCT_ID));
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ items }),
        });
        const data = (await res.json()) as { clientSecret?: string; error?: string };
        if (!res.ok || !data.clientSecret) throw new Error(data.error || 'Could not start checkout.');
        if (!cancelled) {
          setClientSecret(data.clientSecret);
          setUi('ready');
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : 'Could not start checkout.');
          setUi('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publishableKey]);

  if (ui === 'loading') return <p className="checkout__msg">Preparing secure checkout…</p>;
  if (ui === 'empty')
    return (
      <p className="checkout__msg">
        Your cart is empty. <a href="/merch">Shop merch →</a>
      </p>
    );
  if (ui === 'error')
    return (
      <div className="checkout__msg checkout__msg--error">
        <p>{err}</p>
        <a href="/cart">← Back to cart</a>
      </div>
    );

  return (
    <CheckoutElementsProvider
      stripe={stripePromise}
      options={{ clientSecret: clientSecret!, elementsOptions: { appearance } }}
    >
      <CheckoutForm allPickup={allPickup} hasPickupMerch={hasPickupMerch} clientSecret={clientSecret!} />
    </CheckoutElementsProvider>
  );
}
