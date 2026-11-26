(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var SVG = 'http://www.w3.org/2000/svg';
  var PRE_SORTS = { rank: 1, name: 1, tvl: -1, growth: -1, age: -1, implied: -1, range: -1 };
  var LIVE_SORTS = { name: 1, tvl: -1, growth: -1, mcap: -1, ratio: -1 };
  var VERDICTS = ['Strong net', 'Good net', 'Fair net', 'Thin net'];
  var st = { q: '', category: 'all', chain: 'all', origin: 'all', verdict: 'all', tab: 'pre', sort: 'rank', dir: 1, selected: null };
  var refs = {}, scSt = null;

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) { return (d === null || d === undefined) ? 'unknown' : d >= 365 ? (d / 365).toFixed(1) + 'y' : Math.max(0, Math.round(d)) + 'd'; }
  function fmtChains(c) { return (!c || !c.length) ? 'unnamed chain' : c.length > 2 ? c.slice(0, 2).join(', ') + ' +' + (c.length - 2) : c.join(', '); }
  function fmtTick(t) { var v = Math.pow(10, t); return v >= 1e9 ? '$' + Math.round(v / 1e9) + 'B' : v >= 1e6 ? '$' + Math.round(v / 1e6) + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : '$' + Math.round(v); }
  function oneInN(s) { if (!(s > 0) || !isFinite(s)) return '1 in 1'; var n = Math.round(1 / s); return n >= 1e6 ? '1 in ' + (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? '1 in ' + Math.round(n / 1e3) + 'K' : '1 in ' + n; }
  function vCls(v) { return v === 'Strong net' ? 'v-strong' : v === 'Good net' ? 'v-good' : v === 'Fair net' ? 'v-fair' : 'v-thin'; }

  function impliedOf(row, model) {
    function round4(n) { return Math.round(n * 1e4) / 1e4; }
    var growthMult = round4(1 + (row.growth_relative_pct / 100) * model.growth_weight);
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = round4(model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range);
    var extra = Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_max_extra);
    var breadth = round4(1 + extra * model.breadth_per_chain);
    return Math.max(1, Math.round(row.tvl_usd * row.fitted_multiple * growthMult * maturity * breadth));
  }

  function catFitFor(cat) {
    var out = null;
    (DATA.fit.categories || []).forEach(function (c) { if (c.category === cat) out = c; });
    return out;
  }

  function mk(ns, tag, attrs, args, start) {
    var n = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : String(v));
    });
    for (var i = start; i < args.length; i++) {
      var c = args[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) n.appendChild(x); });
      else if (typeof c === 'string') n.appendChild(document.createTextNode(c));
      else n.appendChild(c);
    }
    return n;
  }
  function el(t, a) { return mk(null, t, a, arguments, 2); }
  function svgEl(t, a) { return mk(SVG, t, a, arguments, 2); }
  function opt(v, tx) { return el('option', { value: v, text: tx }); }
  function kvDiv(cls, k, v) { return el('div', { class: cls }, el('span', { text: k }), el('b', { text: v })); }

  function defSort(tab) { return tab === 'live' ? { sort: 'mcap', dir: -1 } : { sort: 'rank', dir: 1 }; }

  function readHash() {
    var d0 = defSort('pre');
    st.q = ''; st.category = 'all'; st.chain = 'all'; st.origin = 'all'; st.verdict = 'all';
    st.tab = 'pre'; st.sort = d0.sort; st.dir = d0.dir; st.selected = null;
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var p = new URLSearchParams(hash);
    if (p.get('q')) st.q = p.get('q');
    if (p.get('cat')) st.category = p.get('cat');
    if (p.get('chain')) st.chain = p.get('chain');
    if (p.get('origin') === 'watch' || p.get('origin') === 'early') st.origin = p.get('origin');
    else if (p.get('wl') === '1') st.origin = 'watch';
    if (VERDICTS.indexOf(p.get('verdict')) >= 0) st.verdict = p.get('verdict');
    if (p.get('tab') === 'live') st.tab = 'live';
    var valid = st.tab === 'live' ? LIVE_SORTS : PRE_SORTS;
    var s = p.get('sort');
    if (s && valid[s]) { st.sort = s; st.dir = valid[s]; }
    else if (st.tab === 'live') { st.sort = 'mcap'; st.dir = -1; }
    var dir = p.get('dir');
    if (dir === 'asc' || dir === '1') st.dir = 1;
    else if (dir === 'desc' || dir === '-1') st.dir = -1;
    if (p.get('p')) st.selected = p.get('p');
  }

  function writeHash() {
    var p = new URLSearchParams();
    if (st.q) p.set('q', st.q);
    if (st.category !== 'all') p.set('cat', st.category);
    if (st.chain !== 'all') p.set('chain', st.chain);
    if (st.origin !== 'all') p.set('origin', st.origin);
    if (st.verdict !== 'all') p.set('verdict', st.verdict);
    if (st.tab === 'live') p.set('tab', 'live');
    var d0 = defSort(st.tab);
    if (st.sort !== d0.sort || st.dir !== d0.dir) { p.set('sort', st.sort); p.set('dir', st.dir > 0 ? 'asc' : 'desc'); }
    if (st.selected) p.set('p', st.selected);
    var next = p.toString();
    try {
      if (next) window.history.replaceState(null, '', '#' + next);
      else window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch (_e) {}
  }

  function matchCommon(r, q) {
    if (st.category !== 'all' && (r.category || 'Other') !== st.category) return false;
    if (st.chain !== 'all' && (r.chains || []).indexOf(st.chain) < 0) return false;
    if (!q) return true;
    return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
  }
  function filteredRows() {
    var q = st.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (!matchCommon(r, q)) return false;
      if (st.origin === 'watch' && !r.on_watchlist) return false;
      if (st.origin === 'early' && r.on_watchlist) return false;
      if (st.verdict !== 'all' && r.net_verdict !== st.verdict) return false;
      return true;
    });
  }
  function filteredLive() {
    var q = st.q.trim().toLowerCase();
    return (DATA.live || []).filter(function (r) { return matchCommon(r, q); });
  }
  function cmpNulls(a, b, av, bv) {
    if (av === null && bv === null) return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av < bv) return -st.dir;
    if (av > bv) return st.dir;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  }
  function sortedRows(list) {
    var k = st.sort;
    return list.slice().sort(function (a, b) {
      var av = k === 'rank' ? a.rank : k === 'name' ? a.name.toLowerCase() : k === 'tvl' ? a.tvl_usd : k === 'growth' ? a.change_7d : k === 'age' ? a.age_days : k === 'range' ? a.range_low_usd : a.implied_value_usd;
      var bv = k === 'rank' ? b.rank : k === 'name' ? b.name.toLowerCase() : k === 'tvl' ? b.tvl_usd : k === 'growth' ? b.change_7d : k === 'age' ? b.age_days : k === 'range' ? b.range_low_usd : b.implied_value_usd;
      return cmpNulls(a, b, av, bv);
    });
  }
  function sortedLive(list) {
    var k = st.sort;
    return list.slice().sort(function (a, b) {
      var av = k === 'name' ? a.name.toLowerCase() : k === 'tvl' ? a.tvl_usd : k === 'growth' ? a.change_7d : k === 'ratio' ? ((a.mcap_usd !== null && a.tvl_usd > 0) ? a.mcap_usd / a.tvl_usd : null) : a.mcap_usd;
      var bv = k === 'name' ? b.name.toLowerCase() : k === 'tvl' ? b.tvl_usd : k === 'growth' ? b.change_7d : k === 'ratio' ? ((b.mcap_usd !== null && b.tvl_usd > 0) ? b.mcap_usd / b.tvl_usd : null) : b.mcap_usd;
      return cmpNulls(a, b, av, bv);
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'radar-mark', 'aria-hidden': 'true' }), el('span', { class: 'wordmark', text: 'Token Radar' })),
      el('div', { class: 'top-meta' }, el('span', { text: 'Snapshot ' + DATA.as_of }), el('span', { text: 'DefiLlama index' }), el('span', { text: DATA.model_version + ' model' }))
    );
  }

  function hero() {
    var below = 0;
    DATA.rows.forEach(function (r) { if (!r.on_watchlist && r.tvl_usd < DATA.floor_usd) below++; });
    return el('section', { class: 'hero' },
      el('div', null,
        el('h1', { text: 'Every pre-token protocol, ranked by implied launch value' }),
        el('p', null, 'Watchlist floor: ', el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M' }), ' TVL with no token on record. Early radar adds ', el('b', { text: String(DATA.early_size) }), ' more (', el('b', { text: String(below) }), ' below floor, ', el('b', { text: String(DATA.early_size - below) }), ' genuine launches above). Implied value is a model, not a promise.')
      ),
      el('div', { class: 'stats' }, [
        ['Watchlist', DATA.watchlist_size + ' / ' + DATA.watchlist_size],
        ['Pre-token ranked', String(DATA.board_size)],
        ['Early radar adds', String(DATA.early_size)],
        ['Live tokens aside', String(DATA.live_size)]
      ].map(function (kv) { return kvDiv('stat', kv[0], kv[1]); }))
    );
  }

  function fitScatter() {
    var fit = DATA.fit, val = DATA.validation, pts = fit.points || [];
    if (!pts.length) return el('div', { class: 'fine', text: 'No live protocols to fit.' });
    var W = 640, H = 248, padL = 68, padR = 16, padT = 14, padB = 36, pW = W - padL - padR, pH = H - padT - padB;
    var xs = pts.map(function (p) { return p.log_tvl; }), ys = pts.map(function (p) { return p.log_mcap; });
    var x0 = Math.floor(Math.min.apply(null, xs) - 0.2), x1 = Math.ceil(Math.max.apply(null, xs) + 0.2);
    var y0 = Math.floor(Math.min.apply(null, ys) - 0.2), y1 = Math.ceil(Math.max.apply(null, ys) + 0.2);
    if (x1 <= x0) x1 = x0 + 1;
    if (y1 <= y0) y1 = y0 + 1;
    function sx(x) { return padL + ((x - x0) / (x1 - x0)) * pW; }
    function sy(y) { return padT + (1 - (y - y0) / (y1 - y0)) * pH; }
    function lineY(x) { return fit.intercept + fit.slope * x; }

    var hint = 'Hover or focus any dot to inspect a live protocol.';
    var readout = el('div', { class: 'scatter-readout', text: hint });
    function setR(t, on) { readout.textContent = t; readout.className = on ? 'scatter-readout active' : 'scatter-readout'; }

    var svg = svgEl('svg', { class: 'scatter-svg', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Fitted launch curve scatter plot' },
      svgEl('defs', null, svgEl('clipPath', { id: 'plot-clip' }, svgEl('rect', { x: padL, y: padT, width: pW, height: pH }))),
      svgEl('rect', { x: padL, y: padT, width: pW, height: pH, fill: '#f7f4ed', stroke: '#ddd5c3', 'stroke-width': 1 })
    );
    for (var tx = Math.ceil(x0); tx <= Math.floor(x1); tx++) {
      svg.appendChild(svgEl('line', { x1: sx(tx).toFixed(1), y1: padT, x2: sx(tx).toFixed(1), y2: padT + pH, stroke: '#e8e1d1', 'stroke-width': 1 }));
      svg.appendChild(svgEl('text', { x: sx(tx).toFixed(1), y: padT + pH + 14, 'text-anchor': 'middle', class: 'svg-tick', text: fmtTick(tx) }));
    }
    for (var ty = Math.ceil(y0); ty <= Math.floor(y1); ty++) {
      svg.appendChild(svgEl('line', { x1: padL, y1: sy(ty).toFixed(1), x2: padL + pW, y2: sy(ty).toFixed(1), stroke: '#e8e1d1', 'stroke-width': 1 }));
      svg.appendChild(svgEl('text', { x: 58, y: (sy(ty) + 3.5).toFixed(1), 'text-anchor': 'end', class: 'svg-tick', text: fmtTick(ty) }));
    }
    svg.appendChild(svgEl('text', { x: 14, y: padT + pH / 2, transform: 'rotate(-90 14 ' + (padT + pH / 2) + ')', 'text-anchor': 'middle', class: 'svg-axis', text: 'Market cap (log)' }));
    svg.appendChild(svgEl('text', { x: padL + pW / 2, y: H - 4, 'text-anchor': 'middle', class: 'svg-axis', text: 'TVL (log)' }));

    var clip = svgEl('g', { 'clip-path': 'url(#plot-clip)' },
      svgEl('polygon', {
        points: [sx(x0).toFixed(1) + ',' + sy(lineY(x0) + val.resid_p75).toFixed(1), sx(x1).toFixed(1) + ',' + sy(lineY(x1) + val.resid_p75).toFixed(1), sx(x1).toFixed(1) + ',' + sy(lineY(x1) + val.resid_p25).toFixed(1), sx(x0).toFixed(1) + ',' + sy(lineY(x0) + val.resid_p25).toFixed(1)].join(' '),
        fill: 'rgba(29,78,216,0.14)'
      }),
      svgEl('line', { x1: sx(x0).toFixed(1), y1: sy(lineY(x0)).toFixed(1), x2: sx(x1).toFixed(1), y2: sy(lineY(x1)).toFixed(1), stroke: '#141c2c', 'stroke-width': 2 })
    );
    pts.forEach(function (p) {
      var tvl = Math.pow(10, p.log_tvl), mcap = Math.pow(10, p.log_mcap);
      var info = p.name + ' \u00b7 ' + (p.category || 'Other') + ' \u00b7 TVL ' + fmtUsd(tvl) + ' \u00b7 Mcap ' + fmtUsd(mcap) + ' \u00b7 ' + (mcap / tvl).toFixed(2) + 'x';
      var dot = svgEl('circle', { cx: sx(p.log_tvl).toFixed(1), cy: sy(p.log_mcap).toFixed(1), r: 3.3, class: 'svg-dot', tabindex: '0', 'aria-label': info }, svgEl('title', { text: info }));
      dot.addEventListener('mouseenter', function () { setR(info, true); });
      dot.addEventListener('focus', function () { setR(info, true); });
      dot.addEventListener('mouseleave', function () { setR(hint, false); });
      dot.addEventListener('blur', function () { setR(hint, false); });
      clip.appendChild(dot);
    });
    var selG = svgEl('g', { id: 'scatter-selected' });
    clip.appendChild(selG);
    svg.appendChild(clip);

    var selLeg = el('span', { class: 'leg-item', hidden: true }, el('i', { class: 'leg-sel' }), 'Selected');
    scSt = { sx: sx, sy: sy, group: selG, selLeg: selLeg };
    return el('div', { class: 'fit-col' },
      el('div', { class: 'fit-head' },
        el('h2', { text: 'The fitted launch curve' }),
        el('div', { class: 'legend' },
          el('span', { class: 'leg-item' }, el('i', { class: 'leg-dot' }), 'Live tokens (' + fit.n + ')'),
          el('span', { class: 'leg-item' }, el('i', { class: 'leg-line' }), 'Fitted curve'),
          el('span', { class: 'leg-item' }, el('i', { class: 'leg-band' }), 'P25\u2013P75 band'),
          selLeg
        )
      ),
      svg, readout
    );
  }

  function updateScatterMarker(row) {
    if (!scSt) return;
    var g = scSt.group;
    while (g.firstChild) g.removeChild(g.firstChild);
    if (!row || !(row.tvl_usd > 0) || !(row.implied_value_usd > 0)) { scSt.selLeg.setAttribute('hidden', ''); return; }
    scSt.selLeg.removeAttribute('hidden');
    var x = scSt.sx(Math.log10(row.tvl_usd)), y = scSt.sy(Math.log10(row.implied_value_usd));
    var yLo = scSt.sy(Math.log10(Math.max(1, row.range_low_usd))), yHi = scSt.sy(Math.log10(Math.max(1, row.range_high_usd)));
    var tip = row.name + ' \u00b7 TVL ' + fmtUsd(row.tvl_usd) + ' \u00b7 Implied ' + fmtUsd(row.implied_value_usd) + ' (' + fmtUsd(row.range_low_usd) + '\u2013' + fmtUsd(row.range_high_usd) + ')';
    g.appendChild(svgEl('line', { x1: x.toFixed(1), y1: yHi.toFixed(1), x2: x.toFixed(1), y2: yLo.toFixed(1), stroke: '#d97706', 'stroke-width': 2.4 }));
    g.appendChild(svgEl('line', { x1: (x - 5).toFixed(1), y1: yHi.toFixed(1), x2: (x + 5).toFixed(1), y2: yHi.toFixed(1), stroke: '#d97706', 'stroke-width': 1.8 }));
    g.appendChild(svgEl('line', { x1: (x - 5).toFixed(1), y1: yLo.toFixed(1), x2: (x + 5).toFixed(1), y2: yLo.toFixed(1), stroke: '#d97706', 'stroke-width': 1.8 }));
    g.appendChild(svgEl('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 5.5, fill: '#f59e0b', stroke: '#141c2c', 'stroke-width': 1.8 }, svgEl('title', { text: tip })));
  }

  function fitPanel() {
    var fit = DATA.fit, val = DATA.validation;
    var items = [
      ['Leave-one-out error', val.loo_mdape_pct.toFixed(1) + '%'],
      ['Blind backtest', val.backtest_mdape_pct.toFixed(1) + '% (n=' + val.backtest_n + ')'],
      ['Radar-3 same test', val.radar3_loo_mdape_pct.toFixed(1) + '%'],
      ['Fit R\u00b2 (n=' + fit.n + ')', fit.r2.toFixed(2)],
      ['P25\u2013P75 band', '\u00d7' + Math.pow(10, val.resid_p25).toFixed(2) + ' to \u00d7' + Math.pow(10, val.resid_p75).toFixed(2)],
      ['Curve', fit.intercept.toFixed(2) + ' + ' + fit.slope.toFixed(2) + ' log TVL']
    ];
    if (typeof val.loo_spearman === 'number') items.push(['LOO Spearman', val.loo_spearman.toFixed(3)]);
    return el('section', { class: 'fit' },
      fitScatter(),
      el('div', { class: 'valid' },
        el('h3', { text: 'Tested, not asserted' }),
        el('div', { class: 'valid-grid' }, items.map(function (kv) { return kvDiv(null, kv[0], kv[1]); })),
        el('p', { class: 'fine', text: 'LOO holds each live token out once and refits. Blind backtest splits by slug (half train, half test). Errors are median |pred \u2212 actual| / actual.' })
      )
    );
  }

  function controls() {
    var catSet = {}, cc = {};
    DATA.rows.forEach(function (r) { catSet[r.category || 'Other'] = 1; (r.chains || []).forEach(function (c) { cc[c] = (cc[c] || 0) + 1; }); });
    (DATA.live || []).forEach(function (r) { catSet[r.category || 'Other'] = 1; (r.chains || []).forEach(function (c) { if (!cc[c]) cc[c] = 0; }); });
    var cats = Object.keys(catSet).sort();
    var chains = Object.keys(cc).sort(function (a, b) { return cc[b] - cc[a] || (a < b ? -1 : a > b ? 1 : 0); });

    refs.q = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: st.q, 'aria-label': 'Search the board', oninput: function () { st.q = refs.q.value; writeHash(); updateBoard(); } });
    refs.category = el('select', { id: 'category', 'aria-label': 'Filter by category', onchange: function () { st.category = refs.category.value; writeHash(); updateBoard(); } }, opt('all', 'All categories'), cats.map(function (c) { return opt(c, c); }));
    refs.chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain', onchange: function () { st.chain = refs.chain.value; writeHash(); updateBoard(); } }, opt('all', 'All chains (' + chains.length + ')'), chains.map(function (c) { return opt(c, cc[c] > 0 ? c + ' (' + cc[c] + ')' : c + ' (live)'); }));
    refs.origin = el('select', { id: 'origin', 'aria-label': 'Filter by origin', onchange: function () { st.origin = refs.origin.value; writeHash(); updateBoard(); } }, opt('all', 'All origins'), opt('watch', 'Watchlist'), opt('early', 'Early find'));
    refs.originField = el('div', { class: 'field' }, el('label', { for: 'origin', text: 'Origin' }), refs.origin);
    refs.verdict = el('select', { id: 'verdict', 'aria-label': 'Filter by net verdict', onchange: function () { st.verdict = refs.verdict.value; writeHash(); updateBoard(); } }, opt('all', 'All verdicts'), VERDICTS.map(function (v) { return opt(v, v); }));
    refs.verdictField = el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Net verdict' }), refs.verdict);

    function setTab(t) {
      if (st.tab === t) return;
      st.tab = t; var d = defSort(t); st.sort = d.sort; st.dir = d.dir;
      writeHash(); updateBoard();
    }
    refs.tabPre = el('button', { type: 'button', text: 'Pre-token', onclick: function () { setTab('pre'); } });
    refs.tabLive = el('button', { type: 'button', text: 'Live token', onclick: function () { setTab('live'); } });
    refs.count = el('span', { class: 'count' });
    refs.chips = el('div', { class: 'chips', 'aria-label': 'Active filters' });
    refs.controlsWrap = el('div', { class: 'controls-wrap' },
      el('div', { class: 'controls' },
        el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), refs.q),
        el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), refs.category),
        el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), refs.chain),
        refs.originField, refs.verdictField,
        el('div', { class: 'field' }, el('span', { class: 'lbl', text: 'Token status' }), el('div', { class: 'tabs' }, refs.tabPre, refs.tabLive)),
        refs.count
      ),
      refs.chips
    );
    return refs.controlsWrap;
  }

  function clearFilters() { st.q = ''; st.category = 'all'; st.chain = 'all'; st.origin = 'all'; st.verdict = 'all'; writeHash(); updateBoard(); }

  function syncControlsAndChips(shown) {
    if (refs.q.value !== st.q) refs.q.value = st.q;
    refs.category.value = st.category; refs.chain.value = st.chain;
    refs.origin.value = st.origin; refs.verdict.value = st.verdict;
    var isPre = st.tab === 'pre';
    refs.originField.hidden = !isPre; refs.verdictField.hidden = !isPre;
    refs.tabPre.setAttribute('aria-pressed', isPre ? 'true' : 'false');
    refs.tabLive.setAttribute('aria-pressed', isPre ? 'false' : 'true');
    refs.count.textContent = isPre ? shown + ' of ' + DATA.board_size + ' rows' : shown + ' of ' + (DATA.live || []).length + ' live';

    var active = [];
    if (st.q.trim()) active.push(['Search: "' + st.q.trim() + '"', function () { st.q = ''; }]);
    if (st.category !== 'all') active.push(['Category: ' + st.category, function () { st.category = 'all'; }]);
    if (st.chain !== 'all') active.push(['Chain: ' + st.chain, function () { st.chain = 'all'; }]);
    if (isPre && st.origin !== 'all') active.push(['Origin: ' + (st.origin === 'watch' ? 'Watchlist' : 'Early find'), function () { st.origin = 'all'; }]);
    if (isPre && st.verdict !== 'all') active.push(['Verdict: ' + st.verdict, function () { st.verdict = 'all'; }]);

    refs.chips.textContent = '';
    if (!active.length) refs.chips.setAttribute('hidden', '');
    else {
      refs.chips.removeAttribute('hidden');
      active.forEach(function (it) { refs.chips.appendChild(el('span', { class: 'chip' }, it[0], el('button', { type: 'button', 'aria-label': 'Remove ' + it[0], text: '\u00d7', onclick: function () { it[1](); writeHash(); updateBoard(); } }))); });
      refs.chips.appendChild(el('button', { type: 'button', class: 'chip-reset', text: 'Reset all', onclick: clearFilters }));
    }
    document.querySelectorAll('.tilt[data-cat]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-cat') === st.category); });
  }

  function sortHead(key, label, isNum, defs) {
    var on = st.sort === key;
    return el('th', { scope: 'col', class: isNum ? 'num' : null, 'aria-sort': on ? (st.dir > 0 ? 'ascending' : 'descending') : 'none' },
      el('button', { type: 'button', onclick: function () { if (st.sort === key) st.dir = -st.dir; else { st.sort = key; st.dir = defs[key] || -1; } writeHash(); updateBoard(); } },
        label, on ? el('span', { class: 'sort-arr', 'aria-hidden': 'true', text: st.dir > 0 ? '\u2191' : '\u2193' }) : null
      )
    );
  }

  function emptyPanel(msg) {
    return el('div', { class: 'panel' }, el('div', { class: 'empty' },
      el('h2', { text: 'No protocol matches that filter' }), el('p', { text: msg }),
      el('button', { class: 'btn primary', type: 'button', text: 'Clear filters', onclick: clearFilters })
    ));
  }

  function boardTable(list) {
    if (!list.length) return emptyPanel('Clear the search or pick another category, chain, origin or verdict.');
    var max = 1;
    DATA.rows.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(el('tr', {
        'data-slug': r.slug, 'data-open': st.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + fmtChains(r.chains) + ' \u00b7 ' + r.fitted_multiple.toFixed(2) + 'x fitted' }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gc, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num' }, el('div', { class: 'value-bar' }, el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })), el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', { class: 'num range', text: fmtUsd(r.range_low_usd) + '\u2013' + fmtUsd(r.range_high_usd) }),
        el('td', null, el('span', { class: 'v-badge ' + vCls(r.net_verdict), text: r.net_verdict })),
        el('td', null, r.on_watchlist ? el('span', { class: 'tag watch', text: 'Watchlist' }) : el('span', { class: 'tag early', text: 'Early find' }))
      ));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', null,
      el('caption', { text: 'Pre-token protocols ranked by implied launch value. Click any row for model breakdown and farm plan.' }),
      el('thead', null, el('tr', null,
        sortHead('rank', 'Rank', true, PRE_SORTS), sortHead('name', 'Protocol', false, PRE_SORTS),
        sortHead('tvl', 'TVL', true, PRE_SORTS), sortHead('growth', '7d', true, PRE_SORTS),
        sortHead('age', 'Age', true, PRE_SORTS), sortHead('implied', 'Implied value', true, PRE_SORTS),
        sortHead('range', 'P25\u2013P75 range', true, PRE_SORTS),
        el('th', { scope: 'col', text: 'Net verdict' }), el('th', { scope: 'col', text: 'Origin' })
      )), tbody
    )));
  }

  function liveTable(list) {
    if (!list.length) return emptyPanel('Clear the search or pick another category or chain.');
    var tbody = el('tbody');
    list.forEach(function (r) {
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var ratio = (r.mcap_usd !== null && r.tvl_usd > 0) ? (r.mcap_usd / r.tvl_usd).toFixed(2) + 'x' : 'n/a';
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'tag live', text: 'Live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + fmtChains(r.chains) }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gc, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: ratio })
      ));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', null,
      el('caption', { text: 'Live-token protocols set aside from the pre-token ranking; their Mcap/TVL ratios price the curve above.' }),
      el('thead', null, el('tr', null,
        el('th', { scope: 'col', text: 'Status' }), sortHead('name', 'Protocol', false, LIVE_SORTS),
        sortHead('tvl', 'TVL', true, LIVE_SORTS), sortHead('growth', '7d', true, LIVE_SORTS),
        sortHead('mcap', 'Market cap', true, LIVE_SORTS), sortHead('ratio', 'Mcap / TVL', true, LIVE_SORTS)
      )), tbody
    )));
  }

  function modelPanel() {
    var m = DATA.model, fit = DATA.fit, val = DATA.validation;
    var top = DATA.rows.slice(0, 8), max = top.length ? top[0].implied_value_usd : 1;
    var topRows = top.map(function (r, i) {
      var pct = Math.max(2, Math.round((r.implied_value_usd / max) * 100));
      return el('button', { type: 'button', class: 'chart-row', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'chart-label', text: r.name.length > 22 ? r.name.slice(0, 21) + '\u2026' : r.name }),
        el('span', { class: 'chart-track' }, el('span', { class: i === 0 ? 'chart-bar first' : 'chart-bar', style: 'display:block;width:' + pct + '%' })),
        el('span', { class: 'chart-value', text: fmtUsd(r.implied_value_usd) })
      );
    });
    var chips = (DATA.multiples || []).map(function (mm) {
      return el('div', { class: 'mult' }, el('span', { class: 'mult-cat', text: mm.category }), el('b', { text: mm.median.toFixed(2) + 'x' }), el('span', { class: 'mult-n', text: 'n=' + mm.n }));
    });
    var tilts = (fit.categories || []).slice().sort(function (a, b) { return Math.abs(b.adjustment) - Math.abs(a.adjustment); }).slice(0, 6).map(function (c) {
      return el('button', {
        type: 'button', class: 'tilt', 'data-cat': c.category,
        onclick: function () { st.tab = 'pre'; st.category = st.category === c.category ? 'all' : c.category; writeHash(); updateBoard(); refs.controlsWrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      }, el('span', { class: 'tilt-cat', text: c.category }), el('b', { text: (c.adjustment >= 0 ? '+' : '') + c.adjustment.toFixed(2) }), el('span', { class: 'tilt-n', text: 'n=' + c.n }));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How the value is scored' }),
      el('div', { class: 'formula', text: 'implied = round(tvl \u00d7 fitted(tvl, cat) \u00d7 (1 + clamp(g7d \u2212 cat_median, ' + m.growth_rel_floor + ', ' + m.growth_rel_cap + ')/100 \u00d7 ' + m.growth_weight + ') \u00d7 (' + m.maturity_floor + ' + min(age, ' + m.maturity_days + ')/' + m.maturity_days + ' \u00d7 ' + m.maturity_range + ') \u00d7 (1 + 0.04 \u00d7 min(chains \u2212 1, 5)))' }),
      el('p', { class: 'fine', text: 'fitted(tvl, cat) = 10^(' + fit.intercept.toFixed(2) + ' + ' + fit.slope.toFixed(2) + ' log TVL + category tilt), fitted robustly (Huber) on ' + fit.n + ' live-token protocols.' }),
      el('ul', { class: 'model-points' },
        el('li', null, el('b', { text: 'Fitted launch curve. ' }), 'Log market cap on log TVL over live tokens, pricing large protocols at large-scale multiples.'),
        el('li', null, el('b', { text: 'Category tilt. ' }), 'Median residual from the curve shrunk by n/(n+10) toward 0.'),
        el('li', null, el('b', { text: 'Honest error bounds. ' }), 'LOO median error ' + val.loo_mdape_pct.toFixed(1) + '%, blind backtest ' + val.backtest_mdape_pct.toFixed(1) + '% vs ' + val.radar3_loo_mdape_pct.toFixed(1) + '% for flat multiples.'),
        el('li', null, el('b', { text: 'Growth, age & reach. ' }), 'Relative 7d growth vs category median, age with no token (missing = 365d), and multi-chain reach.'),
        el('li', null, el('b', { text: 'Net verdict. ' }), 'Each farm plan prices bridge + gas fees against implied launch value for breakeven share.')
      ),
      el('h3', { text: 'Biggest category tilts (click to filter board)' }), el('div', { class: 'tilt-row' }, tilts),
      el('div', { class: 'chart-box' }, el('h3', { text: 'Top 8 by implied value (click a bar to inspect)' }), el('div', { class: 'chart', role: 'list', 'aria-label': 'Top 8 protocols by implied value' }, topRows)),
      el('h3', { text: 'Category medians, for reference (n \u2265 3 live)' }), el('div', { class: 'mults' }, chips)
    );
  }

  var dialogInner = el('div', { class: 'detail-inner' });
  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' }, dialogInner);
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', function () { st.selected = null; writeHash(); syncSelectedRows(); updateScatterMarker(null); });

  function syncSelectedRows() {
    document.querySelectorAll('tbody tr[data-slug]').forEach(function (tr) { tr.setAttribute('data-open', tr.getAttribute('data-slug') === st.selected ? 'true' : 'false'); });
  }
  function navInfo(slug) {
    var list = sortedRows(filteredRows()), idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].slug === slug) { idx = i; break; }
    if (idx < 0) { list = DATA.rows; for (var j = 0; j < list.length; j++) if (list[j].slug === slug) { idx = j; break; } }
    return { list: list, idx: idx };
  }
  function stepDetail(delta) {
    if (!dialog.open || !st.selected) return;
    var n = navInfo(st.selected);
    if (n.idx >= 0 && n.idx + delta >= 0 && n.idx + delta < n.list.length) openDetail(n.list[n.idx + delta].slug);
  }
  window.addEventListener('keydown', function (e) {
    if (!dialog.open || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); stepDetail(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepDetail(1); }
  });

  function parseStep(s) {
    var at = s.indexOf(' Cost: ');
    if (at < 0) return { action: s, cost: '', time: '' };
    var action = s.slice(0, at), tail = s.slice(at + 7), tAt = tail.indexOf('. Time: ');
    return tAt < 0 ? { action: action, cost: tail.replace(/\.$/, ''), time: '' } : { action: action, cost: tail.slice(0, tAt), time: tail.slice(tAt + 8).replace(/\.$/, '') };
  }

  function copyPlan(row, btn) {
    var lines = [row.name + ' (Rank #' + row.rank + ' \u00b7 Implied ' + fmtUsd(row.implied_value_usd) + ' \u00b7 ' + row.net_verdict + ')'];
    (row.farm_steps || []).forEach(function (s, i) { lines.push((i + 1) + '. ' + s); });
    var txt = lines.join('\n');
    function done() { btn.textContent = 'Copied!'; setTimeout(function () { btn.textContent = 'Copy plan'; }, 1600); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
    else { fallbackCopy(txt); done(); }
  }
  function fallbackCopy(txt) {
    var ta = el('textarea', { style: 'position:fixed;left:-9999px' });
    ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (_e) {}
    document.body.removeChild(ta);
  }

  function kpiTile(lbl, val, sub, valCls) {
    return el('div', { class: 'kpi' },
      el('span', { class: 'kpi-lbl', text: lbl }),
      el('b', { class: 'kpi-val' + (valCls ? ' ' + valCls : ''), text: val }),
      typeof sub === 'string' ? el('span', { class: 'kpi-sub', text: sub }) : sub
    );
  }

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    st.selected = slug;
    writeHash(); syncSelectedRows(); updateScatterMarker(row);

    var nav = navInfo(slug);
    dialogInner.textContent = '';
    var recomputed = impliedOf(row, DATA.model), agrees = recomputed === row.implied_value_usd;
    var farmChain = row.farm_chain || (row.chains && row.chains[0]) || 'main chain';
    var catFit = catFitFor(row.category || 'Other'), adj = row.category_adjustment;
    var explain = (row.adjustment_source === 'category' && catFit
      ? 'Curve tilted ' + (adj >= 0 ? '+' : '') + adj.toFixed(2) + ' dex by ' + (row.category || 'Other') + ' (n=' + row.adjustment_n + ' live). '
      : 'No live peers in ' + (row.category || 'Other') + ', priced off curve alone. ') +
      'Fees $' + row.total_fees_usd + ' require ' + oneInN(row.breakeven_share) + ' of launch value to break even.';

    var titleEl = el('h2', { id: 'detail-title', tabindex: '-1', text: row.name });
    dialogInner.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('div', { class: 'detail-meta' }, el('span', { text: 'Rank ' + row.rank + ' / ' + DATA.board_size }), row.on_watchlist ? el('span', { class: 'tag watch', text: 'Watchlist' }) : el('span', { class: 'tag early', text: 'Early find' })),
        titleEl,
        el('p', { class: 'detail-sub', text: (row.category || 'Other') + ' \u00b7 ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'unnamed chain') })
      ),
      el('div', { class: 'detail-actions' },
        el('button', { class: 'btn sm', type: 'button', 'aria-label': 'Previous protocol', text: '\u2190', disabled: nav.idx <= 0, onclick: function () { stepDetail(-1); } }),
        el('button', { class: 'btn sm', type: 'button', 'aria-label': 'Next protocol', text: '\u2192', disabled: nav.idx < 0 || nav.idx >= nav.list.length - 1, onclick: function () { stepDetail(1); } }),
        el('button', { class: 'btn sm', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
      )
    ));

    dialogInner.appendChild(el('div', { class: 'kpi-strip' },
      kpiTile('Implied value', fmtUsd(row.implied_value_usd), fmtUsd(row.range_low_usd) + '\u2013' + fmtUsd(row.range_high_usd)),
      kpiTile('TVL', fmtUsd(row.tvl_usd), row.fitted_multiple.toFixed(2) + 'x fitted'),
      kpiTile('Plan fees', '$' + row.total_fees_usd, el('span', null, el('span', { class: 'v-badge ' + vCls(row.net_verdict), text: row.net_verdict }))),
      kpiTile('7d growth', fmtPct(row.change_7d), 'vs ' + fmtPct(row.growth_median_pct) + ' med', row.change_7d === null ? '' : row.change_7d >= 0 ? 'pos' : 'neg')
    ));

    var bd = [
      ['Best farm chain', farmChain],
      ['Category tilt', (adj >= 0 ? '+' : '') + adj.toFixed(2) + ' (n=' + row.adjustment_n + ')'],
      ['Growth rel / mult', fmtPct(row.growth_relative_pct) + ' \u00b7 \u00d7' + row.growth_multiplier],
      ['Age / maturity', fmtAge(row.age_days) + ' \u00b7 \u00d7' + row.maturity_multiplier],
      ['Chains / breadth', (row.chains || []).length + ' \u00b7 \u00d7' + row.breadth_multiplier],
      ['Breakeven share', oneInN(row.breakeven_share)]
    ];
    dialogInner.appendChild(el('section', { class: 'detail-section' },
      el('div', { class: 'section-head' }, el('h3', { text: 'Model breakdown' }), el('span', { class: 'verify-badge ' + (agrees ? 'ok' : 'err'), text: 'Recomputed: ' + fmtUsd(recomputed) + (agrees ? ' \u00b7 matches board.json' : ' \u00b7 mismatch') })),
      el('div', { class: 'breakdown-grid' }, bd.map(function (kv) { return kvDiv('bd-item', kv[0], kv[1]); })),
      el('p', { class: 'fine', text: explain })
    ));

    var copyBtn = el('button', { class: 'btn sm', type: 'button', text: 'Copy plan' });
    copyBtn.addEventListener('click', function () { copyPlan(row, copyBtn); });
    var steps = row.farm_steps || [];
    dialogInner.appendChild(el('section', { class: 'detail-section' },
      el('div', { class: 'section-head' }, el('h3', { text: 'Farm plan (' + steps.length + ' steps)' }), copyBtn),
      el('ol', { class: 'step-cards' }, steps.map(function (s, idx) {
        var p = parseStep(s), isV = idx === steps.length - 1 || p.action.indexOf('Net verdict:') === 0;
        return el('li', { class: isV ? 'step-card verdict-card ' + vCls(row.net_verdict) : 'step-card' },
          el('span', { class: 'step-num', text: String(idx + 1) }),
          el('div', { class: 'step-body' },
            el('p', { class: 'step-text', text: p.action }),
            (p.cost || p.time) ? el('div', { class: 'step-badges' }, p.cost ? el('span', { class: 'step-pill cost', text: 'Cost: ' + p.cost }) : null, p.time ? el('span', { class: 'step-pill', text: 'Time: ' + p.time }) : null) : null
          )
        );
      }))
    ));
    dialogInner.appendChild(el('p', { class: 'fine', text: 'The snapshot records no token for this protocol. That is the record, not proof it has none.' }));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
    titleEl.focus({ preventScroll: true });
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Source: ' + DATA.source + '.' }),
      el('p', { text: 'Implied value models what a token would be worth if the protocol\u2019s record stayed as it is; it does not predict whether or when a token is issued.' })
    );
  }

  function updateBoard() {
    var list = st.tab === 'pre' ? sortedRows(filteredRows()) : sortedLive(filteredLive());
    refs.boardHost.textContent = '';
    refs.boardHost.appendChild(st.tab === 'pre' ? boardTable(list) : liveTable(list));
    syncControlsAndChips(list.length);
    syncSelectedRows();
  }

  function mount() {
    app.textContent = '';
    refs.boardHost = el('div', { id: 'board-host' });
    app.appendChild(el('div', { class: 'wrap' }, header(), hero(), fitPanel(), controls(), refs.boardHost, modelPanel(), footer()));
    app.appendChild(dialog);
    app.setAttribute('aria-busy', 'false');
    updateBoard();
    if (st.selected) openDetail(st.selected);
  }

  window.addEventListener('hashchange', function () {
    readHash(); updateBoard();
    if (st.selected) openDetail(st.selected);
    else if (dialog.open) dialog.close();
  });

  readHash();
  mount();
})();
