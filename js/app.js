/* Atlas — Country Explorer
   Data: REST Countries v3.1 (no API key needed). */
const API = 'https://restcountries.com/v3.1';
const PAGE = 24;
const REGIONS = ['All', 'Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];

const $ = (id) => document.getElementById(id);
const grid = $('grid'), stateBox = $('state'), moreBtn = $('more');
const info = $('result-info'), dialog = $('detail'), body = $('detail-body');

let all = [], byCode = {}, view = [], shown = 0;
let region = 'All', query = '', sort = 'name';

const nf = new Intl.NumberFormat('en');
const fmt = (n) => (n == null ? '—' : nf.format(n));
const list = (v) => (Array.isArray(v) && v.length ? v.join(', ') : '—');

/* Safe element builder (avoids injecting API text as HTML) */
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  kids.flat().forEach((c) => c != null && n.append(c));
  return n;
}

/* ---------- Loading ---------- */
function skeletons() {
  grid.replaceChildren(...Array.from({ length: 8 }, () => el('div', { class: 'skeleton' })));
}

function showState(title, text, retry) {
  stateBox.classList.remove('hidden');
  stateBox.replaceChildren(
    el('h2', { class: 'font-display font-bold text-2xl', text: title }),
    el('p', { class: 'mt-2 text-ink/60', text }),
    retry ? el('button', { class: 'mt-5 h-11 px-5 rounded-xl bg-sea text-white font-medium hover:bg-seaDark', text: 'Try again', onclick: retry }) : ''
  );
}

async function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

let offline = false;
const local = {};

async function load() {
  stateBox.classList.add('hidden');
  skeletons();
  offline = false;
  try {
    const fields = 'cca3,name,flags,capital,population,region,subregion,area,borders,languages';
    all = await fetchWithTimeout(`${API}/all?fields=${fields}`);
  } catch (e) {
    // API unreachable: use the data bundled with the site
    if (window.COUNTRIES_FALLBACK && window.COUNTRIES_FALLBACK.length) {
      all = window.COUNTRIES_FALLBACK;
      offline = true;
    } else {
      grid.replaceChildren();
      showState('Could not load countries', 'Check your internet connection and try again.', load);
      return;
    }
  }
  (window.COUNTRIES_FALLBACK || []).forEach((c) => (local[c.cca3] = c));
  all.forEach((c) => (byCode[c.cca3] = c));
  $('total-count').textContent = offline ? `${all.length} countries (saved data)` : `${all.length} countries`;
  buildRegions();
  apply();
}

/* ---------- Filters ---------- */
function buildRegions() {
  $('regions').replaceChildren(...REGIONS.map((r) =>
    el('button', { class: 'chip', 'aria-pressed': String(r === region), text: r, onclick: () => {
      region = r;
      [...$('regions').children].forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === r)));
      apply();
    } })
  ));
}

function apply() {
  const q = query.trim().toLowerCase();
  view = all.filter((c) => {
    if (region !== 'All' && c.region !== region) return false;
    if (!q) return true;
    return c.name.common.toLowerCase().includes(q) ||
           c.name.official.toLowerCase().includes(q) ||
           (c.capital || []).some((x) => x.toLowerCase().includes(q));
  });
  const sorters = {
    'name': (a, b) => a.name.common.localeCompare(b.name.common),
    'pop-desc': (a, b) => b.population - a.population,
    'pop-asc': (a, b) => a.population - b.population,
    'area-desc': (a, b) => (b.area || 0) - (a.area || 0)
  };
  view.sort(sorters[sort]);
  shown = 0;
  grid.replaceChildren();
  stateBox.classList.add('hidden');
  if (!view.length) {
    info.textContent = '';
    showState('No countries found', 'Try a different spelling or choose another region.');
    moreBtn.classList.add('hidden');
    return;
  }
  renderMore();
}

function renderMore() {
  const next = view.slice(shown, shown + PAGE);
  grid.append(...next.map(card));
  shown += next.length;
  info.textContent = `Showing ${shown} of ${view.length} ${view.length === 1 ? 'country' : 'countries'}`;
  moreBtn.classList.toggle('hidden', shown >= view.length);
}

/* ---------- Card ---------- */
function stat(label, value) {
  return el('div', { class: 'flex justify-between gap-3 text-sm' },
    el('span', { class: 'text-ink/55', text: label }),
    el('span', { class: 'font-medium text-right', text: value }));
}

