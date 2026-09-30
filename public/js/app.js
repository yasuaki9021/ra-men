import { LEVELS, blendWithVotes, levelOf } from './scoring.js';

const config = window.NIBOSHI_CONFIG ?? {};
const VOTES_KEY = 'niboshi-votes-v1';
const TOKYO_CENTER = { lat: 35.69, lng: 139.65 };

const $ = (id) => document.getElementById(id);
const state = { shops: [], selectedId: null, votes: loadVotes() };

// ---------- ユーザー投票 (この端末のみ) ----------
function loadVotes() {
  try {
    return JSON.parse(localStorage.getItem(VOTES_KEY)) ?? {};
  } catch {
    return {};
  }
}
function saveVotes() {
  try {
    localStorage.setItem(VOTES_KEY, JSON.stringify(state.votes));
  } catch {
    /* プライベートモード等では保存しない */
  }
}

/** 投票を反映した表示用スコア */
function displayScore(shop) {
  const v = state.votes[shop.id];
  return v ? blendWithVotes(shop.score, shop.docs, [v]) : shop.score;
}

// ---------- 絞り込み ----------
function filtered() {
  const q = $('q').value.trim().toLowerCase();
  const area = $('area').value;
  const lo = Math.min(+$('min').value, +$('max').value);
  const hi = Math.max(+$('min').value, +$('max').value);
  $('range-out').textContent = `${lo}〜${hi}`;
  const list = state.shops.filter((s) => {
    const score = displayScore(s);
    if (score < lo || score > hi) return false;
    if (area && s.area !== area) return false;
    if (q && !`${s.name} ${s.area} ${s.address}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const sorters = {
    'score-desc': (a, b) => displayScore(b) - displayScore(a),
    'score-asc': (a, b) => displayScore(a) - displayScore(b),
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    docs: (a, b) => b.docs - a.docs,
  };
  return list.sort(sorters[$('sort').value]);
}

// ---------- 一覧 ----------
function renderList(list) {
  $('count').textContent = `${list.length} 店 / 全 ${state.shops.length} 店`;
  const tpl = $('shop-tpl');
  const ul = $('shops');
  ul.replaceChildren(
    ...list.map((shop) => {
      const el = tpl.content.firstElementChild.cloneNode(true);
      const score = displayScore(shop);
      const lv = levelOf(score);
      el.dataset.id = shop.id;
      el.classList.toggle('active', shop.id === state.selectedId);

      const chip = el.querySelector('.level-chip');
      chip.textContent = `Lv${lv.level} ${lv.label}`;
      chip.style.background = lv.color;
      el.querySelector('.shop-name').textContent = shop.name;

      const meta = [shop.area, shop.style && `スタイル: ${shop.style}`];
      if (shop.rating) meta.push(`Google ★${shop.rating} (${shop.ratingCount})`);
      el.querySelector('.shop-meta').textContent = meta.filter(Boolean).join(' ・ ');
      if (!shop.verified) {
        const warn = document.createElement('span');
        warn.className = 'warn';
        warn.textContent = ' ・ 位置要確認';
        el.querySelector('.shop-meta').append(warn);
      }

      const gauge = el.querySelector('.gauge');
      gauge.setAttribute('aria-valuenow', String(score));
      gauge.querySelector('span').style.left = `${score}%`;
      el.querySelector('.score').textContent = score;
      const src = Object.entries(shop.sourceDocs ?? {})
        .filter(([, n]) => n)
        .map(([k, n]) => `${{ google: 'Google', x: 'X', notes: 'メモ' }[k] ?? k} ${n}`)
        .join(' / ');
      el.querySelector('.conf').textContent = src
        ? `根拠 ${src} 件 ・ 信頼度 ${Math.round(shop.confidence * 100)}%`
        : 'スタイルからの推定';

      el.querySelector('.keywords').replaceChildren(
        ...shop.keywords.map((k) => Object.assign(document.createElement('li'), { textContent: k })),
      );

      const vote = el.querySelector('.vote');
      for (let v = 1; v <= 5; v++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = v;
        b.title = `濃度 ${v} (${LEVELS[v - 1].label})`;
        b.setAttribute('aria-pressed', String(state.votes[shop.id] === v));
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (state.votes[shop.id] === v) delete state.votes[shop.id];
          else state.votes[shop.id] = v;
          saveVotes();
          render();
        });
        vote.append(b);
      }

      const links = el.querySelector('.links');
      links.append(link('Google マップ', shop.mapsUrl));
      if (shop.website) links.append(link('公式サイト', shop.website));

      el.addEventListener('click', () => select(shop.id, { pan: true }));
      return el;
    }),
  );
}

function link(text, href) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  a.target = '_blank';
  a.rel = 'noopener';
  a.addEventListener('click', (e) => e.stopPropagation());
  return a;
}

function select(id, { pan = false, scroll = false } = {}) {
  state.selectedId = id;
  document.querySelectorAll('.shop').forEach((el) => el.classList.toggle('active', el.dataset.id === id));
  const shop = state.shops.find((s) => s.id === id);
  if (shop) map.focus(shop, pan);
  if (scroll) document.querySelector(`.shop[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ---------- 地図 ----------
/** Maps JavaScript API キーがあればマーカー付き地図、無ければキー不要の埋め込み地図 */
const map = config.googleMapsApiKey ? googleMap() : embedMap();

function embedMap() {
  const note = $('map-note');
  note.hidden = false;
  note.textContent = 'Maps API キー未設定のため簡易表示中です。店をクリックすると地図が移動します。';
  const iframe = document.createElement('iframe');
  iframe.loading = 'lazy';
  iframe.referrerPolicy = 'no-referrer-when-downgrade';
  iframe.title = '地図';
  const show = (q, z) => {
    iframe.src = `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${z}&hl=ja&output=embed`;
  };
  show('煮干しラーメン 東京都', 11);
  $('map').append(iframe);
  return {
    update() {},
    focus(shop) {
      show(shop.verified ? `${shop.name} ${shop.address}` : `${shop.lat},${shop.lng}`, 16);
    },
  };
}

function googleMap() {
  let gmap, info, AdvancedMarkerElement, PinElement;
  const markers = new Map();
  let pending = [];

  const ready = new Promise((resolve, reject) => {
    window.__initNiboshiMap = resolve;
    const s = document.createElement('script');
    const params = new URLSearchParams({
      key: config.googleMapsApiKey,
      v: 'weekly',
      language: 'ja',
      region: 'JP',
      loading: 'async',
      libraries: 'marker',
      callback: '__initNiboshiMap',
    });
    s.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    s.async = true;
    s.onerror = reject;
    document.head.append(s);
  }).then(async () => {
    ({ AdvancedMarkerElement, PinElement } = await google.maps.importLibrary('marker'));
    gmap = new google.maps.Map($('map'), {
      center: TOKYO_CENTER,
      zoom: 11,
      mapId: config.googleMapsMapId,
      mapTypeControl: false,
      streetViewControl: false,
    });
    info = new google.maps.InfoWindow();
  });
  ready.catch(() => {
    $('map-note').hidden = false;
    $('map-note').textContent = 'Google マップの読み込みに失敗しました。API キーとリファラ制限を確認してください。';
  });

  function draw(list) {
    const visible = new Set(list.map((s) => s.id));
    for (const [id, m] of markers) m.map = visible.has(id) ? gmap : null;
    for (const shop of list) {
      const lv = levelOf(displayScore(shop));
      const pin = new PinElement({
        background: lv.color,
        borderColor: '#2b2118',
        glyphColor: '#fff',
        glyph: String(lv.level),
        scale: shop.id === state.selectedId ? 1.3 : 1,
      });
      let m = markers.get(shop.id);
      if (!m) {
        m = new AdvancedMarkerElement({ position: { lat: shop.lat, lng: shop.lng }, title: shop.name });
        m.addListener('click', () => select(shop.id, { scroll: true }));
        markers.set(shop.id, m);
      }
      m.content = pin.element;
      m.zIndex = displayScore(shop);
      m.map = gmap;
    }
  }

  function openInfo(shop) {
    const lv = levelOf(displayScore(shop));
    const div = document.createElement('div');
    div.style.color = '#2b2118';
    const h = document.createElement('strong');
    h.textContent = shop.name;
    const p = document.createElement('div');
    p.textContent = `濃度 ${displayScore(shop)} (Lv${lv.level} ${lv.label})`;
    div.append(h, p, link('Google マップで開く', shop.mapsUrl));
    info.setContent(div);
    info.open({ map: gmap, anchor: markers.get(shop.id) });
  }

  return {
    update(list) {
      pending = list;
      ready.then(() => draw(pending));
    },
    focus(shop, pan) {
      ready.then(() => {
        draw(pending);
        if (pan) {
          gmap.panTo({ lat: shop.lat, lng: shop.lng });
          if (gmap.getZoom() < 14) gmap.setZoom(14);
        }
        openInfo(shop);
      });
    },
  };
}

// ---------- 起動 ----------
function render() {
  const list = filtered();
  renderList(list);
  map.update(list);
}

async function main() {
  $('legend').replaceChildren(
    ...LEVELS.map((lv) => {
      const li = document.createElement('li');
      const dot = document.createElement('i');
      dot.style.background = lv.color;
      li.append(dot, `${lv.level} ${lv.label}`);
      return li;
    }),
  );

  const res = await fetch('data/shops.json', { cache: 'no-cache' });
  const data = await res.json();
  state.shops = data.shops;
  $('updated').textContent = `データ更新: ${new Date(data.generatedAt).toLocaleString('ja-JP')}`;

  const areas = [...new Set(state.shops.map((s) => s.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
  $('area').append(...areas.map((a) => new Option(a, a)));

  for (const id of ['q', 'area', 'min', 'max', 'sort']) $(id).addEventListener('input', render);
  render();
}

main().catch((err) => {
  console.error(err);
  $('count').textContent = 'データの読み込みに失敗しました';
});
