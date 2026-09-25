import { IntentModel } from './intent-model.js';
import { parsePoolSize, calculatePool } from './pool-calculator.js';

const MODEL_URL = 'assets/chatbot/model.json';
const RESPONSES_URL = 'assets/chatbot/responses.json';
const START_REPLIES = ['Size my pool equipment', 'My pool is green', 'What do you sell?', 'Opening hours'];

const root = document.getElementById('chatbot-root');
root.innerHTML = `
  <button class="cb-launcher" type="button" aria-label="Open chat with AquaFix assistant" aria-expanded="false">
    <i class="bi bi-chat-dots-fill"></i>
  </button>
  <section class="cb-panel" role="dialog" aria-label="AquaFix assistant" hidden>
    <header class="cb-header">
      <div class="cb-avatar"><i class="bi bi-droplet-fill"></i></div>
      <div>
        <h2>AquaFix Assistant</h2>
        <p>AI trained on AquaFix products</p>
      </div>
      <button class="cb-close" type="button" aria-label="Close chat"><i class="bi bi-x-lg"></i></button>
    </header>
    <div class="cb-messages" aria-live="polite"></div>
    <div class="cb-quick"></div>
    <form class="cb-form">
      <input type="text" name="message" placeholder="Ask about pumps, filters, chlorine..." autocomplete="off" aria-label="Your message" required>
      <button type="submit" aria-label="Send"><i class="bi bi-send-fill"></i></button>
    </form>
  </section>`;

const launcher = root.querySelector('.cb-launcher');
const panel = root.querySelector('.cb-panel');
const messages = root.querySelector('.cb-messages');
const quick = root.querySelector('.cb-quick');
const form = root.querySelector('.cb-form');
const input = form.elements.message;

let model = null;
let responses = null;
let loading = null;
let awaitingPoolSize = false;

function loadBrain() {
  loading ??= Promise.all([
    IntentModel.load(MODEL_URL),
    fetch(RESPONSES_URL).then((r) => r.json()),
  ]).then(([m, r]) => { model = m; responses = r; });
  return loading;
}

// ------------------------------------------------------------------ rendering
function scrollDown() {
  messages.scrollTop = messages.scrollHeight;
}

function addMessage(from, content) {
  const bubble = document.createElement('div');
  bubble.className = `cb-msg cb-${from}`;
  if (typeof content === 'string') bubble.textContent = content;
  else bubble.append(content);
  messages.append(bubble);
  scrollDown();
  return bubble;
}

function setQuickReplies(list = []) {
  quick.replaceChildren(...list.map((text) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.textContent = text;
    chip.addEventListener('click', () => send(text));
    return chip;
  }));
}

function botSay(text, { link, quickReplies } = {}) {
  const bubble = addMessage('bot', text);
  if (link) {
    const a = document.createElement('a');
    a.href = link.href;
    a.className = 'cb-link';
    a.textContent = `${link.label} →`;
    a.addEventListener('click', () => closeChat());
    bubble.append(document.createElement('br'), a);
  }
  setQuickReplies(quickReplies);
}

function showTyping() {
  const dots = addMessage('bot', '');
  dots.classList.add('cb-typing');
  dots.innerHTML = '<span></span><span></span><span></span>';
  return dots;
}

const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

function describeSize(size) {
  if (size.shape === 'rect') return `${fmt(size.length)} × ${fmt(size.width)} m, ${fmt(size.depth)} m deep`;
  if (size.shape === 'round') return `round, ${fmt(size.diameter)} m diameter, ${fmt(size.depth)} m deep`;
  return `${fmt(size.volume)} m³`;
}

// Plain-text version of the plan, used to prefill the quote form
function planSummary(size, plan) {
  const a = plan.accessories;
  return [
    `Pool: ${describeSize(size)} (${fmt(plan.volume)} m3)`,
    plan.commercial ? 'Commercial setup needed' : `Sand filter ${plan.filter.diameterMm} mm, pump ${fmt(plan.pump.hp)} HP`,
    `${a.skimmers} skimmers, ${a.mainDrains} main drains, ${a.returnInlets} return inlets, ${a.lights} LED lights, ${a.hoseLength} m vacuum hose`,
    'Please send me a quote for this equipment.',
  ].join('\n');
}

