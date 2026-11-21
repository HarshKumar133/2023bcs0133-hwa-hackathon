import { formatINR } from './money.js';
import { escapeHtml, escapeAttr, textField, selectField, FIELD_LABELS } from './fields.js';
import { PRODUCT } from '../pricing.js';

const currencyFormatter = formatINR;

function prices(cart) {
  const summaryQuantity = cart.quantity || 0;
  const subtotalPaise = summaryQuantity * PRODUCT.unitPricePaise;
  const deliveryPaise = summaryQuantity > 0 ? PRODUCT.deliveryPaise : 0;
  return `<dl class="price-lines">
    <div><dt><span data-summary-qty>${summaryQuantity}</span> × ${currencyFormatter(PRODUCT.unitPricePaise)}</dt><dd data-subtotal>${currencyFormatter(subtotalPaise)}</dd></div>
    <div><dt>Delivery</dt><dd data-delivery>${currencyFormatter(deliveryPaise)}</dd></div>
    <div class="price-total"><dt>Total due</dt><dd data-total>${currencyFormatter(subtotalPaise + deliveryPaise)}</dd></div>
    </dl><p class="order-note">Total includes all amounts due. Delivery is charged once per nonempty order; limit ${PRODUCT.maxQuantity} units.</p>`;
}

function quantityStepper(quantity) {
  return `
    <div class="qty" role="group" aria-label="Quantity">
      <button type="button" class="qty-button" data-qty-decrease aria-label="Decrease quantity" ${quantity === 0 ? 'disabled' : ''}>−</button>
      <span class="qty-value" data-qty-value aria-live="polite">${quantity}</span>
      <button type="button" class="qty-button" data-qty-increase aria-label="Increase quantity" ${quantity >= PRODUCT.maxQuantity ? 'disabled' : ''}>+</button>
    </div>`;
}

function cartInputs(cart) {
  return `<input type="hidden" name="cartId" value="${escapeAttr(cart.id)}">
    <input type="hidden" name="revision" value="${cart.revision}">`;
}

function updateTarget(cart, quantity, label) {
  return `<form method="post" action="/cart">${cartInputs(cart)}
    <button class="button button--outline" type="submit" data-update-cart data-quantity="${quantity}" aria-label="${escapeAttr(label)}">${escapeHtml(label)}</button></form>`;
}

export function addToCartForm(cart, csrfToken) {
  if (cart.quantity >= PRODUCT.maxQuantity) return '<a href="/cart" class="button button--outline">View full cart</a>';
  return `<form method="post" action="/cart">${cartInputs(cart)}
    <button class="button button--outline button--large" type="submit" name="quantity" value="${cart.quantity + 1}">Add to cart</button></form>`;
}

function errorSummary(errors) {
  const keys = Object.keys(errors || {});
  if (!keys.length) return '';
  const items = keys.map(key => `<li><a href="#field-${escapeAttr(key)}">${escapeHtml(errors[key])}</a></li>`).join('');
  return `<div id="checkout-errors" role="alert" tabindex="-1"><h2>There is a problem with this order</h2><ul>${items}</ul></div>`;
}

