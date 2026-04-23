const PMTILES_FILE    = 'municipios_nombres.pmtiles';
const ESPANA_FILE     = 'espana.geojson';
const TOP_NAMES_FILE  = 'top_nombres.json';
const NOMBRES_INDEX   = 'nombres_index.json';
const MUNICIPIOS_GEO  = 'municipios_geo.json';

/* Paleta categórica top 10 (modo normal) */
const PALETTE = [
  '#01f3b3', '#305cfa', '#eaea40', '#494949', '#ff4757',
  '#a259ff', '#ff922b', '#40c0ff', '#ff6b9d', '#82ca00',
];
const COLOR_ND    = '#d8d8d8';
const COLOR_OTHER = '#aaaaaa';

/* Paleta de ranking basada en #01f3b3 (rank 1 = más saturado) */
const RANK_COLORS = ['#004734', '#01A277', '#01f3b3', '#8AFEDF', '#B8FFEC'];
const COLOR_NOT_RANKED = '#aaaaaa';

/* Fill neutro (modo sin colores) */
const FILL_BLANK = ['case',
  ['!=', ['get', 'municipio'], ''], '#aaaaaa',
  '#d8d8d8',
];

/* ── Estado ──────────────────────────────────────────────────────────────────*/
let currentSex   = 'h';
let topNames     = { H: [], M: [] };
let nombreIndex  = { H: [], M: [] };
let municipiosGeo = [];
let searchName   = null;
let colorMode    = false;
let popup        = null;
const tooltip    = document.getElementById('map-tooltip');

