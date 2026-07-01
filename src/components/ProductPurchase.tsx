import { useMemo, useState } from 'react';
import { addItem } from '../lib/cart';
import { formatPrice } from '../lib/format';

/** Serializable variant passed from the Astro page. */
export interface PurchaseVariant {
  label: string;
  sku: string;
  price: number;
  stock: number;
}

export interface ProductPurchaseProps {
  productId: string;
  slug: string;
  title: string;
  image?: string;
  /** Base price used when a variant has no override. */
  basePrice?: number;
  variants: PurchaseVariant[];
}

export default function ProductPurchase({
  productId,
  slug,
  title,
  image,
  basePrice,
  variants,
}: ProductPurchaseProps) {
  const hasVariants = variants.length > 0;
  const firstAvailable = hasVariants
    ? (variants.find((v) => v.stock > 0)?.sku ?? variants[0].sku)
    : '';
  const [sku, setSku] = useState(firstAvailable);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const selected = useMemo(
    () => variants.find((v) => v.sku === sku),
    [variants, sku],
  );

  const unitPrice = hasVariants ? (selected?.price ?? basePrice ?? 0) : (basePrice ?? 0);
  const stock = hasVariants ? (selected?.stock ?? 0) : Infinity;
  const soldOut = hasVariants ? stock <= 0 : false;
  const canAdd = unitPrice > 0 && !soldOut && qty > 0;

  function handleAdd() {
    if (!canAdd) return;
    addItem({
      productId,
      slug,
      title,
      sku: hasVariants ? sku : slug,
      variantLabel: selected?.label,
      unitPrice,
      qty: Math.min(qty, stock === Infinity ? qty : stock),
      image,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2500);
  }

  return (
    <div className="purchase">
      {unitPrice > 0 && <p className="purchase__price">{formatPrice(unitPrice)}</p>}

      <div className="purchase__controls">
        {hasVariants && (
          <label className="purchase__field">
            <span>Option</span>
            <select
              value={sku}
              onChange={(e) => {
                setSku(e.target.value);
                setQty(1);
              }}
            >
              {variants.map((v) => (
                <option key={v.sku} value={v.sku} disabled={v.stock <= 0}>
                  {v.label}
                  {v.stock <= 0 ? ' — sold out' : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="purchase__field">
          <span>Qty</span>
          <input
            type="number"
            min={1}
            max={stock === Infinity ? undefined : stock}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
      </div>

      <button className="btn purchase__btn" onClick={handleAdd} disabled={!canAdd}>
        {soldOut ? 'Sold Out' : added ? 'Added ✓' : 'Add to Cart'}
      </button>

      {added && (
        <a className="purchase__view" href="/cart">
          View cart →
        </a>
      )}
      {!soldOut && stock !== Infinity && stock <= 5 && (
        <p className="purchase__low">Only {stock} left</p>
      )}
    </div>
  );
}
