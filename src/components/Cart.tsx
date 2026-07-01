import { useEffect, useState } from 'react';
import {
  getCart,
  onCartChange,
  updateQty,
  removeItem,
  cartCount,
  cartSubtotal,
} from '../lib/cart';
import { formatPrice } from '../lib/format';
import type { CartItem } from '../lib/types';

export default function Cart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setItems(getCart());
    const off = onCartChange(setItems);
    const openHandler = () => setOpen(true);
    window.addEventListener('wtn:cart:open', openHandler);
    return () => {
      off();
      window.removeEventListener('wtn:cart:open', openHandler);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const count = cartCount(items);
  const subtotal = cartSubtotal(items);

  return (
    <>
      <button
        className="cartbtn"
        aria-label={`Open cart, ${count} item${count === 1 ? '' : 's'}`}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          <path
            d="M6 8h12l-1 12H7L6 8zm3 0V6a3 3 0 0 1 6 0v2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {count > 0 && <span className="cartbtn__count">{count}</span>}
      </button>

      {open && (
        <div className="cartdrawer" role="dialog" aria-modal="true" aria-label="Shopping cart">
          <div className="cartdrawer__backdrop" onClick={() => setOpen(false)} />
          <aside className="cartdrawer__panel">
            <header className="cartdrawer__head">
              <span className="cartdrawer__heading">Cart ({count})</span>
              <button className="cartdrawer__close" aria-label="Close cart" onClick={() => setOpen(false)}>
                ×
              </button>
            </header>

            {items.length === 0 ? (
              <div className="cartdrawer__empty">
                <p>Your cart is empty.</p>
                <a className="cartdrawer__shoplink" href="/merch" onClick={() => setOpen(false)}>
                  Shop merch →
                </a>
              </div>
            ) : (
              <>
                <ul className="cartdrawer__items">
                  {items.map((it) => (
                    <li key={it.sku} className="cartline">
                      <div className="cartline__media">
                        {it.image ? (
                          <img src={it.image} alt="" />
                        ) : (
                          <span className="cartline__ph" aria-hidden="true" />
                        )}
                      </div>
                      <div className="cartline__info">
                        <span className="cartline__title">{it.title}</span>
                        {it.variantLabel && <span className="cartline__variant">{it.variantLabel}</span>}
                        <div className="cartline__qty">
                          <button aria-label="Decrease" onClick={() => updateQty(it.sku, it.qty - 1)}>
                            −
                          </button>
                          <span>{it.qty}</span>
                          <button aria-label="Increase" onClick={() => updateQty(it.sku, it.qty + 1)}>
                            +
                          </button>
                        </div>
                      </div>
                      <div className="cartline__right">
                        <span className="cartline__price">{formatPrice(it.unitPrice * it.qty)}</span>
                        <button className="cartline__remove" onClick={() => removeItem(it.sku)}>
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                <footer className="cartdrawer__foot">
                  <div className="cartdrawer__subtotal">
                    <span>Subtotal</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  <p className="cartdrawer__ship">Shipping &amp; tax calculated at checkout.</p>
                  <a className="cartdrawer__checkout" href="/checkout">
                    Checkout
                  </a>
                  <a className="cartdrawer__viewcart" href="/cart" onClick={() => setOpen(false)}>
                    View full cart
                  </a>
                </footer>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
