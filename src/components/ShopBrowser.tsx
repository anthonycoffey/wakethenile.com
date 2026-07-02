import { useEffect, useMemo, useRef, useState } from 'react';
import { formatPrice } from '../lib/format';

export interface BrowserProduct {
  id: string;
  slug: string;
  title: string;
  image?: string;
  fromPrice?: number;
  inStock: boolean;
  category?: string;
  tags?: string[];
}

const PAGE_SIZE = 6;

export default function ShopBrowser({ products }: { products: BrowserProduct[] }) {
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return [...set].sort();
  }, [products]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the filter dropdown when clicking outside it.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const filtered = useMemo(
    () =>
      selected.size === 0
        ? products
        : products.filter((p) => p.category && selected.has(p.category)),
    [products, selected],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);
  const count = filtered.length;

  function toggle(c: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
    setPage(1);
  }
  function clearAll() {
    setSelected(new Set());
    setPage(1);
  }

  return (
    <>
      <div className="shopb__bar">
        <span className="shopb__count">
          {count} item{count === 1 ? '' : 's'}
        </span>

        {categories.length > 0 && (
          <div className="shopb__filter-wrap" ref={wrapRef}>
            <div
              className={`shopb__trigger${open ? ' is-open' : ''}`}
              role="button"
              tabIndex={0}
              aria-expanded={open}
              aria-haspopup="true"
              onClick={() => setOpen((o) => !o)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpen((o) => !o);
                }
              }}
            >
              <div className="shopb__chips">
                {selected.size === 0 ? (
                  <span className="shopb__placeholder">filter products</span>
                ) : (
                  [...selected].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="shopb__chip"
                      title={`Remove ${c} filter`}
                      aria-label={`Remove ${c} filter`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(c);
                      }}
                    >
                      {c}
                    </button>
                  ))
                )}
              </div>
              <span className="shopb__caret" aria-hidden="true">
                <svg
                  className={`shopb__caret-icon${open ? ' is-open' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
            {open && (
              <div className="shopb__filter-menu" role="menu">
                {categories.map((c) => (
                  <label key={c} className="shopb__filter-opt">
                    <input type="checkbox" checked={selected.has(c)} onChange={() => toggle(c)} />
                    <span>{c}</span>
                  </label>
                ))}
                {selected.size > 0 && (
                  <button type="button" className="shopb__filter-clear" onClick={clearAll}>
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="shopb__empty">No merch matches those filters.</p>
      ) : (
        <div className="shopb__grid">
          {visible.map((p) => (
            <a key={p.id} className="shopb__card" href={`/merch/${p.slug}`}>
              <div className="shopb__media">
                {p.image ? (
                  <img src={p.image} alt={p.title} loading="lazy" />
                ) : (
                  <span className="shopb__ph" aria-hidden="true" />
                )}
                {!p.inStock && <span className="shopb__badge">Sold Out</span>}
              </div>
              <p className="shopb__title">{p.title}</p>
              <p className="shopb__price">{formatPrice(p.fromPrice)}</p>
            </a>
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="shopb__pager">
          <button
            type="button"
            className="shopb__pagebtn"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          >
            ← Prev
          </button>
          <span className="shopb__pageinfo">
            Page {current} of {pageCount}
          </span>
          <button
            type="button"
            className="shopb__pagebtn"
            disabled={current >= pageCount}
            onClick={() => setPage(current + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </>
  );
}
