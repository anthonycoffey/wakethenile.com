import { useMemo, useState } from 'react';
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

  const [category, setCategory] = useState('All');
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => (category === 'All' ? products : products.filter((p) => p.category === category)),
    [products, category],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  function pick(c: string) {
    setCategory(c);
    setPage(1);
  }

  return (
    <>
      {categories.length > 0 && (
        <div className="shopb__filters" role="tablist" aria-label="Filter products by category">
          <button
            type="button"
            className={`shopb__filter${category === 'All' ? ' is-active' : ''}`}
            aria-pressed={category === 'All'}
            onClick={() => pick('All')}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`shopb__filter${category === c ? ' is-active' : ''}`}
              aria-pressed={category === c}
              onClick={() => pick(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="shopb__empty">No merch{category !== 'All' ? ` in ${category}` : ''} yet — check back soon.</p>
      ) : (
        <div className="shopb__grid">
          {visible.map((p) => (
            <a key={p.id} className="shopb__card" href={`/shop/${p.slug}`}>
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