/* ── Helpers ─────────────────────────────────────────────────────────────────*/
function toTitleCase(s) {
  if (!s) return '';
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function colorExpr(sex) {
  const names = topNames[sex.toUpperCase()] || [];
  const args  = names.flatMap((n, i) => [n, PALETTE[i]]);
  return ['case',
    ['==', ['get', `top_${sex}`], null], COLOR_ND,
    ['match', ['get', `top_${sex}`], ...args, COLOR_OTHER],
  ];
}

function searchColorExpr(name) {
  // Mejor rango entre H y M (el primero que coincida gana)
  return ['case',
    ['any', ['==', ['get', 'top_h_1'], name], ['==', ['get', 'top_m_1'], name]], RANK_COLORS[0],
    ['any', ['==', ['get', 'top_h_2'], name], ['==', ['get', 'top_m_2'], name]], RANK_COLORS[1],
    ['any', ['==', ['get', 'top_h_3'], name], ['==', ['get', 'top_m_3'], name]], RANK_COLORS[2],
    ['any', ['==', ['get', 'top_h_4'], name], ['==', ['get', 'top_m_4'], name]], RANK_COLORS[3],
    ['any', ['==', ['get', 'top_h_5'], name], ['==', ['get', 'top_m_5'], name]], RANK_COLORS[4],
    ['!=', ['get', 'municipio'], ''], COLOR_NOT_RANKED,
    COLOR_ND,
  ];
}

/* ── Color activo ────────────────────────────────────────────────────────────*/
function activeFill() {
  if (searchName)  return searchColorExpr(searchName);
  if (colorMode)   return colorExpr(currentSex);
  return FILL_BLANK;
}

function applyFill() {
  map.setPaintProperty('municipios-fill', 'fill-color', activeFill());
}

/* ── Leyenda ─────────────────────────────────────────────────────────────────*/
function updateLegend() {
  const container  = document.getElementById('leg-items');
  const title      = document.getElementById('leg-title');
  const ndItems    = document.querySelectorAll('.leg-nd');
  const btn        = document.getElementById('leg-toggle-btn');
  const sexToggle  = document.getElementById('leg-sex-toggle');

  if (searchName) {
    btn.style.display = 'none';
    sexToggle.classList.add('hidden');
    const entryH = nombreIndex.H.find(x => x.n === searchName);
    const entryM = nombreIndex.M.find(x => x.n === searchName);
    const munCount = Math.max(entryH?.m ?? 0, entryM?.m ?? 0);
    title.innerHTML = `${toTitleCase(searchName)}<br><span class="leg-mun-count">Top 5 en ${munCount.toLocaleString('es')} municipios</span>`;
    container.innerHTML = '';
    ndItems.forEach(el => el.style.display = 'none');
    const labels = ['1.º más común', '2.º más común', '3.º más común', '4.º más común', '5.º más común'];
    RANK_COLORS.forEach((color, i) => {
      const item = document.createElement('div');
      item.className = 'leg-item';
      item.innerHTML = `<span class="leg-swatch" style="background:${color}"></span><span class="leg-name">${labels[i]}</span>`;
      container.appendChild(item);
    });
    const nd = document.createElement('div');
    nd.className = 'leg-nd';
    nd.innerHTML = `<span class="leg-swatch" style="background:${COLOR_NOT_RANKED};border-color:#d1d5db"></span><span>No en top 5</span>`;
    container.appendChild(nd);
    return;
  }

  // modo normal
  btn.style.display = '';
  btn.textContent   = colorMode ? 'Desactivar' : 'Activar colores';
  btn.classList.toggle('active', colorMode);
  title.textContent = 'Top nombres';
  sexToggle.classList.toggle('hidden', !colorMode);

  if (!colorMode) {
    container.innerHTML = '';
    ndItems.forEach(el => el.style.display = 'none');
    return;
  }

  const names = topNames[currentSex.toUpperCase()] || [];
  container.innerHTML = '';
  ndItems.forEach(el => el.style.display = '');
  names.forEach((name, i) => {
    const item = document.createElement('div');
    item.className = 'leg-item';
    item.innerHTML = `<span class="leg-swatch" style="background:${PALETTE[i]}"></span><span class="leg-name">${toTitleCase(name)}</span>`;
    container.appendChild(item);
  });
}

function buildLegend(sex) { updateLegend(); }
function buildSearchLegend(name) { updateLegend(); }

function buildSearchLegend(name) {
  const container = document.getElementById('leg-items');
  const title     = document.getElementById('leg-title');
  title.textContent = toTitleCase(name);
  container.innerHTML = '';
  // ocultar "otros/sin datos" y reemplazar con escala de ranking
  document.querySelectorAll('.leg-nd').forEach(el => el.style.display = 'none');
  const labels = ['1.º más común', '2.º más común', '3.º más común', '4.º más común', '5.º más común'];
  RANK_COLORS.forEach((color, i) => {
    const item = document.createElement('div');
    item.className = 'leg-item';
    item.innerHTML = `
      <span class="leg-swatch" style="background:${color}"></span>
      <span class="leg-name">${labels[i]}</span>`;
    container.appendChild(item);
  });
  // No en top 5
  const nd = document.createElement('div');
  nd.className = 'leg-nd';
  nd.style.display = '';
  nd.innerHTML = `<span class="leg-swatch" style="background:${COLOR_NOT_RANKED};border-color:#d1d5db"></span><span>No en top 5</span>`;
  container.appendChild(nd);
}

/* ── Búsqueda: autocomplete ──────────────────────────────────────────────────*/
let allNames = [];   // lista combinada H+M sin duplicados

function buildAllNames() {
  const seen  = new Set();
  const freqs = {};
  for (const sex of ['H', 'M']) {
    for (const { n, f } of (nombreIndex[sex] || [])) {
      freqs[n] = Math.max(freqs[n] || 0, f);
      seen.add(n);
    }
  }
  allNames = [...seen].sort((a, b) => (freqs[b] || 0) - (freqs[a] || 0));
}

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

function suggestMunicipios(q) {
  if (!q) return [];
  const norm   = stripAccents(q.trim());
  const normMuns = municipiosGeo.map(m => stripAccents(m.n));
  const prefix   = municipiosGeo.filter((_, i) => normMuns[i].startsWith(norm));
  const contains = municipiosGeo.filter((_, i) => !normMuns[i].startsWith(norm) && normMuns[i].includes(norm));
  return [...prefix, ...contains].slice(0, 5);
}

function suggestNames(q) {
  if (!q) return [];
  const norm = stripAccents(q.trim());
  const normNames = allNames.map(n => stripAccents(n));
  const prefix   = allNames.filter((_, i) => normNames[i].startsWith(norm));
  const contains = allNames.filter((_, i) => !normNames[i].startsWith(norm) && normNames[i].includes(norm));
  return [...prefix, ...contains].slice(0, 8);
}

function highlightMatch(text, q) {
  const normText = stripAccents(text);
  const normQ    = stripAccents(q.trim());
  const idx      = normText.indexOf(normQ);
  if (idx === -1) return text;
  return text.substring(0, idx) +
    `<strong>${text.substring(idx, idx + q.length)}</strong>` +
    text.substring(idx + q.length);
}

function renderDropdown(q) {
  const dd    = document.getElementById('search-dropdown');
  const names = suggestNames(q);
  const muns  = suggestMunicipios(q);
  if (!names.length && !muns.length) { dd.classList.add('hidden'); return; }

  let html = '';

  if (names.length) {
    html += `<div class="dd-section">Nombres</div>`;
    html += names.map(name => {
      const inH  = nombreIndex.H.some(x => x.n === name);
      const inM  = nombreIndex.M.some(x => x.n === name);
      const badge = inH && inM ? 'H · M' : inH ? 'H' : 'M';
      return `<div class="dd-item" data-type="nombre" data-name="${name}">
        <span class="dd-match">${highlightMatch(name, q)}</span>
        <span class="dd-badge">${badge}</span>
      </div>`;
    }).join('');
  }

  if (muns.length) {
    html += `<div class="dd-section">Municipios</div>`;
    html += muns.map(m => `
      <div class="dd-item" data-type="municipio" data-lat="${m.lat}" data-lng="${m.lng}" data-name="${m.n}">
        <span class="dd-match">${highlightMatch(m.n.toUpperCase(), q)}</span>
        <span class="dd-prov">${m.p}</span>
      </div>`).join('');
  }

  dd.innerHTML = html;
  dd.classList.remove('hidden');

  dd.querySelectorAll('.dd-item').forEach(el => {
    el.addEventListener('mousedown', e => {
      e.preventDefault();
      if (el.dataset.type === 'nombre') {
        applySearch(el.dataset.name);
      } else {
        flyToMunicipio(el.dataset.name, +el.dataset.lat, +el.dataset.lng);
      }
    });
  });
}

function flyToMunicipio(name, lat, lng) {
  document.getElementById('search-input').value = name;
  document.getElementById('search-dropdown').classList.add('hidden');
  document.getElementById('search-clear').classList.remove('hidden');
  if (!colorMode) {
    colorMode = true;
    applyFill();
    updateLegend();
  }
  map.flyTo({ center: [lng, lat], zoom: 11, duration: 1000 });
}

function applySearch(name) {
  searchName = name;
  document.getElementById('search-input').value = toTitleCase(name);
  document.getElementById('search-dropdown').classList.add('hidden');
  document.getElementById('search-clear').classList.remove('hidden');
  applyFill();
  updateLegend();
  if (popup?.isOpen()) popup.remove();
  tooltip.classList.remove('visible');
}

function clearSearch() {
  searchName = null;
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').classList.add('hidden');
  document.getElementById('search-dropdown').classList.add('hidden');
  applyFill();
  updateLegend();
}

/* ── Mapa ────────────────────────────────────────────────────────────────────*/
const map = new maplibregl.Map({
  container: 'map',
  style: { version: 8, sources: {}, layers: [] },
  center: [-5.5, 36.5],
  zoom: 4.4,
  minZoom: 2,
  maxBounds: [[-35, 20], [20, 56]],
  antialias: true,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

map.on('load', async () => {

  const [espana, topNamesData, indexData, geoData] = await Promise.all([
    fetch(ESPANA_FILE).then(r => r.json()),
    fetch(TOP_NAMES_FILE).then(r => r.json()),
    fetch(NOMBRES_INDEX).then(r => r.json()),
    fetch(MUNICIPIOS_GEO).then(r => r.json()),
  ]);
  topNames      = topNamesData;
  nombreIndex   = indexData;
  municipiosGeo = geoData;
  buildAllNames();

  /* Basemap */
  map.addSource('basemap', {
    type: 'raster',
    tiles: ['https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}{r}.png'],
    tileSize: 256,
    attribution: '&copy; OSM &copy; CARTO',
  });
  map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap',
    paint: { 'raster-opacity': 1 } });

  /* PMTiles */
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol));

  map.addSource('municipios', {
    type: 'vector',
    url: `pmtiles://${PMTILES_FILE}`,
  });

  map.addLayer({
    id: 'municipios-fill',
    type: 'fill',
    source: 'municipios',
    'source-layer': 'municipios',
    paint: {
      'fill-color': FILL_BLANK,
      'fill-opacity': 0.82,
    },
  });

  map.addLayer({
    id: 'municipios-line',
    type: 'line',
    source: 'municipios',
    'source-layer': 'municipios',
    paint: {
      'line-color': 'rgba(0,0,0,0.12)',
      'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.2, 9, 0.8, 11, 1.2],
    },
  });

  /* Frontera España */
  map.addSource('espana', { type: 'geojson', data: espana });
  map.addLayer({
    id: 'espana-border',
    type: 'line',
    source: 'espana',
    paint: { 'line-color': '#374151', 'line-width': 1.5, 'line-opacity': 0.7 },
  });

  updateLegend();

  /* ── Botón activar colores ── */
  document.getElementById('leg-toggle-btn').addEventListener('click', () => {
    colorMode = !colorMode;
    applyFill();
    updateLegend();
  });

  /* ── Interacciones mapa ── */

  function hasDatos(p) {
    return p && p.municipio && (p.top_h || p.top_m);
  }

  map.on('mousemove', 'municipios-fill', e => {
    const p = e.features?.[0]?.properties;
    if (!p || !p.municipio) {
      map.getCanvas().style.cursor = '';
      tooltip.classList.remove('visible');
      return;
    }
    map.getCanvas().style.cursor = hasDatos(p) ? 'pointer' : '';
    let label;
    if (searchName && hasDatos(p)) {
      const rankH = [1,2,3,4,5].find(i => p[`top_h_${i}`] === searchName);
      const rankM = [1,2,3,4,5].find(i => p[`top_m_${i}`] === searchName);
      const best  = rankH && rankM ? Math.min(rankH, rankM) : (rankH ?? rankM);
      label = best
        ? `${p.municipio} — ${toTitleCase(searchName)} (nº${best})`
        : `${p.municipio} — no en top 5`;
    } else {
      label = p.municipio;
    }
    tooltip.textContent = label;
    tooltip.style.left = (e.originalEvent.clientX + 14) + 'px';
    tooltip.style.top  = (e.originalEvent.clientY - 36) + 'px';
    tooltip.classList.add('visible');
  });

  map.on('mouseleave', 'municipios-fill', () => {
    map.getCanvas().style.cursor = '';
    tooltip.classList.remove('visible');
  });

  map.on('click', 'municipios-fill', e => {
    const p = e.features?.[0]?.properties;
    if (!hasDatos(p)) return;

    const names    = topNames[(currentSex === 'h' ? 'H' : 'M')] || [];
    const topCurr  = p[`top_${currentSex}`];
    const idx      = names.indexOf(topCurr);
    let barColor;
    if (searchName) {
      const rank = [1,2,3,4,5].find(i => p[`top_${currentSex}_${i}`] === searchName);
      barColor = rank ? RANK_COLORS[rank - 1] : COLOR_NOT_RANKED;
    } else {
      barColor = idx >= 0 ? PALETTE[idx] : COLOR_OTHER;
    }

    function rankRows(sex) {
      const rows = [];
      for (let i = 1; i <= 5; i++) {
        const nombre = p[`top_${sex}_${i}`];
        const freq   = p[`freq_${sex}_${i}`];
        if (!nombre) break;
        const highlight = searchName && nombre === searchName ? ' class="pp-rank-highlight"' : '';
        rows.push(`<tr${highlight}>
          <td class="pp-rank">${i}</td>
          <td class="pp-rank-name">${toTitleCase(nombre)}</td>
          <td class="pp-rank-freq">${(+freq).toLocaleString('es')}</td>
        </tr>`);
      }
      return rows.join('');
    }

    const html = `
      <div>
        <div class="pp-top-bar" style="background:${barColor}"></div>
        <div class="pp-inner">
          <p class="pp-nombre">${p.municipio}</p>
          <p class="pp-provincia">${p.provincia || ''}</p>
          <div class="pp-tables">
            <div class="pp-table-block">
              <div class="pp-table-title">♂ Hombres</div>
              <table class="pp-table">${rankRows('h')}</table>
            </div>
            <div class="pp-table-block">
              <div class="pp-table-title">♀ Mujeres</div>
              <table class="pp-table">${rankRows('m')}</table>
            </div>
          </div>
        </div>
      </div>`;

    if (!popup) {
      popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 8, maxWidth: '260px' });
    }
    popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
  });

  map.on('click', e => {
    const feats = map.queryRenderedFeatures(e.point, { layers: ['municipios-fill'] });
    if (!feats.length && popup?.isOpen()) popup.remove();
  });

  /* ── Toggle H/M (dentro de la leyenda) ── */
  document.getElementById('leg-sex-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.pill-sex');
    if (!btn) return;
    document.querySelectorAll('.pill-sex').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSex = btn.dataset.sex;
    applyFill();
    updateLegend();
    if (popup?.isOpen()) popup.remove();
    tooltip.classList.remove('visible');
  });

  /* ── Search input ── */
  const input   = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) { document.getElementById('search-dropdown').classList.add('hidden'); return; }
    renderDropdown(q);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q     = input.value.trim();
      const names = suggestNames(q);
      const muns  = suggestMunicipios(q);
      if (names.length)      applySearch(names[0]);
      else if (muns.length)  flyToMunicipio(muns[0].n, muns[0].lat, muns[0].lng);
      e.preventDefault();
    }
    if (e.key === 'Escape') { clearSearch(); input.blur(); }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => document.getElementById('search-dropdown').classList.add('hidden'), 150);
  });

  clearBtn.addEventListener('click', clearSearch);

});
