import { useEffect, useMemo, useState } from 'react';

interface TierBreakdown {
  tier: 'ga' | 'vip' | 'ga-plus';
  admits: number;
}
interface Attendee {
  name: string | null;
  email: string | null;
  tier: 'ga' | 'vip' | 'ga-plus' | null;
  admits: number | null;
  admitted: number | null;
  checkedInAt: string | null;
  ticketCode: string | null;
  channel: 'web' | 'booth' | null;
  // Only set when the order mixes tiers (e.g. one VIP + one GA) — otherwise
  // `tier`/`admits` above already fully describe the order.
  breakdown: TierBreakdown[] | null;
}
type ShowStatus = 'open' | 'upcoming' | 'past';
interface ShowSummary {
  id: string;
  label: string;
  dateText: string;
  venue: string;
  /** 'open' = the door is checking this show in; 'past' = frozen, view only. */
  status: ShowStatus;
  tickets?: number | null;
  admits?: number | null;
  inRoom?: number | null;
}
type Status = 'locked' | 'picking' | 'loading' | 'ready' | 'error';

const PIN_KEY = 'wtn_staff_pin';
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
// A mixed cart (one VIP + one GA) reads as "VIP × 2" if we show just the
// headline tier + summed admits — spell out what's actually in the order.
const tierLabel = (r: Attendee): string =>
  r.breakdown && r.breakdown.length > 1
    ? r.breakdown.map((b) => `${b.admits}× ${b.tier.toUpperCase()}`).join(' + ')
    : (r.tier ?? 'ga').toUpperCase();
const STATUS_TEXT: Record<ShowStatus, string> = {
  open: 'Check-in open',
  upcoming: 'Upcoming',
  past: 'Past · check-in closed',
};

/**
 * Staff attendee lists, one show at a time (ADR 0009). After the door PIN,
 * staff pick a show: the one the door is admitting is marked "Check-in open";
 * past shows open read-only — the server refuses check-in for them anyway.
 */
