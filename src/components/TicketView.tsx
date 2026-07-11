import { useEffect, useMemo, useState } from 'react';
import { qrSvg } from '../lib/qr';

type Tier = 'ga' | 'vip';
interface Ticket {
  name: string | null;
  tier: Tier;
  admits: number;
  checkedInAt: string | null;
}
type Status = 'loading' | 'ready' | 'notfound' | 'error';

const PIN_KEY = 'wtn_staff_pin';
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

export default function TicketView() {
  const [status, setStatus] = useState<Status>('loading');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [code, setCode] = useState<string>('');
  const [staffPin, setStaffPin] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkinMsg, setCheckinMsg] = useState<string | null>(null);

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('c') ?? '';
    setCode(c);
    setStaffPin(localStorage.getItem(PIN_KEY));
    if (!c) {
      setStatus('error');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/ticket?c=${encodeURIComponent(c)}`);
        if (res.status === 404) return setStatus('notfound');
        const data = (await res.json()) as Ticket & { error?: string };
        if (!res.ok) throw new Error(data.error || 'lookup failed');
        setTicket({
          name: data.name ?? null,
          tier: data.tier === 'vip' ? 'vip' : 'ga',
          admits: data.admits ?? 1,
          checkedInAt: data.checkedInAt ?? null,
        });
        setStatus('ready');
      } catch {
        setStatus('error');
      }
    })();
  }, []);

  const qr = useMemo(() => {
    if (!code) return '';
    const url = `${window.location.origin}/ticket?c=${encodeURIComponent(code)}`;
    return qrSvg(url, { cellSize: 6, margin: 3 });
  }, [code]);

  function unlockStaff() {
    const pin = window.prompt('Enter the door PIN to enable check-in:');
    if (pin) {
      localStorage.setItem(PIN_KEY, pin);
      setStaffPin(pin);
    }
  }

  async function checkIn() {
    if (!staffPin || checking) return;
    setChecking(true);
    setCheckinMsg(null);
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, pin: staffPin }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        alreadyCheckedIn?: boolean;
        checkedInAt?: string;
        error?: string;
      };
      if (res.status === 401) {
        localStorage.removeItem(PIN_KEY);
        setStaffPin(null);
        setCheckinMsg('Wrong PIN — re-enter it and try again.');
        return;
      }
      if (!res.ok || !data.ok) throw new Error(data.error || 'check-in failed');
      setTicket((t) => (t ? { ...t, checkedInAt: data.checkedInAt ?? new Date().toISOString() } : t));
      setCheckinMsg(
        data.alreadyCheckedIn
          ? `Already checked in at ${data.checkedInAt ? fmtTime(data.checkedInAt) : 'earlier'}.`
          : 'Checked in ✓',
      );
    } catch {
      setCheckinMsg('Could not check in — try again.');
    } finally {
      setChecking(false);
    }
  }

  if (status === 'loading') return <p className="ticket__lead">Loading ticket…</p>;
  if (status === 'notfound')
    return (
      <div className="ticket__lead">
        <h1 className="ticket__title">Ticket not found</h1>
        <p>This ticket link isn’t valid. Check your confirmation email for the correct link.</p>
      </div>
    );
  if (status === 'error' || !ticket)
    return (
      <div className="ticket__lead">
        <h1 className="ticket__title">Something went wrong</h1>
        <p>We couldn’t load this ticket. Please try again.</p>
      </div>
    );

  const isVip = ticket.tier === 'vip';
  const checkedIn = !!ticket.checkedInAt;

  return (
    <div className={`ticket ${isVip ? 'ticket--vip' : ''}`}>
      <span className={`ticket__badge ${isVip ? 'ticket__badge--vip' : ''}`}>
        {isVip ? 'VIP · Ultimate Fan' : 'General Admission'}
      </span>
      <h1 className="ticket__title">Wake the Nile — Sep 19</h1>
      <p className="ticket__venue">Maggie Mae’s Upstairs</p>
      {ticket.name && <p className="ticket__name">{ticket.name}</p>}
      <p className="ticket__admits">Admits {ticket.admits}</p>

      <div className="ticket__qr" aria-label="Ticket QR code" dangerouslySetInnerHTML={{ __html: qr }} />
      <p className="ticket__hint">Show this QR code at the door.</p>

      {checkedIn ? (
        <p className="ticket__status ticket__status--in">✓ Checked in · {fmtTime(ticket.checkedInAt!)}</p>
      ) : (
        <p className="ticket__status">Not yet checked in</p>
      )}

      {/* Staff-only controls: visible once this device has unlocked the door PIN. */}
      <div className="ticket__staff">
        {staffPin ? (
          <>
            <button
              type="button"
              className="ticket__checkin"
              onClick={checkIn}
              disabled={checking || checkedIn}
            >
              {checkedIn ? 'Already checked in' : checking ? 'Checking in…' : '✓ Check in at door'}
            </button>
            {checkinMsg && <p className="ticket__checkinmsg">{checkinMsg}</p>}
          </>
        ) : (
          <button type="button" className="ticket__stafflink" onClick={unlockStaff}>
            Staff check-in
          </button>
        )}
      </div>
    </div>
  );
}
