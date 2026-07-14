import { useState } from 'react';
import { addItem, openCart } from '../lib/cart';
import { formatPrice } from '../lib/format';
import type { OptionGroup } from '../lib/bundleOptions';
import type { CartLineOption } from '../lib/types';

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
  /** Base stock used when the product has no variants. */
  baseStock?: number;
  variants: PurchaseVariant[];
  /**
   * Customer-selectable, non-priced options (bundle tee/size). When present,
   * every group must be chosen before the item can be added. Orthogonal to
   * `variants` — these don't affect price or stock. See ADR 0007.
   */
  optionGroups?: OptionGroup[];
  /** Heading above the variant selector — "Size" for merch, "Tier" for tickets. */
  sizeLabel?: string;
}

export default function ProductPurchase({
  productId,
  slug,
  title,
  image,
  basePrice,
  baseStock,
  variants,
  optionGroups = [],
  sizeLabel = 'Size',
}: ProductPurchaseProps) {
  const hasVariants = variants.length > 0;
  // Track the selected variant by index, not SKU — SKUs aren't guaranteed
  // unique across variants, and matching on SKU would select/highlight every
  // variant that shares one (e.g. an XL/XXL SKU collision).
  const firstAvailableIdx = hasVariants ? Math.max(0, variants.findIndex((v) => v.stock > 0)) : 0;
  const [selIdx, setSelIdx] = useState(firstAvailableIdx);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  // Chosen option value per group name; starts empty so nothing is pre-picked.
  const [optionChoices, setOptionChoices] = useState<Record<string, string>>({});

  const selected = hasVariants ? variants[selIdx] : undefined;

  const unitPrice = hasVariants ? (selected?.price ?? basePrice ?? 0) : (basePrice ?? 0);
  // Stock is authoritative for both paths now; 0 = sold out.
  const stock = hasVariants ? (selected?.stock ?? 0) : (baseStock ?? 0);
  const soldOut = stock <= 0;
  const allOptionsChosen = optionGroups.every((g) => optionChoices[g.name]);
  const canAdd = unitPrice > 0 && !soldOut && qty > 0 && allOptionsChosen;
  // A single unlabeled "One Size" variant reads better as a plain buy button.
  const showSizes = hasVariants && !(variants.length === 1 && /one size/i.test(variants[0].label));

  function selectVariant(idx: number) {
    setSelIdx(idx);
    setQty(1);
    setAdded(false);
  }

  function selectOption(group: string, value: string) {
    setOptionChoices((prev) => ({ ...prev, [group]: value }));
    setAdded(false);
  }

  function handleAdd() {
    if (!canAdd) return;
    const options: CartLineOption[] | undefined = optionGroups.length
      ? optionGroups.map((g) => ({ name: g.name, value: optionChoices[g.name] }))
      : undefined;
    addItem({
      productId,
      slug,
      title,
      sku: hasVariants ? (selected?.sku ?? slug) : slug,
      variantLabel: selected?.label,
      unitPrice,
      qty: Math.min(qty, stock),
      image,
      options,
    });
    setAdded(true);
    openCart();
    window.setTimeout(() => setAdded(false), 2500);
  }

  return (
    <div className="purchase">
      {unitPrice > 0 && <p className="purchase__price">{formatPrice(unitPrice)}</p>}

      {optionGroups.map((group) => (
        <div key={group.name}>
          <span className="purchase__label">{group.name}</span>
          <div className="purchase__sizes">
            {group.values.map((value) => (
              <button
                key={value}
                type="button"
                className="purchase__size"
                aria-pressed={optionChoices[group.name] === value}
                onClick={() => selectOption(group.name, value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      ))}

      {showSizes && (
        <div>
          <span className="purchase__label">{sizeLabel}</span>
          <div className="purchase__sizes">
            {variants.map((v, idx) => (
              <button
                key={idx}
                type="button"
                className="purchase__size"
                aria-pressed={idx === selIdx}
                disabled={v.stock <= 0}
                onClick={() => selectVariant(idx)}
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
            disabled={qty >= stock}
            onClick={() => setQty((q) => Math.min(stock, q + 1))}
          >
            +
          </button>
        </div>
      </div>

      <button className="purchase__add" onClick={handleAdd} disabled={!canAdd}>
        {soldOut
          ? 'Sold Out'
          : added
            ? 'Added to Cart ✓'
            : !allOptionsChosen
              ? optionGroups.length > 2
                ? 'Select your options'
                : `Select ${optionGroups.map((g) => g.name.toLowerCase()).join(' & ')}`
              : 'Add to Cart'}
      </button>

      {added && (
        <a className="purchase__view" href="/cart">
          View cart →
        </a>
      )}
      {!soldOut && stock <= 5 && (
        <p className="purchase__note">Only {stock} left in stock</p>
      )}
    </div>
  );
}
