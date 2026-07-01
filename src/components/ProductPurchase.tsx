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
  // A single unlabeled "One Size" variant reads better as a plain buy button.
  const showSizes = hasVariants && !(variants.length === 1 && /one size/i.test(variants[0].label));

  function selectSku(next: string) {
    setSku(next);
    setQty(1);
    setAdded(false);
  }

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

      {showSizes && (
        <div>
          <span className="purchase__label">Size</span>
          <div className="purchase__sizes">
            {variants.map((v) => (
              <button
                key={v.sku}
                type="button"
                className="purchase__size"
                aria-pressed={v.sku === sku}
                disabled={v.stock <= 0}
                onClick={() => selectSku(v.sku)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <span className="purchase__label">Quantity</span>
        <div className="purchase__qtyrow">
          <button
            type="button"
            className="purchase__qtybtn"
            aria-label="Decrease quantity"
            disabled={qty <= 1}
            onClick={() => setQty((q) => Math.max(1, q - 1))}
          >
            −
          </button>
          <span className="purchase__qtyval">{qty}</span>
          <button
            type="button"
            className="purchase__qtybtn"
            aria-label="Increase quantity"
            disabled={stock !== Infinity && qty >= stock}
            onClick={() => setQty((q) => (stock === Infinity ? q + 1 : Math.min(stock, q + 1)))}
          >
            +
          </button>
        </div>
      </div>

      <button className="purchase__add" onClick={handleAdd} disabled={!canAdd}>
        {soldOut ? 'Sold Out' : added ? 'Added to Cart ✓' : 'Add to Cart'}
      </button>

      {added && (
        <a className="purchase__view" href="/cart">
          View cart →
        </a>
      )}
      {!soldOut && stock !== Infinity && stock <= 5 && (
        <p className="purchase__note">Only {stock} left in stock</p>
      )}
    </div>
  );
}
