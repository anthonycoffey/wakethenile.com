import { useEffect, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { getCart } from '../lib/cart';

interface Props {
  publishableKey?: string;
}

export default function CheckoutEmbed({ publishableKey }: Props) {
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'empty' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publishableKey) {
      setState('error');
      setError('Checkout isn’t configured yet — the Stripe publishable key is missing.');
      return;
    }
    const items = getCart().map((i) => ({ productId: i.productId, sku: i.sku, qty: i.qty }));
    if (items.length === 0) {
      setState('empty');
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
          setState('ready');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not start checkout.');
          setState('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publishableKey]);

  if (state === 'loading') return <p className="checkout__msg">Preparing secure checkout…</p>;
  if (state === 'empty')
    return (
      <p className="checkout__msg">
        Your cart is empty. <a href="/shop">Shop merch →</a>
      </p>
    );
  if (state === 'error')
    return (
      <div className="checkout__msg checkout__msg--error">
        <p>{error}</p>
        <a href="/cart">← Back to cart</a>
      </div>
    );

  return (
    <div className="checkout__embed">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret: clientSecret! }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
