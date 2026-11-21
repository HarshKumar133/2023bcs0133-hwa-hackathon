(() => {
  'use strict';

  document.documentElement.classList.add('js');

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const money = (paise) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: document.body.dataset.currency,
      minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(paise / 100);

  function newKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `key-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function initHeader() {
    const header = $('[data-header]');
    if (!header) return;
    const update = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  function initReveal() {
    const items = $$('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window) || reduceMotion()) {
      items.forEach((item) => item.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -36px 0px' },
    );
    items.forEach((item) => observer.observe(item));
  }

  function initGallery() {
    const gallery = $('[data-gallery]');
    if (!gallery) return;
    const image = $('[data-gallery-image]', gallery);
    const caption = $('[data-gallery-caption]', gallery);
    const count = $('[data-gallery-count]', gallery);
    const frame = $('.gallery-frame', gallery);
    const thumbs = $$('[data-gallery-thumb]', gallery);
    if (!image || !caption || !count) return;

    let timer = null;

    function select(thumb) {
      if (thumb.classList.contains('is-active')) return;
      thumbs.forEach((item) => {
        item.classList.toggle('is-active', item === thumb);
        item.setAttribute('aria-pressed', item === thumb ? 'true' : 'false');
      });

      const apply = () => {
        image.src = thumb.dataset.src || image.src;
        image.alt = thumb.dataset.alt || '';
        caption.textContent = thumb.dataset.caption || '';
        count.textContent = thumb.dataset.count || '';
        if (frame) frame.classList.remove('is-changing');
      };

      if (frame && !reduceMotion()) {
        if (timer) window.clearTimeout(timer);
        frame.classList.add('is-changing');
        timer = window.setTimeout(apply, 180);
      } else {
        apply();
      }
    }

    thumbs.forEach((thumb) => {
      thumb.addEventListener('click', () => select(thumb));
    });
  }

  function initDemo() {
    const demo = $('[data-demo]');
    if (!demo) return;

    const routes = {
      long: { name: 'Long way', sequence: [1, 2, 3], segments: ['long-0', 'long-1'] },
      switch: { name: 'Switchback', sequence: [1, 3, 2], segments: ['switch-0', 'switch-1'] },
    };

    const state = {
      route: 'long',
      phase: 'ready',
      step: 0,
      opportunity: 0,
      slots: ['upcoming', 'upcoming', 'upcoming', 'upcoming'],
      used: 0,
      missed: 0,
    };

    const routeButtons = $$('button[data-route]', demo);
    const paddles = $$('[data-paddle]', demo);
    const paths = $$('[data-segment]', demo);
    const dial = $('[data-dial]', demo);
    const statusTitle = $('[data-demo-status]', demo);
    const statusDetail = $('[data-demo-detail]', demo);
    const hint = $('[data-demo-hint]', demo);
    const routeLabel = $('[data-demo-route]', demo);
    const paddleLabel = $('[data-demo-paddle]', demo);
    const missedLabel = $('[data-demo-missed]', demo);
    const usedLabel = $('[data-demo-used]', demo);
    const startButton = $('[data-demo-start]', demo);
    const awayButton = $('[data-demo-away]', demo);
    const skipButton = $('[data-demo-skip]', demo);
    const resetButton = $('[data-demo-reset]', demo);
    const footnote = $('[data-demo-footnote]', demo);
    const slotElements = $$('[data-slot]', demo);
    const slotLabels = $$('[data-slot-label]', demo);

    if (!statusTitle || !statusDetail || !startButton || !awayButton || !skipButton || !resetButton) return;

    function activePaddle() {
      if (state.phase === 'ready' || state.phase === 'complete') return null;
      return routes[state.route].sequence[state.step] || null;
    }

    function currentSlotIsLive() {
      return state.phase === 'playing' || state.phase === 'paused';
    }

    function defaultStatus() {
      const paddle = activePaddle();
      if (state.phase === 'ready') {
        return {
          title: 'Ready when you are.',
          detail: 'Pick a route to see its path on the drum.',
        };
      }
      if (state.phase === 'playing') {
        return {
          title: `Paddle ${paddle} is up.`,
          detail: 'Nose the raised paddle to move the route forward.',
        };
      }
      if (state.phase === 'paused') {
        return {
          title: `Paddle ${paddle} is waiting.`,
          detail: 'The route is held. Return when you are ready.',
        };
      }
      if (state.phase === 'closed') {
        return {
          title: 'Window closed.',
          detail: 'The raised paddle is still waiting. The route did not reset.',
        };
      }
      return {
        title: 'Route complete.',
        detail: 'Three pushes, one held route, no pile-up. Try the other route.',
      };
    }

    function render(overrides = {}) {
      demo.dataset.phase = state.phase;
      demo.dataset.route = state.route;
      demo.dataset.step = String(state.step);
      demo.dataset.opportunity = String(state.opportunity);

      routeButtons.forEach((button) => {
        const selected = button.dataset.route === state.route;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });

      const activeRoute = routes[state.route];
      const paddle = activePaddle();

      paths.forEach((path) => {
        path.classList.remove('is-active', 'is-done');
        const segmentIndex = activeRoute.segments.indexOf(path.dataset.segment);
        if (segmentIndex === -1) return;
        path.classList.add('is-active');
        if (state.step > segmentIndex) path.classList.add('is-done');
      });

      paddles.forEach((button) => {
        const number = Number(button.dataset.paddle);
        const isActive = paddle === number;
        button.classList.toggle('is-active', isActive);
        button.disabled = !(isActive && state.phase === 'playing');
        if (isActive) {
          button.setAttribute(
            'aria-label',
            state.phase === 'playing'
              ? `Paddle ${number}, raised. Push to continue.`
              : `Paddle ${number}, raised. The route is waiting.`,
          );
        } else if (state.phase === 'complete') {
          button.setAttribute('aria-label', `Paddle ${number}, route complete.`);
        } else {
          button.setAttribute('aria-label', `Paddle ${number}, waiting.`);
        }
      });

      if (dial) {
        const step = state.phase === 'ready' ? 0 : Math.min(state.opportunity, 3);
        dial.dataset.step = String(step);
      }

      const status = { ...defaultStatus(), ...overrides };
      statusTitle.textContent = status.title;
      statusDetail.textContent = status.detail;

      if (hint) {
        if (state.phase === 'playing') hint.textContent = `Paddle ${paddle} is up. Nose it to continue.`;
        else if (state.phase === 'paused') hint.textContent = `Paddle ${paddle} is waiting. The route is held.`;
        else if (state.phase === 'closed') hint.textContent = 'The window is closed. The raised paddle still waits.';
        else if (state.phase === 'complete') hint.textContent = 'Route complete. Try the other route.';
        else hint.textContent = 'Choose a route, then start the window.';
      }

      if (routeLabel) routeLabel.textContent = activeRoute.name;
      if (paddleLabel) paddleLabel.textContent = paddle ? `Paddle ${paddle}` : '—';
      if (missedLabel) missedLabel.textContent = String(state.missed);
      if (usedLabel) usedLabel.textContent = String(state.used);

      slotElements.forEach((element, index) => {
        element.classList.remove('is-current', 'is-used', 'is-missed', 'is-upcoming');
        const slot = state.slots[index];
        if (slot === 'used') {
          element.classList.add('is-used');
          if (slotLabels[index]) slotLabels[index].textContent = 'Used';
        } else if (slot === 'missed') {
          element.classList.add('is-missed');
          if (slotLabels[index]) slotLabels[index].textContent = 'Passed';
        } else if (currentSlotIsLive() && state.opportunity === index) {
          element.classList.add('is-current');
          if (slotLabels[index]) slotLabels[index].textContent = 'Current';
        } else {
          element.classList.add('is-upcoming');
          if (slotLabels[index]) slotLabels[index].textContent = 'Ahead';
        }
      });

      if (state.phase === 'ready') {
        startButton.disabled = false;
        startButton.textContent = 'Start the window';
      } else if (state.phase === 'playing') {
        startButton.disabled = true;
        startButton.textContent = 'Window open';
      } else if (state.phase === 'paused') {
        startButton.disabled = true;
        startButton.textContent = 'Window paused';
      } else if (state.phase === 'closed') {
        startButton.disabled = false;
        startButton.textContent = 'Open another window';
      } else {
        startButton.disabled = false;
        startButton.textContent = 'Start again';
      }

      if (state.phase === 'playing') {
        awayButton.disabled = false;
        awayButton.textContent = 'Walk away';
      } else if (state.phase === 'paused') {
        awayButton.disabled = false;
        awayButton.textContent = 'Return to route';
      } else {
        awayButton.disabled = true;
        awayButton.textContent = 'Walk away';
      }

      skipButton.disabled = !currentSlotIsLive();

      if (footnote) {
        footnote.textContent = state.missed
          ? `${state.missed} missed ${state.missed === 1 ? 'chance' : 'chances'} — no portion was added to the next slot. The route stayed put.`
          : 'A missed slot passes without releasing a pile. The route stays put.';
      }
    }

    function focusPaddle() {
      const paddle = activePaddle();
      if (!paddle) return;
      const button = paddles.find((item) => Number(item.dataset.paddle) === paddle);
      if (button) button.focus({ preventScroll: true });
    }

    function startWindow() {
      if (state.phase === 'ready') {
        state.phase = 'playing';
        state.step = 0;
        state.opportunity = 0;
        state.slots = ['upcoming', 'upcoming', 'upcoming', 'upcoming'];
        state.used = 0;
        state.missed = 0;
        render();
        focusPaddle();
        return;
      }
      if (state.phase === 'closed') {
        state.phase = 'playing';
        state.opportunity = 0;
        state.slots = ['upcoming', 'upcoming', 'upcoming', 'upcoming'];
        state.used = 0;
        state.missed = 0;
        render({
          title: 'A new window is open.',
          detail: `Paddle ${activePaddle()} is still up. The route carried over.`,
        });
        focusPaddle();
        return;
      }
      if (state.phase === 'complete') {
        state.phase = 'playing';
        state.step = 0;
        state.opportunity = 0;
        state.slots = ['upcoming', 'upcoming', 'upcoming', 'upcoming'];
        state.used = 0;
        state.missed = 0;
        render({
          title: 'A fresh route is open.',
          detail: 'Paddle 1 is up. Nose it to begin again.',
        });
        focusPaddle();
      }
    }

    function pushPaddle(number) {
      if (state.phase !== 'playing') return;
      if (number !== activePaddle()) return;

      state.slots[state.opportunity] = 'used';
      state.used += 1;
      state.step += 1;

      if (state.step >= 3) {
        state.phase = 'complete';
        render({
          title: 'Route complete.',
          detail: 'Three pushes, one held route, no pile-up. Try the other route.',
        });
        startButton.focus({ preventScroll: true });
        return;
      }

      if (state.opportunity === 3) {
        state.phase = 'closed';
        render();
        startButton.focus({ preventScroll: true });
        return;
      }
      state.opportunity += 1;
      render({
        title: `Paddle ${activePaddle()} is up.`,
        detail:
          state.step === 1
            ? 'The route moved forward. Walk away if you like; this paddle will wait.'
            : 'One push left in this route.',
      });
      focusPaddle();
    }

    function toggleAway() {
      if (state.phase === 'playing') {
        state.phase = 'paused';
        render({
          title: `Paddle ${activePaddle()} is waiting.`,
          detail: 'The route is held. Nothing resets while you are away.',
        });
        return;
      }
      if (state.phase === 'paused') {
        state.phase = 'playing';
        render({
          title: `Back to paddle ${activePaddle()}.`,
          detail: 'It is still up. Pick up exactly where you left off.',
        });
        focusPaddle();
      }
    }

    function passTime() {
      if (!currentSlotIsLive()) return;
      const paddle = activePaddle();
      state.slots[state.opportunity] = 'missed';
      state.missed += 1;

      if (state.opportunity >= 3) {
        state.phase = 'closed';
        render({
          title: 'Window closed.',
          detail: `Paddle ${paddle} is still up. The route did not reset.`,
        });
        return;
      }

      state.opportunity += 1;
      if (state.phase === 'paused') {
        render({
          title: 'That chance passed while you were away.',
          detail: `No portion was released. Paddle ${paddle} is still up.`,
        });
      } else {
        render({
          title: 'That chance passed.',
          detail: `No portion was released. Paddle ${paddle} is still up.`,
        });
      }
    }

    function resetDemo() {
      state.phase = 'ready';
      state.step = 0;
      state.opportunity = 0;
      state.slots = ['upcoming', 'upcoming', 'upcoming', 'upcoming'];
      state.used = 0;
      state.missed = 0;
      render({
        title: 'Ready when you are.',
        detail: 'Pick a route to see its path on the drum.',
      });
    }

    function selectRoute(key) {
      if (!routes[key] || key === state.route) return;
      state.route = key;
      resetDemo();
      render({
        title: `${routes[key].name} selected.`,
        detail: 'Start the window when you are ready.',
      });
    }

    routeButtons.forEach((button) => {
      button.addEventListener('click', () => selectRoute(button.dataset.route));
    });

    paddles.forEach((button) => {
      button.addEventListener('click', () => pushPaddle(Number(button.dataset.paddle)));
    });

    startButton.addEventListener('click', startWindow);
    awayButton.addEventListener('click', toggleAway);
    skipButton.addEventListener('click', passTime);
    resetButton.addEventListener('click', resetDemo);

    render();
  }

  function initPrint() {
    const printButton = $('[data-print]');
    if (!printButton) return;
    printButton.addEventListener('click', () => window.print());
  }

  function initServerErrorFocus() {
    const summary = $('#checkout-errors') || $('#lookup-errors');
    if (!summary) return;
    window.requestAnimationFrame(() => {
      summary.focus({ preventScroll: true });
      summary.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHeader();
    initReveal();
    initGallery();
    initDemo();
    initPrint();
    initServerErrorFocus();
    initCheckout(initCart());
  });

  // Cart and checkout are defined below so the demo can load independently.
  function initCart() {
    const page = document.body.dataset.page;
    if (page !== 'home') return;

    const summary = $('.order-summary');
    const qtyValue = $('[data-qty-value]');
    const qtyDecrease = $('[data-qty-decrease]');
    const qtyIncrease = $('[data-qty-increase]');
    const subtotalEl = $('[data-subtotal]');
    const deliveryEl = $('[data-delivery]', summary);
    const totalEl = $('[data-total]');
    const summaryQtyEl = $('[data-summary-qty]');
    const headerQtyEl = $('[data-header-qty]');
    const submitLabel = $('[data-checkout-submit-label]');
    const cartNotice = $('[data-cart-notice]');
    const checkoutStatus = $('[data-checkout-status]');
    const hiddenCartId = $('[data-cart-id-input]');
    const hiddenRevision = $('[data-cart-revision-input]');
    const hiddenIdempotency = $('[data-idempotency-input]');

    if (!qtyValue || !qtyDecrease || !qtyIncrease || !subtotalEl || !deliveryEl || !totalEl) return;

    const maxQty = Number(document.body.dataset.maxQty);
    const csrf = document.body.dataset.csrf || '';

    const cart = {
      id: document.body.dataset.cartId || null,
      revision: Number(document.body.dataset.cartRevision || 0),
      quantity: Number(qtyValue.textContent),
      totals: JSON.parse(document.body.dataset.totals),
    };

    let updating = false;

    function etag() {
      return `"cart-${cart.id || 'new'}-${cart.revision}"`;
    }

    function setStatus(message) {
      if (checkoutStatus) checkoutStatus.textContent = message;
    }

    function setNotice(message, link) {
      if (!cartNotice) return;
      cartNotice.textContent = '';
      cartNotice.append(document.createTextNode(message));
      if (link) {
        const anchor = document.createElement('a');
        anchor.href = link.href;
        anchor.textContent = link.label;
        cartNotice.append(document.createTextNode(' '), anchor);
      }
      cartNotice.hidden = false;
    }

    function clearNotice() {
      if (!cartNotice) return;
      cartNotice.hidden = true;
      cartNotice.textContent = '';
    }

    function updateHidden() {
      if (hiddenCartId) hiddenCartId.value = cart.id || '';
      if (hiddenRevision) hiddenRevision.value = String(cart.revision);
      document.body.dataset.cartId = cart.id || '';
      document.body.dataset.cartRevision = String(cart.revision);
    }

    function updateTotals(quantity) {
      const { subtotalPaise, deliveryPaise, totalPaise } = cart.totals;
      qtyValue.textContent = String(quantity);
      if (summaryQtyEl) summaryQtyEl.textContent = String(quantity);
      if (headerQtyEl) headerQtyEl.textContent = String(quantity);
      subtotalEl.textContent = money(subtotalPaise);
      deliveryEl.textContent = money(deliveryPaise);
      totalEl.textContent = money(totalPaise);
      $('[data-empty-basket]').hidden = quantity !== 0;
      $('[data-checkout-submit]').disabled = updating || quantity === 0;
      if (submitLabel) submitLabel.textContent = `Place demo order · ${totalEl.textContent}`;
      qtyDecrease.disabled = updating || quantity === 0;
      qtyIncrease.disabled = updating || quantity >= maxQty;
      updateHidden();
    }

    function setBusy(busy) {
      updating = busy;
      $('[data-checkout-submit]').disabled = busy || cart.quantity === 0;
      qtyDecrease.disabled = busy || cart.quantity === 0;
      qtyIncrease.disabled = busy || cart.quantity >= maxQty;
      if (summary) summary.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    function refreshIdempotencyKey() {
      if (hiddenIdempotency) hiddenIdempotency.value = newKey();
    }

    function rememberCart() {
      try {
        window.localStorage.setItem(
          'tt_cart',
          JSON.stringify({ id: cart.id, revision: cart.revision, at: Date.now() }),
        );
      } catch {
        // Storage can be unavailable; the server remains the source of truth.
      }
    }

    async function changeQuantity(delta) {
      if (updating || $('[data-checkout-form]').dataset.locked === 'true') return;
      const next = Math.min(maxQty, Math.max(0, cart.quantity + delta));
      if (next === cart.quantity) return;

      setBusy(true);
      clearNotice();
      setStatus('Updating cart…');

      try {
        const response = await fetch('/api/cart', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrf,
            'If-Match': etag(),
          },
          body: JSON.stringify({ quantity: next }),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.cart) {
          Object.assign(cart, data.cart);
          updateTotals(cart.quantity);
          refreshIdempotencyKey();
          rememberCart();
          setStatus('Cart updated. Total refreshed.');
          return;
        }

        if (response.status === 409) {
          if (data.cart) {
            Object.assign(cart, data.cart);
            updateTotals(cart.quantity);
            rememberCart();
          } else {
            setNotice('Reload the shop to see the current basket.');
            return;
          }
          if (data.code === 'cart_completed' && data.order && data.order.receiptUrl) {
            setNotice('This cart has already been ordered. Open your receipt.', {
              href: data.order.receiptUrl,
              label: 'Open receipt →',
            });
            setStatus('This cart was already ordered.');
          } else {
            setNotice('This cart changed in another tab. We refreshed the total. Review it and try again.');
            setStatus('Cart refreshed. Review the total.');
          }
          refreshIdempotencyKey();
          if (cartNotice) {
            cartNotice.focus?.();
            cartNotice.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
          }
          return;
        }

        if (response.status === 422 && data.errors?.quantity) {
          setStatus(data.errors.quantity);
          return;
        }

        if (response.status === 403) {
          setStatus('Your session expired. Reload the page and try again.');
          return;
        }

        setStatus('We could not update the cart. Try again.');
      } catch {
        setStatus('We could not reach the server. Your quantity was not changed.');
      } finally {
        setBusy(false);
        updateTotals(cart.quantity);
      }
    }

    qtyDecrease.addEventListener('click', () => changeQuantity(-1));
    qtyIncrease.addEventListener('click', () => changeQuantity(1));

    window.addEventListener('storage', async (event) => {
      if (event.key !== 'tt_cart') return;
      try {
        const response = await fetch('/api/cart', { headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        const data = await response.json();
        if (!data.cart || $('[data-checkout-form]').dataset.locked === 'true') return;
        const changed = data.cart.revision !== cart.revision || data.cart.id !== cart.id;
        Object.assign(cart, data.cart);
        updateTotals(cart.quantity);
        if (changed) {
          refreshIdempotencyKey();
          setNotice('This cart was updated in another tab. We refreshed the total.');
          setStatus('Cart refreshed from another tab.');
        }
      } catch {
        // Leave the current view in place; the next update will surface conflicts.
      }
    });

    updateTotals(cart.quantity);
    return (current) => {
      Object.assign(cart, current);
      updateTotals(cart.quantity);
    };
  }

  function initCheckout(applyCart) {
    const form = $('[data-checkout-form]');
    if (!form) return;

    const statusEl = $('[data-checkout-status]');
    const submit = $('[data-checkout-submit]');
    const submitLabel = $('[data-checkout-submit-label]');
    const csrf = document.body.dataset.csrf || '';
    const hiddenCartId = $('[data-cart-id-input]');
    const hiddenRevision = $('[data-cart-revision-input]');
    const hiddenIdempotency = $('[data-idempotency-input]');

    function currentQuantity() {
      const qty = $('[data-qty-value]');
      return qty ? Number(qty.textContent || 1) : 1;
    }

    function setStatus(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function etag() {
      const id = document.body.dataset.cartId || '';
      const revision = document.body.dataset.cartRevision || '0';
      return `"cart-${id || 'new'}-${revision}"`;
    }

    const transitions = {
      editing: { submit: 'submitting' },
      submitting: { confirmed: 'confirmed', failure: 'recoverable-failure' },
      'recoverable-failure': { edit: 'editing', submit: 'submitting' },
      confirmed: {},
    };
    const storageKey = 'tt_checkout_attempt';
    let pending = null;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey));
      if (saved?.cartId && saved.idempotencyKey) pending = saved;
    } catch { /* Storage may be unavailable; keep same-page recovery. */ }
    let phase = pending ? 'recoverable-failure' : form.dataset.checkoutPhase;

    function remember(attempt) {
      pending = attempt;
      try {
        if (attempt) sessionStorage.setItem(storageKey, JSON.stringify(attempt));
        else sessionStorage.removeItem(storageKey);
      } catch { /* In-memory attempt remains usable. */ }
    }

    function renderPhase() {
      const busy = phase === 'submitting';
      const locked = busy || Boolean(pending) || phase === 'confirmed';
      form.dataset.checkoutPhase = phase;
      form.dataset.locked = String(locked);
      form.setAttribute('aria-busy', String(busy));
      form.querySelectorAll('fieldset').forEach(el => { el.disabled = locked; });
      const qty = currentQuantity();
      $('[data-qty-increase]').disabled = locked || qty >= Number(document.body.dataset.maxQty);
      $('[data-qty-decrease]').disabled = locked || qty === 0;
      submit.disabled = busy || phase === 'confirmed' || (qty === 0 && !pending);
      submitLabel.textContent = phase === 'confirmed' ? 'Order confirmed'
        : busy ? 'Waiting for the shop…'
        : pending ? 'Check previous order'
        : `Place demo order · ${$('[data-total]').textContent}`;
    }

    function move(event) {
      const next = transitions[phase][event];
      if (!next) return false;
      phase = next;
      renderPhase();
      return true;
    }

    function clearErrors() {
      const existing = $('#checkout-errors');
      if (existing) existing.remove();
      $$('.field-error', form).forEach((element) => element.remove());
      $$('.field--error', form).forEach((element) => element.classList.remove('field--error'));
      $$('[aria-invalid="true"]', form).forEach((element) => {
        element.removeAttribute('aria-invalid');
        const described = element.getAttribute('aria-describedby');
        if (!described) return;
        const ids = described
          .split(/\s+/)
          .filter((id) => !id.endsWith('-error'));
        if (ids.length) element.setAttribute('aria-describedby', ids.join(' '));
        else element.removeAttribute('aria-describedby');
      });
    }

    function renderErrors(errors) {
      clearErrors();
      const keys = Object.keys(errors || {});
      if (!keys.length) return;

      const summary = document.createElement('div');
      summary.className = 'error-summary';
      summary.id = 'checkout-errors';
      summary.setAttribute('role', 'alert');
      summary.tabIndex = -1;

      const mark = document.createElement('div');
      mark.className = 'error-summary-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = '!';

      const copy = document.createElement('div');
      const heading = document.createElement('h2');
      heading.textContent = 'There is a problem with this order';
      const list = document.createElement('ul');

      keys.forEach((key) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = `#field-${key}`;
        link.textContent = errors[key];
        item.append(link);
        list.append(item);

        const input = document.getElementById(`field-${key}`);
        if (!input) return;
        const field = input.closest('.field');
        if (field) field.classList.add('field--error');
        input.setAttribute('aria-invalid', 'true');

        const errorId = `field-${key}-error`;
        const described = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        if (!described.includes(errorId)) described.push(errorId);
        input.setAttribute('aria-describedby', described.join(' '));

        const message = document.createElement('p');
        message.className = 'field-error';
        message.id = errorId;
        message.textContent = errors[key];
        const anchor = input.closest('.phone-input') || input;
        anchor.insertAdjacentElement('afterend', message);
      });

      copy.append(heading, list);
      summary.append(mark, copy);
      form.insertBefore(summary, form.firstChild);
      summary.focus({ preventScroll: true });
      summary.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
    }

    function collect() {
      const data = new FormData(form);
      return {
        fullName: String(data.get('fullName') || '').trim(),
        email: String(data.get('email') || '').trim(),
        phone: String(data.get('phone') || '').trim(),
        address1: String(data.get('address1') || '').trim(),
        address2: String(data.get('address2') || '').trim(),
        city: String(data.get('city') || '').trim(),
        state: String(data.get('state') || '').trim(),
        pin: String(data.get('pin') || '').trim(),
      };
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      if (!pending && !hiddenCartId.value) {
        setStatus('Reload the shop to start a fresh cart before placing an order.');
        return;
      }

      const customer = collect(); // Disabled fieldsets are omitted from FormData.
      const checking = Boolean(pending);
      if (!move('submit')) return;
      clearErrors();
      setStatus(checking ? 'Checking whether your previous order was saved…' : 'Checking your details…');

      const idempotencyKey = hiddenIdempotency?.value || newKey();
      if (hiddenIdempotency) hiddenIdempotency.value = idempotencyKey;

      const payload = {
        cartId: hiddenCartId?.value || document.body.dataset.cartId || null,
        expectedRevision: Number(hiddenRevision?.value || document.body.dataset.cartRevision || 0),
        idempotencyKey,
        customer,
      };

      try {
        if (!checking) remember({ cartId: payload.cartId, idempotencyKey });
        const response = await fetch(checking ? '/api/orders/status' : '/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrf,
            'If-Match': etag(),
          },
          body: JSON.stringify(checking ? pending : payload),
          signal: AbortSignal.timeout(20000),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.order?.receiptUrl) {
          remember(null);
          move('confirmed');
          setStatus('Order placed. Opening your receipt…');
          window.location.assign(data.order.receiptUrl);
          return;
        }

        if (checking) {
          if (response.ok && data.order === null) {
            if (hiddenIdempotency && hiddenCartId?.value === pending.cartId) hiddenIdempotency.value = pending.idempotencyKey;
            remember(null);
            setStatus('No saved order was found for this attempt. Review your cart and details before submitting.');
          } else {
            setStatus('Order status is still unknown. Check again in a moment.');
          }
          move('failure');
          return;
        }
        // Only a recognized rejection establishes that the write did not succeed.
        if (![400, 403, 404, 409, 422, 428, 429].includes(response.status) || !data.code) {
          throw new Error('Uncertain order outcome');
        }
        remember(null);
        move('failure');
        if (response.status === 422 && data.errors) {
          renderErrors(data.errors);
          setStatus('Check the highlighted delivery details.');
          return;
        }

        if (response.status === 409) {
          if (!data.cart) {
            setStatus('Reload the shop to review the current basket.');
            return;
          }
          applyCart(data.cart);
          if (hiddenIdempotency) hiddenIdempotency.value = newKey();
          const notice = $('[data-cart-notice]');
          if (notice) {
            notice.textContent =
              'This cart changed somewhere else. We refreshed the total. Review it and place the order again.';
            notice.hidden = false;
            notice.focus?.();
            notice.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
          }
          setStatus('Cart refreshed. Review the total and try again.');
          return;
        }

        if (response.status === 428) {
          setStatus('The cart changed. Reload the page and try again.');
          return;
        }

        if (response.status === 429) {
          setStatus('Too many attempts. Wait a minute and try again.');
          return;
        }

        if (response.status === 403) {
          setStatus('Your session expired. Reload the page and try again.');
          return;
        }

        setStatus('We could not place the order. Try again.');
      } catch {
        move('failure');
        setStatus('The shop has not confirmed the outcome. Check the previous order before submitting again.');
      }
    });

    form.addEventListener('input', () => {
      if (!pending && phase === 'recoverable-failure') move('edit');
    });
    renderPhase();
    if (pending) setStatus('A previous checkout has no confirmed outcome. Check it before placing another order.');
  }
})();