function card(c) {
  return el('button', { class: 'card', onclick: () => openDetail(c.cca3), 'aria-label': `View details for ${c.name.common}` },
    el('img', { class: 'flag', src: c.flags.svg || c.flags.png, alt: c.flags.alt || `Flag of ${c.name.common}`, loading: 'lazy' }),
    el('div', { class: 'p-4' },
      el('h3', { class: 'font-display font-bold text-lg leading-tight', text: c.name.common }),
      el('div', { class: 'mt-3 space-y-1.5' },
        stat('Capital', list(c.capital)),
        stat('Population', fmt(c.population)),
        stat('Region', c.region || '—'))));
}

/* ---------- Detail ---------- */
function fact(label, value) {
  return el('div', { class: 'fact' }, el('dt', { text: label }), el('dd', { text: value }));
}

async function openDetail(code) {
  const base = byCode[code];
  body.replaceChildren(el('div', { class: 'p-10 text-center text-ink/60', text: 'Loading…' }));
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  try {
    if (offline) throw new Error('offline');
    const [c] = await fetchWithTimeout(`${API}/alpha/${code}`);
    renderDetail(c);
  } catch (e) {
    if (local[code]) { renderDetail(local[code]); return; }
    body.replaceChildren(el('div', { class: 'p-10 text-center' },
      el('p', { class: 'font-semibold', text: `Could not load ${base ? base.name.common : 'this country'}.` }),
      el('button', { class: 'mt-4 h-11 px-5 rounded-xl bg-sea text-white', text: 'Try again', onclick: () => openDetail(code) })));
  }
}

function renderDetail(c) {
  const currencies = c.currencies ? Object.values(c.currencies).map((x) => `${x.name} (${x.symbol || '—'})`) : [];
  const languages = c.languages ? Object.values(c.languages) : [];
  const calling = c.idd && c.idd.root ? c.idd.root + (c.idd.suffixes && c.idd.suffixes.length === 1 ? c.idd.suffixes[0] : '') : '—';
  const borders = (c.borders || []).map((b) => byCode[b]).filter(Boolean);

  body.replaceChildren(
    el('img', { src: c.flags.svg || c.flags.png, alt: c.flags.alt || `Flag of ${c.name.common}`, class: 'w-full h-48 sm:h-64 object-cover bg-mist' }),
    el('div', { class: 'p-5 sm:p-8' },
      el('h2', { id: 'd-name', class: 'font-display font-extrabold text-3xl sm:text-4xl tracking-tight', text: `${c.flag || ''} ${c.name.common}`.trim() }),
      el('p', { class: 'mt-1 text-ink/60', text: c.name.official }),

      el('dl', { class: 'mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3' },
        fact('Capital', list(c.capital)),
        fact('Region', c.region || '—'),
        fact('Subregion', c.subregion || '—'),
        fact('Population', fmt(c.population)),
        fact('Area', c.area ? `${fmt(c.area)} km²` : '—'),
        fact('Currency', list(currencies)),
        fact('Languages', list(languages)),
        fact('Time zones', list(c.timezones)),
        fact('Calling code', calling),
        fact('Domain', list(c.tld)),
        fact('Driving side', c.car && c.car.side ? c.car.side[0].toUpperCase() + c.car.side.slice(1) : '—'),
        fact('UN member', c.unMember ? 'Yes' : 'No')),

      el('h3', { class: 'mt-8 font-display font-bold text-lg', text: 'Bordering countries' }),
      borders.length
        ? el('div', { class: 'mt-3 flex flex-wrap gap-2' }, borders.map((b) =>
            el('button', { class: 'border-btn', text: b.name.common, onclick: () => openDetail(b.cca3) })))
        : el('p', { class: 'mt-2 text-ink/60 text-sm', text: 'No land borders.' }),

      c.maps && c.maps.googleMaps
        ? el('a', { href: c.maps.googleMaps, target: '_blank', rel: 'noopener',
            class: 'mt-8 inline-flex items-center h-12 px-6 rounded-xl bg-sea text-white font-medium hover:bg-seaDark', text: 'Open in Google Maps' })
        : ''));
}

/* ---------- Events ---------- */
let t;
$('search').addEventListener('input', (e) => {
  clearTimeout(t);
  t = setTimeout(() => { query = e.target.value; apply(); }, 150);
});
$('sort').addEventListener('change', (e) => { sort = e.target.value; apply(); });
moreBtn.addEventListener('click', renderMore);
$('close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

load();