function renderPlan(size, plan) {
  const a = plan.accessories;
  const card = document.createElement('div');
  card.className = 'cb-plan';
  // Only numbers from the calculator are interpolated here, never user text
  card.innerHTML = `
    <h3>Your pool plan</h3>
    <p class="cb-plan-sub">${describeSize(size)}</p>
    <dl>
      <dt>Water volume</dt><dd>${fmt(plan.volume)} m³</dd>
      <dt>Surface</dt><dd>${fmt(plan.surfaceArea)} m²</dd>
      <dt>Flow needed</dt><dd>${fmt(plan.flowRate)} m³/h <small>(${plan.turnoverHours} h turnover)</small></dd>
    </dl>
    ${plan.commercial ? `
      <p class="cb-plan-warn">This pool needs more than 31 m³/h, which calls for a commercial setup with several filters. Our team will design it for you.</p>
    ` : `
      <h4><i class="bi bi-funnel"></i> Sand filter</h4>
      <p>${plan.filter.diameterMm} mm with multiport valve (up to ${plan.filter.maxFlow} m³/h), about ${plan.filter.sandKg} kg filter sand</p>
      <h4><i class="bi bi-gear-wide-connected"></i> Pump</h4>
      <p>${fmt(plan.pump.hp)} HP self-priming pool pump</p>
    `}
    <h4><i class="bi bi-box-seam"></i> Accessories</h4>
    <ul>
      <li>${a.skimmers} skimmer${a.skimmers > 1 ? 's' : ''}</li>
      <li>${a.mainDrains} main drains (safety)</li>
      <li>${a.returnInlets} return inlets</li>
      <li>${a.lights} LED pool light${a.lights > 1 ? 's' : ''}</li>
      <li>${a.hoseLength} m vacuum hose + vacuum head</li>
      <li>Telescopic pole, leaf net and wall brush</li>
      <li>Chlorine and pH test kit</li>
    </ul>
    <h4><i class="bi bi-droplet-half"></i> Start-up chemicals</h4>
    <p>About ${fmt(plan.chemicals.startChlorineKg)} kg SDIC chlorine granular to reach ${plan.chemicals.startPpm} ppm, plus algaecide as per label.</p>
    <p class="cb-plan-note">Estimate based on standard sizing rules${size.depthAssumed ? ' and an assumed 1.5 m average depth' : ''}. Our technician confirms the final choice.</p>
  `;
  const quoteBtn = document.createElement('a');
  quoteBtn.href = '#quote';
  quoteBtn.className = 'cb-plan-btn';
  quoteBtn.textContent = 'Get a quote for this plan';
  quoteBtn.addEventListener('click', () => {
    const quoteForm = document.getElementById('quoteForm');
    if (quoteForm) quoteForm.elements.message.value = planSummary(size, plan);
    closeChat();
  });
  card.append(quoteBtn);
  addMessage('bot', card);
  setQuickReplies(['Size another pool', 'Do you install?', 'Do you deliver?']);
}

// ------------------------------------------------------------------ dialogue
function answerIntent(tag) {
  const r = responses[tag];
  const text = r.responses[Math.floor(Math.random() * r.responses.length)];
  botSay(text, { link: r.link, quickReplies: r.quickReplies });
  if (r.action === 'pool_sizing') awaitingPoolSize = true;
}

function reply(text) {
  const prediction = model.predict(text);
  const size = parsePoolSize(text);

  // Waiting for dimensions: accept them, unless the customer clearly changed the subject
  if (awaitingPoolSize) {
    if (size) {
      awaitingPoolSize = false;
      renderPlan(size, calculatePool(size));
      return;
    }
    const sizingTags = ['pool_sizing', 'chlorine_dosing'];
    if (!prediction.confident || sizingTags.includes(prediction.tag)) {
      botSay("I couldn't read the size. Please write it like 8 x 4 x 1.5 (length, width, depth in meters) or 60 m3.",
        { quickReplies: ['8 x 4 x 1.5', '10 x 5 x 1.6', '50 m3'] });
      return;
    }
    awaitingPoolSize = false;
  }

  if (!prediction.confident) {
    botSay("Sorry, I'm not sure I understood. Could you rephrase? You can also pick a topic below.",
      { quickReplies: START_REPLIES });
    return;
  }

  // "pump for my 8x4 pool" already contains the size: skip the question
  if (responses[prediction.tag].action === 'pool_sizing' && size) {
    renderPlan(size, calculatePool(size));
    return;
  }
  answerIntent(prediction.tag);
}

async function send(text) {
  const clean = text.trim();
  if (!clean) return;
  addMessage('user', clean);
  setQuickReplies();
  input.value = '';

  const typing = showTyping();
  try {
    await Promise.all([loadBrain(), new Promise((r) => setTimeout(r, 450))]);
    typing.remove();
    reply(clean === 'Size another pool' ? 'size my pool equipment' : clean);
  } catch (err) {
    typing.remove();
    botSay('Sorry, the assistant could not load. Please use the quote form or contact us directly.');
    console.error(err);
  }
}

// ------------------------------------------------------------------ open / close
function openChat() {
  panel.hidden = false;
  launcher.setAttribute('aria-expanded', 'true');
  root.classList.add('cb-open');
  if (!messages.children.length) {
    botSay("Hi! I'm the AquaFix assistant. Ask me about products or pool problems, or give me your pool size and I'll work out the filter, pump and accessories you need.",
      { quickReplies: START_REPLIES });
  }
  loadBrain().catch(() => {});
  input.focus();
}

function closeChat() {
  panel.hidden = true;
  launcher.setAttribute('aria-expanded', 'false');
  root.classList.remove('cb-open');
}

launcher.addEventListener('click', () => (panel.hidden ? openChat() : closeChat()));
root.querySelector('.cb-close').addEventListener('click', closeChat);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) closeChat(); });
form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