export default function AttendeeList() {
  const [status, setStatus] = useState<Status>('locked');
  const [pinInput, setPinInput] = useState('');
  const [rows, setRows] = useState<Attendee[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [show, setShow] = useState<ShowSummary | null>(null);
  const [shows, setShows] = useState<ShowSummary[]>([]);

  /** Fetch with the door PIN; a 401 drops back to the lock screen. */
  async function staffFetch<T>(pin: string, qs: string): Promise<T | null> {
    const res = await fetch(`/api/attendees?${qs}`, { headers: { 'x-staff-pin': pin } });
    if (res.status === 401) {
      localStorage.removeItem(PIN_KEY);
      setStatus('locked');
      setErr('Wrong door PIN.');
      return null;
    }
    const data = (await res.json()) as T & { error?: string };
    if (!res.ok) throw new Error(data.error || 'load failed');
    localStorage.setItem(PIN_KEY, pin);
    return data;
  }

  async function loadShows(pin: string) {
    setStatus('loading');
    setErr(null);
    try {
      const data = await staffFetch<{ shows?: ShowSummary[] }>(pin, 'shows=1');
      if (!data) return;
      setShows(data.shows ?? []);
      setStatus('picking');
    } catch {
      setStatus('error');
    }
  }

  async function openShow(id: string) {
    const pin = localStorage.getItem(PIN_KEY);
    if (!pin) return setStatus('locked');
    setStatus('loading');
    setQ('');
    try {
      const data = await staffFetch<{ attendees?: Attendee[]; show?: ShowSummary }>(
        pin,
        `show=${encodeURIComponent(id)}`,
      );
      if (!data) return;
      setRows(data.attendees ?? []);
      setShow(data.show ?? null);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem(PIN_KEY);
    if (saved) loadShows(saved);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      `${r.name ?? ''} ${r.email ?? ''}`.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const totals = useMemo(() => {
    const admits = rows.reduce((n, r) => n + (r.admits ?? 1), 0);
    // Count PEOPLE through the door, not orders scanned — a 4-admit ticket
    // that has let 2 in is 2 people, not 1 and not 4.
    const inCount = rows.reduce((n, r) => n + (r.admitted ?? (r.checkedInAt ? 1 : 0)), 0);
    const walkUps = rows.filter((r) => r.channel === 'booth').length;
    return { orders: rows.length, admits, inCount, walkUps };
  }, [rows]);

  function downloadCsv() {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Name', 'Email', 'Tier', 'Admits', 'Admitted', 'Sold via', 'First arrival', 'Code (last 6)'];
    const lines = rows.map((r) =>
      [r.name, r.email, tierLabel(r), r.admits ?? 1,
       r.admitted ?? (r.checkedInAt ? 1 : 0), r.channel ?? 'web', r.checkedInAt ?? '',
       // Ticket codes are bearer credentials — a shared CSV would be a
       // credential dump. Last 6 is enough to reconcile a row by hand.
       (r.ticketCode ?? '').slice(-6)]
        .map(esc)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wtn-attendees-${show?.id ?? new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (status === 'locked' || (status === 'error' && shows.length === 0)) {
    return (
      <form
        className="att__lock"
        onSubmit={(e) => {
          e.preventDefault();
          if (pinInput.trim()) loadShows(pinInput.trim());
        }}
      >
        <h1 className="att__title">Attendees</h1>
        <p className="att__sub">Staff only — enter the door PIN.</p>
        <input
          type="password"
          className="att__pin"
          placeholder="Door PIN"
          value={pinInput}
          onChange={(e) => setPinInput(e.target.value)}
          autoFocus
        />
        <button type="submit" className="att__btn">Unlock</button>
        {err && <p className="att__err">{err}</p>}
        {status === 'error' && !err && <p className="att__err">Couldn’t load — check the connection and try again.</p>}
      </form>
    );
  }

  if (status === 'loading') return <p className="att__sub">Loading…</p>;

  if (status === 'picking' || (status === 'error' && !show)) {
    return (
      <div className="att">
        <h1 className="att__title">Attendees</h1>
        <p className="att__sub att__sub--left">Choose a show.</p>
        <ul className="att__shows">
          {shows.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`att__show att__show--${s.status}`}
                onClick={() => openShow(s.id)}
              >
                <span className="att__showname">{s.label}</span>
                <span className="att__showmeta">{s.dateText} · {s.venue}</span>
                <span className="att__showfoot">
                  <span className={`att__badge att__badge--${s.status}`}>{STATUS_TEXT[s.status]}</span>
                  {typeof s.admits === 'number' && (
                    <span className="att__showcount">
                      {s.admits} admits{typeof s.inRoom === 'number' && s.inRoom > 0 ? ` · ${s.inRoom} checked in` : ''}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {status === 'error' && <p className="att__err">Couldn’t open that show — try again.</p>}
      </div>
    );
  }

  const readOnly = show?.status !== 'open';

  return (
    <div className="att">
      <button type="button" className="att__back" onClick={() => setStatus('picking')}>
        ← All shows
      </button>
      <div className="att__head">
        <h1 className="att__title">{show?.label ?? 'Attendees'}</h1>
        <button type="button" className="att__csv" onClick={downloadCsv}>Download CSV</button>
      </div>
      {show && (
        <p className={`att__banner att__banner--${show.status}`}>
          {show.status === 'open'
            ? '✓ Check-in open — scan tickets for this show.'
            : show.status === 'past'
              ? 'This show has ended. Check-in is closed — this list is view only.'
              : 'Not tonight’s show — check-in opens on show night. View only.'}
        </p>
      )}
      <p className="att__stats">
        {totals.orders} orders · {totals.admits} admits · <strong>{totals.inCount}</strong>{' '}
        {readOnly ? 'checked in' : 'in the room'}
        {totals.walkUps > 0 && <> · {totals.walkUps} at the door</>}
      </p>
      <input
        type="search"
        className="att__search"
        placeholder="Search name or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="att__tablewrap">
        <table className="att__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Tier</th>
              <th>Admits</th>
              <th>Sold via</th>
              <th>Door</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.ticketCode ?? r.email ?? Math.random()} className={r.checkedInAt ? 'att__row--in' : ''}>
                <td>
                  {r.ticketCode ? (
                    <a href={`/ticket?c=${encodeURIComponent(r.ticketCode)}`}>{r.name || r.email || '—'}</a>
                  ) : (
                    r.name || r.email || '—'
                  )}
                  {r.email && r.name && <span className="att__email">{r.email}</span>}
                </td>
                <td>{tierLabel(r)}</td>
                <td>{r.admits ?? 1}</td>
                <td>{r.channel === 'booth' ? 'Door' : 'Advance'}</td>
                <td>
                  {(() => {
                    const seats = r.admits ?? 1;
                    const used = r.admitted ?? (r.checkedInAt ? 1 : 0);
                    if (!used) return '—';
                    const label = seats > 1 ? `${used}/${seats} in` : '✓';
                    return `${label} · ${r.checkedInAt ? fmtTime(r.checkedInAt) : ''}`;
                  })()}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="att__empty">
                  {rows.length === 0 ? 'No tickets sold for this show yet.' : 'No matching attendees.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