function deliveryFields(values, errors) {
  return `
              <fieldset class="form-section">
                <legend>Contact</legend>
                <div class="field-grid">
                   ${textField({ id: 'field-fullName', name: 'fullName', label: FIELD_LABELS.fullName, value: values.fullName || '', error: errors.fullName || '', autocomplete: 'name', placeholder: 'Asha Rao', maxlength: 80 })}
                   ${textField({ id: 'field-email', name: 'email', label: FIELD_LABELS.email, value: values.email || '', error: errors.email || '', type: 'email', autocomplete: 'email', placeholder: 'asha@example.com', help: 'This demo is sending a real receipt link to the email used at checkout.', maxlength: 254 })}
                </div>
                <div class="field-grid field-grid--narrow">
                  <div class="field${errors.phone ? ' field--error' : ''}">
                    <label for="field-phone">${FIELD_LABELS.phone.label}<span class="req" aria-hidden="true">*</span></label>
                    <div class="phone-input">
                      <span class="phone-prefix" aria-hidden="true">+91</span>
                      <input
                        id="field-phone"
                        name="phone"
                        type="tel"
                        inputmode="numeric"
                        autocomplete="tel-national"
                        value="${escapeAttr(values.phone || '')}"
                        placeholder="98765 43210"
                        maxlength="10"
                        required
                        ${errors.phone ? 'aria-invalid="true"' : ''}
                        ${errors.phone ? 'aria-describedby="field-phone-error"' : ''}
                      >
                    </div>
                    ${errors.phone ? `<p class="field-error" id="field-phone-error">${escapeHtml(errors.phone)}</p>` : ''}
                  </div>
                </div>
              </fieldset>

              <fieldset class="form-section">
                <legend>Delivery address</legend>
                <div class="field-grid">
                  ${textField({ id: 'field-address1', name: 'address1', label: FIELD_LABELS.address1, value: values.address1 || '', error: errors.address1 || '', autocomplete: 'address-line1', placeholder: 'Flat 4B, 12 Neem Lane', maxlength: 120 })}
                  ${textField({ id: 'field-address2', name: 'address2', label: FIELD_LABELS.address2, value: values.address2 || '', error: errors.address2 || '', autocomplete: 'address-line2', placeholder: 'Near the old post office', required: false, maxlength: 120 })}
                </div>
                <div class="field-grid field-grid--three">
                  ${textField({ id: 'field-city', name: 'city', label: FIELD_LABELS.city, value: values.city || '', error: errors.city || '', autocomplete: 'address-level2', placeholder: 'Pune', maxlength: 60 })}
                  ${selectField({ id: 'field-state', name: 'state', label: FIELD_LABELS.state, value: values.state || '', error: errors.state || '' })}
                  ${textField({ id: 'field-pin', name: 'pin', label: FIELD_LABELS.pin, value: values.pin || '', error: errors.pin || '', autocomplete: 'postal-code', inputmode: 'numeric', placeholder: '411001', maxlength: 6 })}
                </div>
              </fieldset>
`;
}

function shell(screen, heading, content, cart, csrf) {
  return {
    bodyClass: `page-${screen}`,
    bodyData: `data-page="${screen}" data-cart-id="${escapeAttr(cart.id)}" data-cart-revision="${cart.revision}" data-csrf="${escapeAttr(csrf)}" data-max-qty="${PRODUCT.maxQuantity}" data-currency="${PRODUCT.currency}" data-totals="${escapeAttr(JSON.stringify(cart.totals))}"`,
    body: `<main id="main" class="shell purchase-screen"><h1>${heading}</h1>${content}</main>`,
  };
}

function cartNotice(notice) {
  return `<p class="notice notice--warn" role="status" data-cart-notice tabindex="-1" ${notice ? '' : 'hidden'}>${escapeHtml(notice)}</p>`;
}

