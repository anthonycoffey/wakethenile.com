import { useEffect, useMemo, useState } from 'react';
import { qrSvg } from '../lib/qr';

type Tier = 'ga' | 'vip' | 'ga-plus';
interface Ticket {
  name: string | null;
  tier: Tier;
  admits: number;
  /** How many of `admits` have already come through the door. */
  admitted: number;
  checkedInAt: string | null;
}
type Status = 'loading' | 'ready' | 'notfound' | 'error' | 'void';

const PIN_KEY = 'wtn_staff_pin';
const partyBtn = {
  width: 40, height: 40, borderRadius: 8, fontSize: '1.3rem', lineHeight: 1, cursor: 'pointer',
} as const;
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

export default function TicketView() {
  const [status, setStatus] = useState<Status>('loading');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [code, setCode] = useState<string>('');
  const [staffPin, setStaffPin] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkinMsg, setCheckinMsg] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const [party, setParty] = useState(1);
  const seatsLeft = ticket ? Math.max(0, ticket.admits - ticket.admitted) : 0;
  // Another lane can admit people while this page sits open. When the server
  // corrects the count, pull `party` back inside it — otherwise the button
  // stays enabled asking for more than is left and 409s on every press.
  useEffect(() => {
    setParty((p) => Math.min(Math.max(1, p), Math.max(1, seatsLeft)));
  }, [seatsLeft]);
  const [voidReason, setVoidReason] = useState<string | null>(null);

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
        const res = await fetch(`/api/ticket?c=${encodeURIComponent(c)}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (res.status === 404) return setStatus('notfound');
        const data = (await res.json()) as Ticket & { error?: string };
        // 410 = refunded or cancelled. This is a refusal, not a failure, and it
        // must read as one — staff will wave someone through on "try again".
        if (res.status === 410) {
          setVoidReason(data.error || 'This ticket is no longer valid.');
          return setStatus('void');
        }
        if (!res.ok) throw new Error(data.error || 'lookup failed');
        setTicket({
          name: data.name ?? null,
          tier: data.tier === 'vip' || data.tier === 'ga-plus' ? data.tier : 'ga',
          admits: Math.max(1, data.admits ?? 1),
          admitted: Math.max(0, data.admitted ?? 0),
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

  async function checkIn(undo = false) {
    if (!staffPin || checking) return;
    setChecking(true);
    setRefused(false);
    setCheckinMsg(null);
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, pin: staffPin, party, undo }),
        signal: AbortSignal.timeout(10000),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        alreadyCheckedIn?: boolean;
        checkedInAt?: string | null;
        admitted?: number;
        remaining?: number;
        undone?: number;
        error?: string;
      };
      if (res.status === 401) {
        localStorage.removeItem(PIN_KEY);
        setStaffPin(null);
        setCheckinMsg('Wrong PIN — re-enter it and try again.');
        return;
      }
      // A refused ticket gets its own loud state. Never fold it into the
       // generic retry message — that is how a void ticket gets admitted.
      if (res.status === 410 || res.status === 404) {
        setRefused(true);
        setCheckinMsg(
          res.status === 404
            ? '⛔ TICKET NOT FOUND — DO NOT ADMIT'
            : `⛔ ${(data.error || 'Not valid').toUpperCase()}`,
        );
        return;
      }
      // 409 = the counter says no (all used, or the party is bigger than
      // what's left). Not a retryable error — show the count, let staff judge.
      if (res.status === 409) {
        // A *counted* refusal (the ticket is used up) gets the red treatment.
        // A bare conflict does not — that's a retry, not a person to turn away.
        if (typeof data.admitted === 'number') {
          setTicket((t) =>
            t ? { ...t, admitted: data.admitted!, checkedInAt: data.checkedInAt ?? t.checkedInAt } : t,
          );
          setRefused(true);
        }
        setCheckinMsg(data.error || 'No admissions left on this ticket.');
        return;
      }
      // 5xx: the write may or may not have landed. Never say "try again" —
      // that invites a second admission on top of one that already counted.
      if (res.status >= 500) {
        setCheckinMsg(data.error || 'No confirmation — reload this ticket before scanning again.');
        return;
      }
      if (!res.ok || !data.ok) throw new Error(data.error || 'check-in failed');

      const seats = ticket?.admits ?? 1;
      const admitted = data.admitted ?? 0;
      setTicket((t) => (t ? { ...t, admitted, checkedInAt: data.checkedInAt ?? null } : t));
      setParty(1);
      if (undo) {
        setCheckinMsg(`Undone — ${admitted} of ${seats} still admitted.`);
      } else {
        setCheckinMsg(
          seats > 1
            ? `Let ${party} in ✓ — ${admitted} of ${seats} admitted, ${Math.max(0, seats - admitted)} still to come.`
            : 'Checked in ✓',
        );
      }
    } catch (e) {
      // A timeout is genuinely ambiguous — the write may or may not have
      // landed. Say so rather than implying a clean failure.
      setCheckinMsg(
        e instanceof DOMException && e.name === 'TimeoutError'
          ? 'No response — check wifi. This scan may or may not have registered; reload to confirm.'
          : 'Could not check in — try again.',
      );
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
  // Refused, not broken. Loud, red, and unmistakably terminal — door staff
  // under queue pressure must not read this as a connection problem.
  if (status === 'void')
    return (
      <div
        className="ticket__lead"
        style={{
          background: '#7f1d1d', color: '#fff', padding: '28px 20px',
          borderRadius: 12, textAlign: 'center',
        }}
      >
        <h1 className="ticket__title" style={{ color: '#fff', margin: '0 0 8px' }}>
          ⛔ DO NOT ADMIT
        </h1>
        <p style={{ margin: 0, fontSize: '1.05rem' }}>
          {voidReason ?? 'This ticket is no longer valid.'}
        </p>
      </div>
    );
  if (status === 'error' || !ticket)
    return (
      <div className="ticket__lead">
        <h1 className="ticket__title">Something went wrong</h1>
        <p>We couldn’t load this ticket. Please try again.</p>
      </div>
    );

  const remaining = Math.max(0, ticket.admits - ticket.admitted);
  const isVip = ticket.tier === 'vip';
  const isGaPlus = ticket.tier === 'ga-plus';
  const checkedIn = !!ticket.checkedInAt;

  return (
    <div className={`ticket ${isVip ? 'ticket--vip' : isGaPlus ? 'ticket--ga-plus' : ''}`}>
      <span className={`ticket__badge ${isVip ? 'ticket__badge--vip' : isGaPlus ? 'ticket__badge--ga-plus' : ''}`}>
        {isVip ? 'VIP · Ultimate Fan' : isGaPlus ? 'GA+ · Free Drinks All Night' : 'General Admission'}
      </span>
      <h1 className="ticket__title">Wake the Nile — Sep 19</h1>
      <p className="ticket__venue">Dwell Coworking Manchaca Auditorium</p>
      {ticket.name && <p className="ticket__name">{ticket.name}</p>}
      <p className="ticket__admits">Admits {ticket.admits}</p>

      <div className="ticket__qr" aria-label="Ticket QR code" dangerouslySetInnerHTML={{ __html: qr }} />
      <p className="ticket__hint">Show this QR code at the door.</p>

      {refused ? (
        <p
          className="ticket__status"
          style={{ background: '#7f1d1d', color: '#fff', padding: '10px 14px', borderRadius: 8 }}
        >
          {checkinMsg}
        </p>
      ) : checkedIn ? (
        <p className="ticket__status ticket__status--in">
          {ticket.admits > 1
            ? `${ticket.admitted} of ${ticket.admits} admitted · first at ${fmtTime(ticket.checkedInAt!)}`
            : `✓ Checked in · ${fmtTime(ticket.checkedInAt!)}`}
        </p>
      ) : (
        <p className="ticket__status">Not yet checked in</p>
      )}

      {/* Staff-only controls: visible once this device has unlocked the door PIN. */}
      <div className="ticket__staff">
        {staffPin ? (
          <>
            {/* A party doesn't always arrive together, so staff say how many
                are standing in front of them rather than burning the whole
                ticket on the first scan. */}
            {ticket.admits > 1 && remaining > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 10 }}>
                <button type="button" aria-label="Fewer people" onClick={() => setParty((n) => Math.max(1, n - 1))} disabled={checking || party <= 1} style={partyBtn}>−</button>
                <span style={{ minWidth: 130, textAlign: 'center' }}>
                  Letting in <strong>{party}</strong> of {remaining} left
                </span>
                <button type="button" aria-label="More people" onClick={() => setParty((n) => Math.min(remaining, n + 1))} disabled={checking || party >= remaining} style={partyBtn}>+</button>
              </div>
            )}
            <button
              type="button"
              className="ticket__checkin"
              onClick={() => checkIn(false)}
              disabled={checking || remaining <= 0}
            >
              {remaining <= 0
                ? `All ${ticket.admits} admitted`
                : checking
                  ? 'Checking in…'
                  : ticket.admits > 1
                    ? `✓ Let ${party} in`
                    : '✓ Check in at door'}
            </button>
            {ticket.admitted > 0 && (
              <button
                type="button"
                className="ticket__stafflink"
                onClick={() => checkIn(true)}
                disabled={checking}
                style={{ marginTop: 8 }}
              >
                Undo — scanned the wrong ticket
              </button>
            )}
            {!refused && checkinMsg && <p className="ticket__checkinmsg">{checkinMsg}</p>}
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
