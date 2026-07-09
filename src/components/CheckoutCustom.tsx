import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
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

function CheckoutForm() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = useCheckoutElements() as any;
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const shippingInit = useRef(false);

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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
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

      <section className="ccheckout__section">
        <h3 className="ccheckout__h">Shipping address</h3>
        <ShippingAddressElement />
      </section>

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
        </section>
      )}

      <section className="ccheckout__section">
        <h3 className="ccheckout__h">Payment</h3>
        <PaymentElement />
      </section>

      {total && (
        <div className="ccheckout__total">
          <span>Total</span>
          <span>{total}</span>
        </div>
      )}

      <button className="ccheckout__pay" type="submit" disabled={submitting || state.type !== 'success'}>
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

  useEffect(() => {
    if (!publishableKey) {
      setUi('error');
      setErr('Checkout isn’t configured yet — the Stripe publishable key is missing.');
      return;
    }
    const items = getCart().map((i) => ({ productId: i.productId, sku: i.sku, qty: i.qty }));
    if (items.length === 0) {
      setUi('empty');
      return;
    }
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
      <CheckoutForm />
    </CheckoutElementsProvider>
  );
}import { useEffect, useMemo, useRef, useState } from 'react';
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

function CheckoutForm() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = useCheckoutElements() as any;
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const shippingInit = useRef(false);

  // --- Promo code state ---
  const [promoCode, setPromoCode] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoMsg, setPromoMsg] = useState<string | null>(null);
  const [promoIsError, setPromoIsError] = useState(false);

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
    if (!code || promoBusy) return;
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

      <section className="ccheckout__section">
        <h3 className="ccheckout__h">Shipping address</h3>
        <ShippingAddressElement />
      </section>

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
              disabled={promoBusy || submitting || !promoCode.trim()}
            >
              {promoBusy ? 'Applying…' : 'Apply'}
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
        <PaymentElement />
      </section>

      {total && (
        <div className="ccheckout__total">
          <span>Total</span>
          <span>{total}</span>
        </div>
      )}

      <button className="ccheckout__pay" type="submit" disabled={submitting || state.type !== 'success'}>
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

  useEffect(() => {
    if (!publishableKey) {
      setUi('error');
      setErr('Checkout isn’t configured yet — the Stripe publishable key is missing.');
      return;
    }
    const items = getCart().map((i) => ({ productId: i.productId, sku: i.sku, qty: i.qty }));
    if (items.length === 0) {
      setUi('empty');
      return;
    }
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
      <CheckoutForm />
    </CheckoutElementsProvider>
  );
}
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

function CheckoutForm() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = useCheckoutElements() as any;
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const shippingInit = useRef(false);

  // --- Promo code state ---
  const [promoCode, setPromoCode] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoMsg, setPromoMsg] = useState<string | null>(null);
  const [promoIsError, setPromoIsError] = useState(false);

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
    if (!code || promoBusy) return;
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

      <section className="ccheckout__section">
        <h3 className="ccheckout__h">Shipping address</h3>
        <ShippingAddressElement />
      </section>

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
              disabled={promoBusy || submitting || !promoCode.trim()}
            >
              {promoBusy ? 'Applying…' : 'Apply'}
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
        <PaymentElement />
      </section>

      {total && (
        <div className="ccheckout__total">
          <span>Total</span>
          <span>{total}</span>
        </div>
      )}

      <button className="ccheckout__pay" type="submit" disabled={submitting || state.type !== 'success'}>
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

  useEffect(() => {
    if (!publishableKey) {
      setUi('error');
      setErr('Checkout isn’t configured yet — the Stripe publishable key is missing.');
      return;
    }
    const items = getCart().map((i) => ({ productId: i.productId, sku: i.sku, qty: i.qty }));
    if (items.length === 0) {
      setUi('empty');
      return;
    }
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
      <CheckoutForm />
    </CheckoutElementsProvider>
  );
}
