import { useEffect, useState } from 'react';
import { getCart, onCartChange, updateQty, removeItem, cartSubtotal } from '../lib/cart';
import { formatPrice } from '../lib/format';
import type { CartItem } from '../lib/types';

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setItems(getCart());
    setReady(true);
    return onCartChange(setItems);
  }, []);

  if (!ready) return <p className="cartpage__loading">Loading your cart…</p>;

  if (items.length === 0) {
    return (
      <div className="cartpage__empty">
        <p>Your cart is empty.</p>
        <a className="cartpage__shoplink" href="/merch">
          Shop merch →
        </a>
      </div>
    );
  }

  const subtotal = cartSubtotal(items);

  return (
    <div className="cartpage">
      <ul className="cartpage__items">
        {items.map((it) => (
          <li key={it.sku} className="cartrow">
            <div className="cartrow__media">
              {it.image ? <img src={it.image} alt="" /> : <span className="cartrow__ph" aria-hidden="true" />}
            </div>
            <div className="cartrow__info">
              <span className="cartrow__title">{it.title}</span>
              {it.variantLabel && <span className="cartrow__variant">{it.variantLabel}</span>}
              <span className="cartrow__unit">{formatPrice(it.unitPrice)} each</span>
              <button className="cartrow__remove" onClick={() => removeItem(it.sku)}>
                Remove
              </button>
            </div>
            <div className="cartrow__qty">
              <button aria-label="Decrease" onClick={() => updateQty(it.sku, it.qty - 1)}>
                −
              </button>
              <span>{it.qty}</span>
              <button aria-label="Increase" onClick={() => updateQty(it.sku, it.qty + 1)}>
                +
              </button>
            </div>
            <div className="cartrow__total">{formatPrice(it.unitPrice * it.qty)}</div>
          </li>
        ))}
      </ul>

      <aside className="cartpage__summary">
        <h2 className="cartpage__summary-title">Summary</h2>
        <div className="cartpage__row">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <p className="cartpage__note">Shipping &amp; tax calculated at checkout.</p>
        <a className="cartpage__checkout" href="/checkout">
          Checkout
        </a>
        <a className="cartpage__continue" href="/merch">
          Continue shopping
        </a>
      </aside>
    </div>
  );
}
