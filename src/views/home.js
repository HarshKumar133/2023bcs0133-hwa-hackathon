import { PRODUCT, totalsFor } from '../pricing.js';
import { formatINR } from './money.js';
import { escapeAttr, escapeHtml } from '../security.js';
import { sectionLabel } from './layout.js';

function routeMini(route) {
  const long = route === 'long';
  return `
    <svg class="route-mini" viewBox="0 0 120 84" aria-hidden="true">
      <circle cx="60" cy="60" r="28" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.35"/>
      <path d="${long ? 'M60 22 L86 58 L34 58' : 'M60 22 L34 58 L86 58'}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 5"/>
      <circle cx="60" cy="22" r="5.5" fill="currentColor"/>
      <circle cx="${long ? 86 : 34}" cy="58" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <circle cx="${long ? 34 : 86}" cy="58" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
    </svg>
  `;
}

function opportunityTimeline() {
  return `
    <ol class="opportunity-timeline" aria-label="Four timed opportunities in a 45-minute window">
      ${[0, 15, 30, 45].map((minute, index) => `
        <li data-slot="${index}" class="is-upcoming">
          <span class="slot-time">${minute} min</span>
          <span class="slot-dot" aria-hidden="true"></span>
          <span class="slot-label" data-slot-label="${index}">Upcoming</span>
        </li>
      `).join('')}
    </ol>
  `;
}

