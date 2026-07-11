import { useEffect, useMemo, useState } from 'react';
import { clearCart } from '../lib/cart';
import { qrSvg } from '../lib/qr';

type Status = 'loading' | 'complete' | 'open' | 'error';
interface Ticket {
  ticketCode: string;
  ticketTier: string;
  admits: number;
}

export default function CheckoutReturn() {
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [hasTicket, setHasTicket] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('session_id');
    if (!sessionId) {
      setStatus('error');
      return;
    }
    let cancelled = false;

    const lookup = async () =>
      (await fetch(`/api/checkout-session?session_id=${encodeURIComponent(sessionId)}`)).json() as Promise<{
        status?: string;
        email?: string | null;
        hasTicket?: boolean;
        ticket?: Ticket | null;
        error?: string;
      }>;

    (async () => {
      try {
        const data = await lookup();
        if (cancelled) return;
        if (data.status !== 'complete') {
          setStatus('open');
          return;
        }
        setEmail(data.email ?? null);
        setHasTicket(!!data.hasTicket);
        setStatus('complete');
        clearCart();

        // Ticket orders: the ticketCode is written by the webhook a beat later,
        // so poll briefly until it appears, then show the QR.
        if (data.hasTicket && !data.ticket?.ticketCode) {
          for (let i = 0; i < 6 && !cancelled; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            if (cancelled) return;
            const again = await lookup();
            if (again.ticket?.ticketCode) {
              setTicket(again.ticket);
              return;
            }
          }
        } else if (data.ticket?.ticketCode) {
          setTicket(data.ticket);
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const qr = useMemo(() => {
    if (!ticket) return '';
    const url = `${window.location.origin}/ticket?c=${encodeURIComponent(ticket.ticketCode)}`;
    return qrSvg(url, { cellSize: 5, margin: 3 });
  }, [ticket]);

  if (status === 'loading') return <p className="return__lead">Confirming your order…</p>;

  if (status === 'complete') {
    return (
      <>
        <h1 className="return__title">Thank you!</h1>
        <p className="return__lead">
          Your order is confirmed{email ? ` — a receipt is on its way to ${email}.` : '.'}
        </p>

        {hasTicket && (
          <div className="return__ticket">
            {ticket ? (
              <>
                <p className="return__ticketlabel">
                  🎟️ Your {ticket.tier === 'vip' ? 'VIP ' : ''}ticket
                  {ticket.admits > 1 ? ` (admits ${ticket.admits})` : ''} — show this at the door
                </p>
                <div
                  className="return__qr"
                  aria-label="Ticket QR code"
                  dangerouslySetInnerHTML={{ __html: qr }}
                />
                <a className="return__ticketlink" href={`/ticket?c=${encodeURIComponent(ticket.ticketCode)}`}>
                  Open / save your ticket →
                </a>
                <p className="return__sub">It’s also in your confirmation email.</p>
              </>
            ) : (
              <p className="return__lead">Preparing your ticket…</p>
            )}
          </div>
        )}

        <p className="return__sub">We’ll email you when your order ships.</p>
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
