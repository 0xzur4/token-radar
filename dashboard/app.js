// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, its filters, a detail view for every protocol and the live-token
// view. No network: every byte it shows is in data.js, and the farm plan it shows for a row is
// the plan board.json carries for that row, not a second derivation.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, tab: 'pre', sort: 'implied', dir: -1, selected: null };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model, recomputed in the page from the same snapshot figures main.ts used, so the page
  // can check its own arithmetic against the number board.json carries for the row.
  function impliedOf(row, model) {
    // The same four-decimal rounding main.ts applies, so the recompute lands on the
    // same whole dollar the board carries.
    function round4(n) { return Math.round(n * 1e4) / 1e4; }
    var growthMult = round4(1 + (row.growth_relative_pct / 100) * model.growth_weight);
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = round4(model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range);
    var extra = Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_max_extra);
    var breadth = round4(1 + extra * model.breadth_per_chain);
    return Math.max(1, Math.round(row.tvl_usd * row.fitted_multiple * growthMult * maturity * breadth));
  }

  function categoryFitFor(category) {
    var found = null;
    (DATA.fit.categories || []).forEach(function (c) { if (c.category === category) found = c; });
    return found;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('cat')) state.category = params.get('cat');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('wl') === '1') state.watchOnly = true;
    if (params.get('tab') === 'live') state.tab = 'live';
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('cat', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchOnly) params.set('wl', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchOnly && !r.on_watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'range') { av = a.range_low_usd; bv = b.range_low_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'radar-mark', 'aria-hidden': 'true' }),
        el('span', { class: 'wordmark', text: 'Token Radar' })
      ),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function hero() {
    var below = 0;
    DATA.rows.forEach(function (r) { if (!r.on_watchlist && r.tvl_usd < DATA.floor_usd) below++; });
    var above = DATA.early_size - below;
    return el('section', { class: 'hero' },
      el('div', null,
        el('h1', { text: 'Every pre-token protocol, ranked by what its launch would be worth' }),
        el('p', null,
          'The watchlist is the floor: every protocol with at least ',
          el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M' }),
          ' of TVL and no token on record. The early radar adds ',
          el('b', { text: String(DATA.early_size) }),
          ' more the watchlist leaves out: ',
          el('b', { text: String(below) }),
          ' below that floor and ',
          el('b', { text: String(above) }),
          ' genuine launches above it. Implied value is a model, not a promise.'
        )
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'stat' }, el('span', { text: 'Pre-token rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Early rows beyond the watchlist' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function fitScatter() {
    var fit = DATA.fit;
    var val = DATA.validation;
    var pts = fit.points || [];
    if (!pts.length) return el('div', { class: 'scatter-empty', text: 'No live protocols to fit.' });
    var xs = pts.map(function (p) { return p.log_tvl; });
    var ys = pts.map(function (p) { return p.log_mcap; });
    var x0 = Math.floor(Math.min.apply(null, xs) - 0.2);
    var x1 = Math.ceil(Math.max.apply(null, xs) + 0.2);
    var y0 = Math.floor(Math.min.apply(null, ys) - 0.2);
    var y1 = Math.ceil(Math.max.apply(null, ys) + 0.2);
    function px(x) { return ((x - x0) / (x1 - x0)) * 100; }
    function py(y) { return (1 - (y - y0) / (y1 - y0)) * 100; }
    var box = el('div', { class: 'scatter-box' });
    var grid = el('div', { class: 'scatter-grid' });
    var xTicks = [6, 7, 8, 9, 10];
    var yTicks = [5, 6, 7, 8, 9, 10];
    xTicks.forEach(function (t) {
      if (t < x0 || t > x1) return;
      var xLabel = t === 6 ? '$1M' : t === 7 ? '$10M' : t === 8 ? '$100M' : t === 9 ? '$1B' : '$10B';
      grid.appendChild(el('div', { class: 'grid-v', style: 'left:' + px(t) + '%' }));
      grid.appendChild(el('span', { class: 'tick-x', style: 'left:' + px(t) + '%', text: xLabel }));
    });
    yTicks.forEach(function (t) {
      if (t < y0 || t > y1) return;
      var yLabel = t === 5 ? '$100K' : t === 6 ? '$1M' : t === 7 ? '$10M' : t === 8 ? '$100M' : t === 9 ? '$1B' : '$10B';
      grid.appendChild(el('div', { class: 'grid-h', style: 'top:' + py(t) + '%' }));
      grid.appendChild(el('span', { class: 'tick-y', style: 'top:' + py(t) + '%', text: yLabel }));
    });
    // The line and the band are laid out in pixels once the box is on the page (a
    // percentage angle would be wrong: the box is wider than it is tall).
    fitGeom = {
      x0: x0, x1: x1, y0: y0, y1: y1,
      lineY0: fit.intercept + fit.slope * x0,
      lineY1: fit.intercept + fit.slope * x1,
      bandTop: val.resid_p75, bandBot: val.resid_p25
    };
    var band = el('div', { class: 'fit-band' });
    var line = el('div', { class: 'fit-line' });
    var dots = pts.map(function (p) {
      return el('span', { class: 'dot', style: 'left:' + px(p.log_tvl) + '%; top:' + py(p.log_mcap) + '%', title: p.name + ' (' + p.category + ')' });
    });
    box.appendChild(grid);
    box.appendChild(band);
    box.appendChild(line);
    dots.forEach(function (d) { box.appendChild(d); });
    return el('div', { class: 'scatter-wrap' },
      el('div', { class: 'scatter-axes' },
        el('span', { class: 'axis-y', text: 'Market cap (log)' }),
        box
      ),
      el('div', { class: 'scatter-x', text: 'TVL (log)' }),
      el('p', { class: 'fine', text: 'Each dot is one of the ' + fit.n + ' live-token protocols the curve is fitted on. The line is the fitted launch curve; the band is the middle half of its out-of-sample errors.' })
    );
  }

  function fitPanel() {
    var fit = DATA.fit;
    var val = DATA.validation;
    return el('section', { class: 'fit' },
      el('div', { class: 'fit-col' },
        el('h2', { text: 'The fitted launch curve' }),
        fitScatter()
      ),
      el('div', { class: 'fit-side' },
        el('div', { class: 'valid' },
          el('h3', { text: 'Tested, not asserted' }),
          el('div', { class: 'valid-grid' },
            el('div', null, el('span', { text: 'Leave-one-out error' }), el('b', { text: val.loo_mdape_pct.toFixed(1) + '%' })),
            el('div', null, el('span', { text: 'Blind backtest error' }), el('b', { text: val.backtest_mdape_pct.toFixed(1) + '% (n=' + val.backtest_n + ')' })),
            el('div', null, el('span', { text: 'Radar-3, same test' }), el('b', { text: val.radar3_loo_mdape_pct.toFixed(1) + '%' })),
            el('div', null, el('span', { text: 'Fit R\u00b2, n=' + fit.n }), el('b', { text: fit.r2.toFixed(2) })),
            el('div', null, el('span', { text: 'P25\u2013P75 of the errors' }), el('b', { text: '\u00d7' + Math.pow(10, val.resid_p25).toFixed(2) + ' to \u00d7' + Math.pow(10, val.resid_p75).toFixed(2) })),
            el('div', null, el('span', { text: 'Curve' }), el('b', { text: 'log mcap = ' + fit.intercept.toFixed(2) + ' + ' + fit.slope.toFixed(2) + ' log TVL' }))
          ),
          el('p', { class: 'fine', text: 'Leave-one-out holds each live protocol out once and refits without it. The blind backtest splits the live set in half by slug, fits on one half and scores the other, which it never saw. Errors are medians of |predicted \u2212 actual| / actual.' })
        )
      )
    );
  }

  function topChart() {
    var top = DATA.rows.slice(0, 8);
    var max = top.length ? top[0].implied_value_usd : 1;
    var rows = top.map(function (r, i) {
      var pct = Math.max(2, Math.round((r.implied_value_usd / max) * 100));
      return el('div', { class: 'chart-row' },
        el('span', { class: 'chart-label', text: r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name }),
        el('div', { class: 'chart-track' }, el('div', { class: i === 0 ? 'chart-bar first' : 'chart-bar', style: 'width:' + pct + '%' })),
        el('span', { class: 'chart-value', text: fmtUsd(r.implied_value_usd) })
      );
    });
    return el('div', { class: 'chart-box' },
      el('h3', { text: 'Top 8 by implied value' }),
      el('div', { class: 'chart', role: 'img', 'aria-label': 'Top 8 protocols by implied value' }, rows)
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var fit = DATA.fit;
    var val = DATA.validation;
    var chips = (DATA.multiples || []).map(function (mm) {
      return el('div', { class: 'mult' },
        el('span', { class: 'mult-cat', text: mm.category }),
        el('b', { text: mm.median.toFixed(2) + 'x' }),
        el('span', { class: 'mult-n', text: 'n=' + mm.n })
      );
    });
    var tiltChips = (fit.categories || []).slice().sort(function (a, b) { return Math.abs(b.adjustment) - Math.abs(a.adjustment); }).slice(0, 6).map(function (c) {
      var sign = c.adjustment >= 0 ? '+' : '';
      return el('div', { class: 'tilt' },
        el('span', { class: 'tilt-cat', text: c.category }),
        el('b', { text: sign + c.adjustment.toFixed(2) }),
        el('span', { class: 'tilt-n', text: 'n=' + c.n })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How the value is scored' }),
      el('div', { class: 'formula' },
        'implied = round(tvl x fitted(tvl, cat) x (1 + clamp(g7d - cat_median, ' + m.growth_rel_floor + ', ' + m.growth_rel_cap + ')/100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age, ' + m.maturity_days + ')/' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + 0.04 x min(chains - 1, 5)))'
      ),
      el('p', { class: 'fine', text: 'fitted(tvl, cat) = 10^(log mcap = ' + fit.intercept.toFixed(2) + ' + ' + fit.slope.toFixed(2) + ' log TVL + category tilt), fitted at run time on the ' + fit.n + ' live-token protocols in this snapshot. A launch is not worth a flat multiple of TVL: the market pays large protocols less per dollar locked than small ones, and the curve says by how much.' }),
      el('ul', { class: 'model-points' },
        el('li', null, el('b', { text: 'Fitted launch curve. ' }), 'Log market cap on log TVL over the live tokens, so a $3B protocol is priced at the multiple the market actually pays at $3B, not at the multiple it pays at $30M.'),
        el('li', null, el('b', { text: 'Category tilt. ' }), 'Each category\u2019s median residual from the curve, shrunk by n/(n+3): a category with one live protocol leans on the curve, one with fifteen leans on its own market.'),
        el('li', null, el('b', { text: 'Tested, not asserted. ' }), 'Leave-one-out error ' + val.loo_mdape_pct.toFixed(1) + '% (median), blind backtest ' + val.backtest_mdape_pct.toFixed(1) + '% on ' + val.backtest_n + ' unseen protocols, against ' + val.radar3_loo_mdape_pct.toFixed(1) + '% for the old flat category multiples on the same test. The curve is better, and the gap is honest: launch values are hard to price, and the P25\u2013P75 range on every row says so.'),
        el('li', null, el('b', { text: 'Relative growth. ' }), 'Seven-day TVL change against the category\u2019s own median, so share gained in a falling week still counts.'),
        el('li', null, el('b', { text: 'Waiting time. ' }), 'Age with no token is launch value the market has already waited for; three years counts more than three months.'),
        el('li', null, el('b', { text: 'Reach. ' }), 'Each extra chain adds 4%, capped at five, because a multi-chain protocol reaches more wallets at launch.'),
        el('li', null, el('b', { text: 'Net verdict. ' }), 'Every farm plan prices its own fees (bridge plus gas for setup, a weekly transaction and the exit) against the implied value, and says what share of the launch the airdrop must hand you to cover them.')
      ),
      el('h3', { text: 'Category medians, for reference' }),
      el('p', { class: 'fine', text: 'Median market-cap-to-TVL of each category\u2019s own live protocols (at least three of them). The radar-3 model priced every row at these; radar-4 keeps them only as the comparison the validation beats.' }),
      el('div', { class: 'mults' }, chips),
      el('h3', { text: 'Biggest category tilts' }),
      el('p', { class: 'fine', text: 'Log-point adjustments to the curve, shrunk by n/(n+3): a category with one live protocol leans on the curve, one with fifteen leans on its own market.' }),
      el('div', { class: 'tilt-row' }, tiltChips),
      topChart(),
      el('p', { class: 'fine', text: 'One function scores every row; no protocol name is special-cased. The curve, the tilts and the validation are computed from this snapshot\u2019s live protocols at run time, never written in by hand. Missing seven-day growth counts as the category median, and a missing listing date counts as 365 days.' })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 12);

    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chn = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCounts[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chn.addEventListener('change', function () { state.chain = chn.value; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'wl', checked: state.watchOnly ? 'checked' : null });
    wl.addEventListener('change', function () { state.watchOnly = wl.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chn),
      el('label', { class: 'check', for: 'wl' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'lbl', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre' ? filteredRows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHead(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function originTag(row) {
    return row.on_watchlist
      ? el('span', { class: 'tag watch', text: 'Watchlist' })
      : el('span', { class: 'tag early', text: 'Early find' });
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category, chain or toggle to see the board again.' }),
        el('button', { class: 'btn primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; writeHash(); render(); } })
      ));
    }
    var max = 1;
    DATA.rows.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-open': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + ' · ' + r.fitted_multiple.toFixed(2) + 'x fitted · ' + r.net_verdict })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'value-bar' },
          el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num range', text: fmtUsd(r.range_low_usd) + '–' + fmtUsd(r.range_high_usd) }),
        el('td', null, originTag(r))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHead('implied', 'Rank'),
            sortHead('name', 'Protocol'),
            sortHead('tvl', 'TVL'),
            sortHead('growth', '7d'),
            sortHead('age', 'Age'),
            sortHead('implied', 'Implied value'),
            sortHead('range', 'P25–P75 range'),
            el('th', { scope: 'col', text: 'Origin' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'tag live', text: 'Live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'sub', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market-cap-to-TVL ratios price the categories above.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  // The scatter's data ranges, kept for the pixel layout of its fitted line and band.
  var fitGeom = null;

  function layoutFitLine() {
    if (!fitGeom) return;
    var box = document.querySelector('.scatter-box');
    var line = document.querySelector('.fit-line');
    var band = document.querySelector('.fit-band');
    if (!box || !line || !band) return;
    var w = box.clientWidth;
    var h = box.clientHeight;
    if (!w || !h) return;
    function px(x) { return ((x - fitGeom.x0) / (fitGeom.x1 - fitGeom.x0)) * w; }
    function py(y) { return (1 - (y - fitGeom.y0) / (fitGeom.y1 - fitGeom.y0)) * h; }
    var xA = px(fitGeom.x0);
    var xB = px(fitGeom.x1);
    var yA = py(fitGeom.lineY0);
    var yB = py(fitGeom.lineY1);
    var dx = xB - xA;
    var dy = yB - yA;
    var len = Math.sqrt(dx * dx + dy * dy);
    var ang = Math.atan2(dy, dx) * 180 / Math.PI;
    line.style.left = xA + 'px';
    line.style.top = ((yA + yB) / 2) + 'px';
    line.style.width = len + 'px';
    line.style.transform = 'rotate(' + ang.toFixed(2) + 'deg)';
    var topMid = py((fitGeom.lineY0 + fitGeom.lineY1) / 2 + fitGeom.bandTop);
    var botMid = py((fitGeom.lineY0 + fitGeom.lineY1) / 2 + fitGeom.bandBot);
    var thick = Math.max(4, botMid - topMid);
    var lineMid = (yA + yB) / 2;
    band.style.left = xA + 'px';
    band.style.top = (lineMid - thick / 2) + 'px';
    band.style.width = len + 'px';
    band.style.height = thick + 'px';
    band.style.transform = 'rotate(' + ang.toFixed(2) + 'deg)';
  }

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row, DATA.model);
    var agrees = recomputed === row.implied_value_usd;
    var catFit = categoryFitFor(row.category || 'Other');
    var adj = row.category_adjustment;
    var adjText = row.adjustment_source === 'category' && catFit
      ? 'The curve is tilted ' + (adj >= 0 ? '+' : '') + adj.toFixed(2) + ' in log points by ' + (row.category || 'Other') + ', from the median residual of its ' + row.adjustment_n + ' live protocol' + (row.adjustment_n === 1 ? '' : 's') + ' in this snapshot, shrunk toward the curve because the count is small.'
      : 'No live protocol in ' + (row.category || 'Other') + ' in this snapshot, so the curve alone prices it, with no category tilt.';
    var whyText = 'Growth ' + fmtPct(row.change_7d) + ' against a ' + (row.category || 'Other') + ' median of ' + fmtPct(row.growth_median_pct) + '; ' + fmtAge(row.age_days) + ' with no token on record; live on ' + (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + '.';
    var rangeText = 'The middle half of the curve\u2019s own out-of-sample errors puts this launch between ' + fmtUsd(row.range_low_usd) + ' and ' + fmtUsd(row.range_high_usd) + '.';
    var netText = 'The farm plan spends about $' + row.total_fees_usd + ' in bridge fees and gas, so the airdrop has to hand you 1 in ' + (row.breakeven_share > 0 ? Math.round(1 / row.breakeven_share).toLocaleString('en-US') : '1') + ' of the launch value to cover the fees. Verdict: ' + row.net_verdict + '.';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + '  ·  ' + (row.on_watchlist ? 'Watchlist' : 'Early find') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'breakdown' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Fitted multiple' }), el('b', { text: row.fitted_multiple.toFixed(2) + 'x' })),
        el('div', null, el('span', { text: 'Category tilt (log pts)' }), el('b', { text: (row.category_adjustment >= 0 ? '+' : '') + row.category_adjustment.toFixed(2) + ' (n=' + row.adjustment_n + ')' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth vs category median' }), el('b', { text: fmtPct(row.growth_relative_pct) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { text: String((row.chains || []).length) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { text: String(row.breadth_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'P25–P75 range' }), el('b', { text: fmtUsd(row.range_low_usd) + ' – ' + fmtUsd(row.range_high_usd) })),
        el('div', null, el('span', { text: 'Plan fees' }), el('b', { text: '$' + row.total_fees_usd })),
        el('div', null, el('span', { text: 'Net verdict' }), el('b', { text: row.net_verdict }))
      ),
      el('p', { class: 'fine', text: adjText }),
      el('p', { class: 'fine', text: whyText }),
      el('p', { class: 'fine', text: rangeText }),
      el('p', { class: 'fine', text: netText }),
      el('p', { class: 'fine', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (agrees ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, (row.farm_steps || []).map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(el('p', { class: 'fine', text: 'The snapshot records no token for this protocol. That is the record, not proof it has none: a token may exist that the record does not carry.' }));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Source: ' + DATA.source + '.' }),
      el('p', { text: 'Implied value is this entry\u2019s model of what a token would be worth if the protocol\u2019s record stayed as it is. It does not predict whether or when a token is issued.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'wrap' });
    shell.appendChild(header());
    shell.appendChild(hero());
    shell.appendChild(fitPanel());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre' ? boardTable() : liveTable());
    shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    layoutFitLine();
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
    else if (dialog.open) dialog.close();
  }

  // A hash change (back/forward, or a link to a filtered view) re-reads the state and re-renders.
  window.addEventListener('hashchange', function () {
    state.q = '';
    state.category = 'all';
    state.chain = 'all';
    state.watchOnly = false;
    state.tab = 'pre';
    state.selected = null;
    readHash();
    render();
  });

  readHash();
  render();
})();
