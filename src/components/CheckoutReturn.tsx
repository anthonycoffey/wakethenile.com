import { useEffect, useState } from 'react';
import { clearCart } from '../lib/cart';

type Status = 'loading' | 'complete' | 'open' | 'error';

export default function CheckoutReturn() {
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('session_id');
    if (!sessionId) {
      setStatus('error');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/checkout-session?session_id=${encodeURIComponent(sessionId)}`);
        const data = (await res.json()) as { status?: string; email?: string | null; error?: string };
        if (!res.ok) throw new Error(data.error || 'lookup failed');
        if (data.status === 'complete') {
          setEmail(data.email ?? null);
          setStatus('complete');
          clearCart();
        } else {
          setStatus('open');
        }
      } catch {
        setStatus('error');
      }
    })();
  }, []);

  if (status === 'loading') return <p className="return__lead">Confirming your order…</p>;

  if (status === 'complete') {
    return (
      <>
        <h1 className="return__title">Thank you!</h1>
        <p className="return__lead">
          Your order is confirmed{email ? ` — a receipt is on its way to ${email}.` : '.'}
        </p>
        <p className="return__sub">We’ll email you when it ships.</p>
        <a className="return__btn" href="/merch">
          Continue shopping
        </a>
      </>
    );
  }

  if (status === 'open') {
    return (
      <>
        <h1 className="return__title">Payment processing</h1>
        <p className="return__lead">Your payment is still being processed. This can take a moment.</p>
        <a className="return__btn" href="/cart">
          Back to cart
        </a>
      </>
    );
  }

  return (
    <>
      <h1 className="return__title">Something went wrong</h1>
      <p className="return__lead">
        We couldn’t confirm your order. If you were charged, contact us and we’ll sort it out.
      </p>
      <a className="return__btn" href="/cart">
        Back to cart
      </a>
    </>
  );
}