export function renderHome({
  cart,
  csrfToken,
  notice = '',
}) {
  const quantity = cart?.quantity ?? 0;
  const totals = cart?.totals ?? totalsFor(quantity);
  const cartId = cart?.id || '';
  const revision = cart?.revision || 0;

  const bodyData = [
    `data-page="home"`,
    `data-cart-id="${escapeAttr(cartId)}"`,
    `data-cart-revision="${escapeAttr(revision)}"`,
    `data-csrf="${escapeAttr(csrfToken)}"`,
    `data-max-qty="${PRODUCT.maxQuantity}"`,
    `data-currency="${PRODUCT.currency}"`,
    `data-totals="${escapeAttr(JSON.stringify(totals))}"`,
  ].join(' ');

  const body = `
    <main id="main">
      <div class="guide-head shell">
        <p>Owner's field guide</p>
        <p>Plate 01 · Floor toy</p>
        <p>${escapeHtml(PRODUCT.sku)}</p>
      </div>

      <section class="hero shell" aria-labelledby="hero-title">
        <figure class="hero-visual reveal">
          <div class="hero-plate">
            <div class="plate-grid" aria-hidden="true"></div>
            <span class="plate-index" aria-hidden="true">Fig. 01</span>
            <img class="hero-toy" src="/assets/toy-plate.svg" alt="Original illustration of TrailTurn: a low forest-green floor toy with three cream paddles in a shallow arc and a reward cup at the front. The back paddle is raised." width="1000" height="780">
            <span class="annotation annotation--a"><span class="annotation-dot" aria-hidden="true"></span>Held step</span>
            <span class="annotation annotation--b"><span class="annotation-dot" aria-hidden="true"></span>Tomato route</span>
            <span class="annotation annotation--c"><span class="annotation-dot" aria-hidden="true"></span>Reward cup</span>
            <div class="route-chip">
              <span class="route-chip-label">Route card A</span>
              <span class="route-chip-name">Long way</span>
              <span class="route-chip-seq">1 <span aria-hidden="true">→</span> 2 <span aria-hidden="true">→</span> 3</span>
            </div>
          </div>
          <figcaption class="hero-caption">
            <span>Plate 01 — three-quarter view</span>
            <span>Forest green · cream paddles · tomato route</span>
          </figcaption>
        </figure>

        <div class="hero-copy">
          <p class="eyebrow reveal">TrailTurn · the floor toy that holds its place</p>
          <h1 id="hero-title" class="reveal">A route your dog can <em>feel.</em><br>And return to.</h1>
          <p class="hero-mechanism reveal">Three cream paddles in a shallow arc. One stays raised, a reward cup waits at the front, and the route is still there when your dog comes back.</p>

          <div class="buy-panel reveal" id="buy">
            <div class="buy-panel-top">
              <p class="buy-name">TrailTurn <span>No. 01</span></p>
              <p class="buy-stock">Concept shop · demo checkout</p>
            </div>
            <div class="buy-price-row">
              <p class="buy-price"><strong>${formatINR(PRODUCT.unitPricePaise)}</strong><span>+ ${formatINR(PRODUCT.deliveryPaise)} delivery</span></p>
              <p class="buy-delivered">${formatINR(totalsFor(1).totalPaise)} delivered</p>
            </div>
            ${notice ? `<p class="notice notice--warn" role="status">${escapeHtml(notice)}</p>` : ''}
            <div class="notice notice--warn" data-cart-notice hidden role="status" tabindex="-1"></div>
            <form class="buy-form" method="post" action="/cart">
              <input type="hidden" name="csrf" value="${escapeAttr(csrfToken)}">
              <input type="hidden" name="cartId" value="${escapeAttr(cartId)}">
              <input type="hidden" name="revision" value="${revision}">
              <input type="hidden" name="quantity" value="${Math.min(quantity + 1, PRODUCT.maxQuantity)}" data-buy-quantity>
              <div class="buy-row">
                <div class="qty" role="group" aria-label="Quantity">
                  <button type="button" class="qty-button" data-qty-decrease aria-label="Decrease quantity" ${quantity === 0 ? 'disabled' : ''}>−</button>
                  <span class="qty-value" data-qty-value aria-live="polite">${quantity}</span>
                  <button type="button" class="qty-button" data-qty-increase aria-label="Increase quantity" ${quantity >= PRODUCT.maxQuantity ? 'disabled' : ''}>+</button>
                </div>
                <button type="submit" class="button button--tomato button--large buy-add" ${quantity >= PRODUCT.maxQuantity ? 'disabled' : ''}>
                  <span data-buy-label>${quantity ? 'Add another' : 'Add to cart'}</span>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </form>
            <a class="button button--forest button--full buy-checkout" href="/checkout" data-checkout-link ${quantity ? '' : 'aria-disabled="true"'}>
              <span>Checkout</span>
              <span data-total>${formatINR(totals.totalPaise)}</span>
            </a>
            <p class="buy-note">${quantity ? 'In your basket. Delivery is charged once per order.' : 'No payment collected. This demo creates a receipt only.'}</p>
          </div>

          <ul class="hero-facts reveal" aria-label="TrailTurn at a glance">
            <li><span>45</span> min window</li>
            <li><span>4</span> timed chances</li>
            <li><span>1</span> route held</li>
          </ul>
          <p class="hero-route reveal"><span>Route cards</span> Long way 1 <span aria-hidden="true">→</span> 2 <span aria-hidden="true">→</span> 3 <span class="dot" aria-hidden="true">·</span> Switchback 1 <span aria-hidden="true">→</span> 3 <span aria-hidden="true">→</span> 2</p>
        </div>
      </section>

      <div class="guide-strip" aria-hidden="true">
        <div class="shell guide-strip-inner">
          <span>One route</span><span>Four timed chances</span><span>No pile-ups</span><span>Walk away, come back</span>
        </div>
      </div>

      <section class="field-notes shell" id="difference" aria-labelledby="difference-title">
        <div class="field-notes-head">
          ${sectionLabel('01', 'Field notes')}
          <h2 id="difference-title" class="reveal">A sequence is a trick.<br><em>A route is a conversation.</em></h2>
          <p class="field-notes-lead reveal">Touchpad games already teach a dog to touch pads in order. TrailTurn is built around what happens between the steps: the pause, the walk-away, the return.</p>
        </div>
        <ol class="field-note-list">
          <li class="reveal">
            <span class="field-note-number">01</span>
            <div>
              <h3>It keeps the next step up</h3>
              <p>The drum holds the current paddle physically raised. No screen, no reset, no starting from the beginning.</p>
            </div>
          </li>
          <li class="reveal">
            <span class="field-note-number">02</span>
            <div>
              <h3>It resumes where you left it</h3>
              <p>Step away after the first push. The route waits. Come back and the next paddle is still the next paddle.</p>
            </div>
          </li>
          <li class="reveal">
            <span class="field-note-number">03</span>
            <div>
              <h3>It lets a chance pass</h3>
              <p>A missed 15-minute slot doesn't empty a pile of portions into the next one. The opportunity passes; the route stays.</p>
            </div>
          </li>
        </ol>
        <div class="difference-strip reveal">
          <p class="difference-quote">“The useful part isn't the push. It's the pause before the next one.”</p>
          <div class="difference-timeline" aria-label="A missed opportunity does not stack portions">
            <span class="mini-slot is-used"><span>0</span><small>used</small></span>
            <span class="mini-line" aria-hidden="true"></span>
            <span class="mini-slot is-missed"><span>15</span><small>passed</small></span>
            <span class="mini-line" aria-hidden="true"></span>
            <span class="mini-slot is-current"><span>30</span><small>waiting</small></span>
            <span class="mini-line" aria-hidden="true"></span>
            <span class="mini-slot"><span>45</span><small>ahead</small></span>
          </div>
        </div>
      </section>

      <section class="section section--toy shell" id="toy" aria-labelledby="toy-title">
        ${sectionLabel('02', 'The object')}
        <div class="section-heading split-heading">
          <h2 id="toy-title" class="reveal">One object.<br><em>Three ways to read it.</em></h2>
          <p class="section-lead reveal">The same three-paddle outline runs through the plate, the plan, and the lift. These are working drawings, not photographs: they describe the geometry the shop is built around.</p>
        </div>
        <div class="gallery-layout">
          <div class="gallery reveal" data-gallery>
            <figure class="gallery-main">
              <div class="gallery-frame">
                <img data-gallery-image src="/assets/toy-plan.svg" alt="Overhead view of TrailTurn: three cream paddles in a shallow arc, a tomato route, and a front reward cup" width="800" height="800">
                <span class="gallery-index" data-gallery-count>01 / 03</span>
              </div>
              <figcaption>
                <span data-gallery-caption>The route, from above</span>
                <span class="gallery-note">Original illustration</span>
              </figcaption>
            </figure>
            <div class="gallery-thumbs" role="group" aria-label="Product views">
              <button type="button" class="gallery-thumb is-active" data-gallery-thumb data-src="/assets/toy-plan.svg" data-alt="Overhead view of TrailTurn: three cream paddles in a shallow arc, a tomato route, and a front reward cup" data-caption="The route, from above" data-count="01 / 03" aria-pressed="true">
                <img src="/assets/toy-plan.svg" alt="" width="240" height="240">
                <span>The plan</span>
              </button>
              <button type="button" class="gallery-thumb" data-gallery-thumb data-src="/assets/toy-lift.svg" data-alt="Low side view of TrailTurn with the first cream paddle lifted and the reward cup at the front" data-caption="The lift, from the side" data-count="02 / 03" aria-pressed="false">
                <img src="/assets/toy-lift.svg" alt="" width="240" height="187">
                <span>The lift</span>
              </button>
              <button type="button" class="gallery-thumb" data-gallery-thumb data-src="/assets/toy-plate.svg" data-alt="Three-quarter view of TrailTurn: a low forest-green body, three cream paddles, and a front reward cup" data-caption="The whole object" data-count="03 / 03" aria-pressed="false">
                <img src="/assets/toy-plate.svg" alt="" width="240" height="187">
                <span>The plate</span>
              </button>
            </div>
          </div>
          <div class="toy-details reveal">
            <p class="toy-kicker">The route is printed where the owner can see it.</p>
            <p>Set the route card under the clear top. The dog works the raised paddle; the drum indexes the route. The diagram stays visible during setup, so the path is a shared plan rather than a hidden trick.</p>
            <dl class="spec-list">
              <div><dt>Footprint</dt><dd>34 cm across · 11 cm tall · 2.1 kg</dd></div>
              <div><dt>Finish</dt><dd>Forest-green body · broad cream paddles · front reward cup</dd></div>
              <div><dt>Route</dt><dd>Three paddles · four timed chances · one held step</dd></div>
              <div><dt>Care</dt><dd>Wipe-clean top · supervised floor play · not a chew toy</dd></div>
            </dl>
            <div class="in-the-box">
              <h3>In the box</h3>
              <ul>
                <li>TrailTurn drum</li>
                <li>Three paddle set</li>
                <li>Long way and Switchback route cards</li>
                <li>Quick-start guide + portion cup</li>
              </ul>
            </div>
            <div class="toy-buyline">
              <span class="toy-price">${formatINR(PRODUCT.unitPricePaise)}</span>
              <a class="button button--forest" href="#buy">Choose TrailTurn</a>
            </div>
            <p class="fine-print">Illustrations, not photographs. The product is a concept; materials and dimensions are proposed demo details.</p>
          </div>
        </div>
      </section>

      <section class="section section--how" id="how" aria-labelledby="how-title">
        <div class="shell">
          ${sectionLabel('03', 'Set, lift, return')}
          <div class="section-heading split-heading">
            <h2 id="how-title" class="reveal">Set a route. Let it lift.<br><em>Let it wait.</em></h2>
            <p class="section-lead reveal">The interaction is deliberately small. The interesting part is what the object does when nobody is pushing.</p>
          </div>
          <div class="steps">
            <article class="step reveal">
              <span class="step-number">01</span>
              <div class="step-visual" aria-hidden="true">
                <svg viewBox="0 0 220 150"><circle cx="110" cy="78" r="52" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M110 32 L154 102 L66 102" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5 6"/><circle cx="110" cy="32" r="7" fill="currentColor"/><circle cx="154" cy="102" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="66" cy="102" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M28 128h164" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.3"/></svg>
              </div>
              <h3>Set the route</h3>
              <p>Slide a route card under the clear top. Long way runs 1 → 2 → 3. Switchback runs 1 → 3 → 2. The diagram stays visible while you set up.</p>
            </article>
            <article class="step reveal">
              <span class="step-number">02</span>
              <div class="step-visual" aria-hidden="true">
                <svg viewBox="0 0 220 150"><circle cx="110" cy="78" r="52" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M70 78h80" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="70" cy="78" r="5" fill="currentColor"/><circle cx="96" cy="78" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="122" cy="78" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="148" cy="78" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M70 58v-16M96 58v-10M122 58v-6M148 58v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><text x="110" y="132" text-anchor="middle" font-family="Instrument Sans, sans-serif" font-size="10" letter-spacing="2" fill="currentColor">0 · 15 · 30 · 45</text></svg>
              </div>
              <h3>Start the window</h3>
              <p>At minute 0, the first paddle lifts. At 15, 30, and 45, the next opportunity arrives. Four chances — not a pile of portions.</p>
            </article>
            <article class="step reveal">
              <span class="step-number">03</span>
              <div class="step-visual" aria-hidden="true">
                <svg viewBox="0 0 220 150"><circle cx="110" cy="78" r="52" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M110 32 L154 102 L66 102" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5 6"/><circle cx="110" cy="32" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="154" cy="102" r="7" fill="currentColor"/><circle cx="66" cy="102" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M170 44c10 8 12 22 4 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="3 4"/><path d="M168 36l9 6-4 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <h3>Let the route wait</h3>
              <p>One nose push indexes the drum and raises the next paddle. Walk away and it stays raised. Return and continue the same route.</p>
            </article>
          </div>

          <div class="how-notes reveal">
            <div class="how-note">
              <p class="eyebrow">What a missed round does</p>
              <p>It passes. The slot closes without releasing extra portions. The raised paddle is still the current step, not a queue of treats.</p>
            </div>
            <div class="how-note">
              <p class="eyebrow">What the dog learns</p>
              <p>A route, not a random target. The same three-paddle outline is in the room, on the drum, and in the demo — so the owner and dog meet the same shape.</p>
            </div>
          </div>

          <div class="faq reveal">
            <h3 class="faq-title">The questions we'd ask before buying</h3>
            <details>
              <summary>Is TrailTurn a treat dispenser?</summary>
              <p>The proposed toy releases a measured portion into the front cup when your dog follows the raised paddle. A missed slot never stacks extra portions. The mechanism still needs physical testing.</p>
            </details>
            <details>
              <summary>What happens if my dog walks away?</summary>
              <p>The current paddle stays raised. The route does not reset. Returning resumes the same step, which is the behaviour the web demo is built to show.</p>
            </details>
            <details>
              <summary>What happens if a time slot is missed?</summary>
              <p>The slot passes without releasing a pile of portions. The raised paddle waits for the next interaction. This is a proposed policy, not a validated mechanical behaviour.</p>
            </details>
            <details>
              <summary>Is the sequence itself new?</summary>
              <p>No claim of worldwide novelty. CleverPet already describes dogs touching pads in sequence. TrailTurn's proposed difference is a route the dog can feel and resume, with the next step physically held.</p>
            </details>
            <details>
              <summary>Can my dog use it unsupervised?</summary>
              <p>That has not been validated. Treat it as supervised floor play, inspect the toy for wear, and check with a vet or behaviour professional if your dog is a heavy chewer.</p>
            </details>
            <details>
              <summary>Is the checkout real?</summary>
              <p>It is a working guest checkout and receipt flow, but this demo does not collect payment and no product ships. The ${formatINR(PRODUCT.unitPricePaise)} price, ${formatINR(PRODUCT.deliveryPaise)} delivery, and ${PRODUCT.maxQuantity}-unit limit are demo decisions.</p>
            </details>
          </div>
        </div>
      </section>

      <section class="section section--demo" id="demo" aria-labelledby="demo-title">
        <div class="shell">
          ${sectionLabel('04', 'Try a route')}
          <div class="section-heading split-heading">
            <h2 id="demo-title" class="reveal">Three taps.<br><em>Then try the other route.</em></h2>
            <p class="section-lead reveal">Choose a route and tap the raised paddle. Each tap jumps to the next timed chance. Try walking away and letting a slot pass: the next paddle will still be waiting when you return.</p>
          </div>

          <div class="demo reveal" data-demo data-phase="ready" data-route="long" data-step="0" data-opportunity="0">
            <div class="demo-top">
              <div class="route-picker" role="group" aria-label="Choose a route">
                <button type="button" class="route-card is-active" data-route="long" aria-pressed="true">
                  <span class="route-card-head"><span class="route-card-tag">Route A</span><span class="route-card-name">Long way</span></span>
                  ${routeMini('long')}
                  <span class="route-card-seq">1 <span aria-hidden="true">→</span> 2 <span aria-hidden="true">→</span> 3</span>
                  <span class="route-card-copy">The broad loop. Good for a first session.</span>
                </button>
                <button type="button" class="route-card" data-route="switch" aria-pressed="false">
                  <span class="route-card-head"><span class="route-card-tag">Route B</span><span class="route-card-name">Switchback</span></span>
                  ${routeMini('switch')}
                  <span class="route-card-seq">1 <span aria-hidden="true">→</span> 3 <span aria-hidden="true">→</span> 2</span>
                  <span class="route-card-copy">A tighter turn. Try it after the first route.</span>
                </button>
              </div>

              <div class="demo-stage">
                <div class="demo-toy">
                  <svg class="demo-paths" viewBox="0 0 400 400" aria-hidden="true">
                    <circle cx="200" cy="200" r="168" fill="#475f4c" stroke="#a4b896" stroke-width="1.2"/>
                    <ellipse cx="200" cy="354" rx="39" ry="20" fill="#acbf99" stroke="#263b30" stroke-width="2"/>
                    <ellipse cx="200" cy="354" rx="31" ry="14" fill="#304b39"/>
                    <circle cx="200" cy="200" r="118" fill="none" stroke="currentColor" stroke-width="1" opacity="0.18" stroke-dasharray="2 7"/>
                    <path data-segment="long-0" d="M200 96 L304 272" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="6 8" opacity="0.45"/>
                    <path data-segment="long-1" d="M304 272 L96 272" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="6 8" opacity="0.45"/>
                    <path data-segment="switch-0" d="M200 96 L96 272" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="6 8" opacity="0.45"/>
                    <path data-segment="switch-1" d="M96 272 L304 272" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="6 8" opacity="0.45"/>
                  </svg>

                  <div class="demo-slot demo-slot--1">
                    <button type="button" class="demo-paddle" data-paddle="1" aria-label="Paddle 1, waiting.">
                      <span class="paddle-face"><span class="paddle-number">1</span></span>
                      <span class="paddle-tag">PUSH</span>
                    </button>
                  </div>
                  <div class="demo-slot demo-slot--2">
                    <button type="button" class="demo-paddle" data-paddle="2" aria-label="Paddle 2, waiting.">
                      <span class="paddle-face"><span class="paddle-number">2</span></span>
                      <span class="paddle-tag">PUSH</span>
                    </button>
                  </div>
                  <div class="demo-slot demo-slot--3">
                    <button type="button" class="demo-paddle" data-paddle="3" aria-label="Paddle 3, waiting.">
                      <span class="paddle-face"><span class="paddle-number">3</span></span>
                      <span class="paddle-tag">PUSH</span>
                    </button>
                  </div>

                  <div class="demo-hub" aria-hidden="true">
                    <span class="hub-mark">TT</span>
                    <span class="hub-label">route held</span>
                  </div>

                  <div class="demo-dial" data-dial data-step="0" aria-hidden="true">
                    <span class="dial-ring"></span>
                    <span class="dial-hand"></span>
                    <span class="dial-tick dial-tick--0">0</span>
                    <span class="dial-tick dial-tick--1">15</span>
                    <span class="dial-tick dial-tick--2">30</span>
                    <span class="dial-tick dial-tick--3">45</span>
                  </div>
                </div>
                <p class="demo-hint" data-demo-hint>Choose a route, then start the window.</p>
              </div>

              <div class="demo-panel">
                <div class="demo-status" aria-live="polite">
                  <p class="eyebrow">Current state</p>
                  <p class="demo-status-title" data-demo-status>Ready when you are.</p>
                  <p class="demo-status-detail" data-demo-detail>Pick a route to see its path on the drum.</p>
                </div>
                <dl class="demo-stats">
                  <div><dt>Route</dt><dd data-demo-route>Long way</dd></div>
                  <div><dt>Paddle up</dt><dd data-demo-paddle>—</dd></div>
                  <div><dt>Missed chances</dt><dd data-demo-missed>0</dd></div>
                  <div><dt>Portions used</dt><dd data-demo-used>0</dd></div>
                </dl>
                <div class="demo-controls">
                  <button type="button" class="button button--cream" data-demo-start>Start the window</button>
                  <button type="button" class="button button--ghost" data-demo-away disabled>Walk away</button>
                  <button type="button" class="button button--ghost" data-demo-skip disabled>Let 15 min pass</button>
                  <button type="button" class="button button--text" data-demo-reset>Reset</button>
                </div>
                ${opportunityTimeline()}
                <p class="demo-footnote" data-demo-footnote>A missed slot passes without releasing a pile. The route stays put.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="closing shell" id="order" aria-labelledby="order-title">
        <div class="closing-plate reveal">
          <img src="/assets/toy-plan.svg" alt="" width="800" height="800">
        </div>
        <div class="closing-copy reveal">
          <p class="eyebrow">One clear total</p>
          <h2 id="order-title">Take the route home.</h2>
          <p class="closing-lead">One TrailTurn, two route cards, and a receipt you can reload. Guest checkout — no account, no payment collected.</p>
          <div class="closing-price">
            <span>${formatINR(PRODUCT.unitPricePaise)}</span>
            <span>+ ${formatINR(PRODUCT.deliveryPaise)} delivery</span>
            <strong>${formatINR(totalsFor(1).totalPaise)} delivered</strong>
          </div>
          <a class="button button--tomato button--large" href="#buy">Add TrailTurn <span aria-hidden="true">↑</span></a>
          <p class="closing-fine">Demo order only. No charge, no shipment. The route demo and the shop share the same three-paddle language.</p>
        </div>
      </section>
    </main>
  `;

  return { body, bodyData, bodyClass: 'page-home' };
}
