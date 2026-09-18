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
type Status = 'locked' | 'loading' | 'ready' | 'error';

const PIN_KEY = 'wtn_staff_pin';
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
// A mixed cart (one VIP + one GA) reads as "VIP × 2" if we show just the
// headline tier + summed admits — spell out what's actually in the order.
const tierLabel = (r: Attendee): string =>
  r.breakdown && r.breakdown.length > 1
    ? r.breakdown.map((b) => `${b.admits}× ${b.tier.toUpperCase()}`).join(' + ')
    : (r.tier ?? 'ga').toUpperCase();

export default function AttendeeList() {
  const [status, setStatus] = useState<Status>('locked');
  const [pinInput, setPinInput] = useState('');
  const [rows, setRows] = useState<Attendee[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function load(pin: string) {
    setStatus('loading');
    setErr(null);
    try {
      const res = await fetch('/api/attendees', { headers: { 'x-staff-pin': pin } });
      if (res.status === 401) {
        localStorage.removeItem(PIN_KEY);
        setStatus('locked');
        setErr('Wrong door PIN.');
        return;
      }
      const data = (await res.json()) as { attendees?: Attendee[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'load failed');
      localStorage.setItem(PIN_KEY, pin);
      setRows(data.attendees ?? []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem(PIN_KEY);
    if (saved) load(saved);
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
    a.download = `wtn-attendees-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (status === 'locked' || (status === 'error' && rows.length === 0)) {
    return (
      <form
        className="att__lock"
        onSubmit={(e) => {
          e.preventDefault();
          if (pinInput) load(pinInput);
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
      </form>
    );
  }

  if (status === 'loading') return <p className="att__sub">Loading attendees…</p>;

  return (
    <div className="att">
      <div className="att__head">
        <h1 className="att__title">Attendees</h1>
        <button type="button" className="att__csv" onClick={downloadCsv}>Download CSV</button>
      </div>
      <p className="att__stats">
        {totals.orders} orders · {totals.admits} admits · <strong>{totals.inCount}</strong> in the room
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
                <td colSpan={5} className="att__empty">No matching attendees.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
