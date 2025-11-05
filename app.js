// app.js
import { DECK } from './tarotDeck.js';

let LAST_DRAW = null; // { question, spreadKey, spreadLabel, positions, cards:[{id,name,img,orientation,position}] }

/**
 * Spreads (add more if you like)
 */
const SPREADS = {
  single: {
    label: 'Single Card',
    positions: ['Insight'],
  },
  three: {
    label: 'Three Card',
    positions: ['Past', 'Present', 'Future'],
  },
  celtic: {
    label: 'Celtic Cross (10)',
    positions: [
      'Present',
      'Challenge',
      'Past',
      'Future',
      'Above (Conscious)',
      'Below (Subconscious)',
      'Advice',
      'External Influences',
      'Hopes & Fears',
      'Outcome'
    ],
  },
  horseshoe: {
    label: 'Horseshoe (7)',
    positions: [
      'Recent Past',
      'Present',
      'Near Future',
      'Questions / Goals',
      'Your Perspective',
      'Other's Perspective',
      'Outcome'
    ],
  },
};

// --- Section loader (like Shopify sections) ---
async function loadSections() {
  const sectionFiles = [
    'header',
    'question',
    'controls',
    'reading',
    'interpretation',
    'footer'
  ];

  const app = document.getElementById('app');
  for (const name of sectionFiles) {
    const html = await fetch(`./sections/${name}.html`).then(r => r.text());
    const wrapper = document.createElement('div');
    wrapper.className = 'section';
    wrapper.innerHTML = html;
    app.appendChild(wrapper);
  }
}

/** Cryptographically-strong random integer in [0, max) */
function cryptoRandInt(max) {
  if (!Number.isInteger(max) || max <= 0) throw new Error('cryptoRandInt: invalid max');
  const arr = new Uint32Array(1);
  let x;
  do {
    crypto.getRandomValues(arr);
    x = arr[0] & 0x7fffffff; // non-negative
  } while (x > Math.floor(0x7fffffff / max) * max); // avoid modulo bias
  return x % max;
}

/** Fisher–Yates shuffle using crypto randomness (in-place) */
function shuffleCrypto(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = cryptoRandInt(i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/** Pick N unique cards from deck, no repeats */
function drawUnique(deck, count) {
  if (count > deck.length) throw new Error('Not enough cards in deck');
  const indices = Array.from(deck.keys());
  shuffleCrypto(indices);
  return indices.slice(0, count).map(i => deck[i]);
}

/** 50/50 orientation */
function randomOrientation() {
  return cryptoRandInt(2) === 1 ? 'reversed' : 'upright';
}

/** Render a reading into #readingGrid */
function renderReading({ cards, positions }) {
  const grid = document.getElementById('readingGrid');
  if (!grid) {
    console.error('readingGrid not found');
    return;
  }
  grid.innerHTML = '';

  const tpl = document.getElementById('card-template');
  if (!tpl) {
    console.error('card-template not found');
    return;
  }

  cards.forEach((card, idx) => {
    const clone = tpl.content.cloneNode(true);
    const root = clone.querySelector('.card');
    const img = clone.querySelector('.card__img');
    const posEl = clone.querySelector('.card__position');
    const titleEl = clone.querySelector('.card__title');

    if (card.orientation === 'reversed') root.classList.add('reversed');

    if (posEl) posEl.textContent = positions[idx] || `Card ${idx + 1}`;
    if (titleEl) titleEl.textContent = card.name;

    if (img) {
      img.src = card.img;
      img.alt = card.name;
    }

    grid.appendChild(clone);
  });
}

/** Hook up question/spread/draw controls */
function initUI() {
  const spreadSelect = document.getElementById('spreadSelect');
  if (!spreadSelect) {
    console.error('spreadSelect not found. Did sections load?');
    return;
  }

  // Populate spreads
  Object.entries(SPREADS).forEach(([key, meta]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = meta.label;
    spreadSelect.appendChild(opt);
  });

  // Draw button
  const btn = document.getElementById('drawBtn');
  if (!btn) {
    console.error('drawBtn not found.');
    return;
  }

  btn.addEventListener('click', () => {
    btn.disabled = true;
    try {
      const question = (document.getElementById('questionInput')?.value || '').trim();
      const spreadKey = spreadSelect.value || 'single';
      const { positions } = SPREADS[spreadKey];

      const drawn = drawUnique(DECK, positions.length).map((c, i) => ({
        ...c,
        orientation: randomOrientation(),
        position: positions[i]
      }));

      renderReading({ cards: drawn, positions });

      LAST_DRAW = {
        question,
        spreadKey,
        spreadLabel: SPREADS[spreadKey].label,
        positions: [...positions],
        cards: drawn.map(({ id, name, img, orientation, position }) => ({ id, name, img, orientation, position }))
      };

      console.log('LAST_DRAW payload:', LAST_DRAW); // helpful for debugging

      const qOut = document.getElementById('questionEcho');
      if (qOut) qOut.textContent = question ? `Q: ${question}` : '';
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

/** Wire up the Interpretation button (calls /api/interpret) */
function initInterpretation() {
  const btn = document.getElementById('interpretBtn');
  const out = document.getElementById('interpretOut');
  const status = document.getElementById('interpretStatus');
  if (!btn) {
    console.warn('interpretBtn not found (maybe interpretation section not loaded yet).');
    return;
  }

  btn.addEventListener('click', async () => {
    if (!LAST_DRAW || !LAST_DRAW.cards?.length) {
      alert('Draw cards first.');
      return;
    }
    btn.disabled = true;
    if (status) status.textContent = 'Asking the oracle...';
    if (out) out.value = '';

    try {
      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(LAST_DRAW)
      });

      // Try to parse JSON even on non-200
      let data = {};
      try { data = await res.json(); } catch (_) { /* ignore */ }

      if (!res.ok) {
        if (out) out.value = `⚠️ Server error ${res.status}: ${data?.error || 'Unknown error'}`;
        if (status) status.textContent = 'Error';
        return;
      }

      if (data?.error) {
        if (out) out.value = `⚠️ ${data.error}`;
        if (status) status.textContent = 'Error';
        return;
      }

      const text = data?.text;
      if (out) out.value = (typeof text === 'string' && text.trim().length > 0)
        ? text
        : '⚠️ Empty response from API.';
      if (status) status.textContent = 'Done';
    } catch (e) {
      if (out) out.value = `⚠️ ${e.message || String(e)}`;
      if (status) status.textContent = 'Error';
    } finally {
      btn.disabled = false;
      setTimeout(() => { if (status) status.textContent = ''; }, 1500);
    }
  });
}

// Boot
(async function main(){
  try {
    await loadSections();    // injects the HTML sections
    initUI();                // now the DOM elements exist
    initInterpretation();    // wire the interpretation controls
  } catch (e) {
    console.error('Boot error:', e);
  }
})();