export function renderCart({ cart, csrfToken, notice }) {
  const quantity = cart.quantity;
  return shell('cart', 'Your cart', `${cartNotice(notice)}
    <p class="purchase-lead">One floor toy, two route cards, and a receipt you can reload. Quantities are held on the server.</p>
    <div class="purchase-columns">
      <section class="cart-item">
        <img class="cart-thumb" src="/assets/toy-plan.svg" alt="Overhead view of TrailTurn" width="800" height="800">
        <div>
          <h2>TrailTurn</h2>
          <p>Floor toy and two route cards · ${escapeHtml(PRODUCT.sku)}</p>
          <p data-empty-basket ${quantity ? 'hidden' : ''}>Your cart is empty. <a href="/#toy">Explore the toy</a> or add one below.</p>
          <h3>Quantity</h3>
          ${quantity > 1 ? updateTarget(cart, quantity - 1, 'Decrease quantity') : '<p class="price-note">Minimum one unit.</p>'}
          ${quantity < PRODUCT.maxQuantity ? updateTarget(cart, quantity + 1, 'Increase quantity') : '<p class="price-note">Maximum five units.</p>'}
          <p class="price-note">Limit ${PRODUCT.maxQuantity} per order.</p>
          <noscript><form method="post" action="/cart">${cartInputs(cart)}
            <label>Quantity <select name="quantity">${Array.from({ length: PRODUCT.maxQuantity + 1 }, (_, n) => `<option${n === quantity ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
            <button class="button button--outline">Update cart</button></form></noscript>
          <p data-checkout-status role="status"></p>
        </div>
      </section>
      <section class="cart-summary">
        <h2>Order summary</h2>
        <p>TrailTurn · ${escapeHtml(PRODUCT.sku)}</p>
        ${prices(cart)}
        <a class="button button--tomato button--full" href="/checkout" ${quantity ? '' : 'aria-disabled="true"'}>Checkout</a>
        <a class="button button--forest button--full" href="/">Continue shopping</a>
      </section>
    </div>`, cart, csrfToken);
}

export function renderCheckout({ cart, csrfToken, values = {}, errors = {}, notice = '', idempotencyKey = '' }) {
  const quantity = cart.quantity;
  const totals = cart.totals;
  const hasErrors = Object.keys(errors).length > 0;
  const formPhase = hasErrors || notice ? 'recoverable-failure' : 'editing';
  return shell('checkout', 'Checkout · TrailTurn', `
            ${cartNotice(notice)}
            ${errorSummary(errors)}
            <form id="checkout-form" class="checkout-form" method="post" action="/checkout" novalidate data-checkout-form data-checkout-phase="${formPhase}">
              <input type="hidden" name="cartId" value="${escapeAttr(cart.id)}" data-cart-id-input>
              <input type="hidden" name="revision" value="${escapeAttr(cart.revision)}" data-cart-revision-input>
              <input type="hidden" name="idempotencyKey" value="${escapeAttr(idempotencyKey)}" data-idempotency-input>
              <input type="hidden" name="csrf" value="${escapeAttr(csrfToken)}">
              <div class="order-summary" aria-label="Order summary">
                <div class="order-product">
                  <img src="/assets/toy-plan.svg" alt="" width="96" height="96">
                  <div>
                    <p class="order-name">${escapeHtml(PRODUCT.name)}</p>
                    <p class="order-meta">Route card set included · ${escapeHtml(PRODUCT.sku)}</p>
                    <p class="order-delivery">Delivery in 5–7 working days (demo)</p>
                    ${quantityStepper(quantity)}
                  </div>
                </div>
                <dl class="price-lines">
                  <div><dt>Subtotal <span data-summary-qty>${quantity}</span> × ${formatINR(PRODUCT.unitPricePaise)}</dt><dd data-subtotal>${formatINR(totals.subtotalPaise)}</dd></div>
                  <div><dt>Delivery</dt><dd data-delivery>${formatINR(totals.deliveryPaise)}</dd></div>
                  <div class="price-total"><dt>Total</dt><dd data-total>${formatINR(totals.totalPaise)}</dd></div>
                </dl>
                 <p class="order-note" data-empty-basket ${quantity ? 'hidden' : ''}>Your basket is empty. Add a TrailTurn to check out.</p>
                 <p class="order-note">Total includes all amounts due. Delivery is charged once per nonempty order; limit ${PRODUCT.maxQuantity} units.</p>
              </div>
              ${deliveryFields(values, errors)}
              <div class="checkout-commit">
                <button type="submit" class="button button--ink button--large button--full" data-checkout-submit ${quantity ? '' : 'disabled'}>
                  <span data-checkout-submit-label>Place demo order · ${formatINR(totals.totalPaise)}</span>
                  <span aria-hidden="true">→</span>
                </button>
                <p class="checkout-status" data-checkout-status role="status" aria-live="polite"></p>
                <p class="checkout-fine">No payment is collected. This creates a demo receipt only. By placing the order you agree to the demo terms above.</p>
              </div>
            </form>
            <p class="checkout-lookup">Already ordered? <a href="/receipt">Find your receipt <span aria-hidden="true">→</span></a></p>`, cart, csrfToken);
}
