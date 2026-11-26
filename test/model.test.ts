import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  MODEL,
  MODEL_VERSION,
  SnapshotError,
  boardIssue,
  bridgeUsd,
  buildBoard,
  buildRadar,
  chainBridgeUsd,
  chainGasUsd,
  farmChain,
  farmSteps,
  fitLaunchCurve,
  fitSet,
  gasUsd,
  huberFit,
  impliedValue,
  liveRows,
  median,
  olsFit,
  parseSnapshot,
  spearmanRank,
  totalFeesUsd,
  validateFit,
  type Snapshot,
  type SnapshotProtocol,
} from '../lib/model.ts';

function makeProtocol(overrides: Partial<SnapshotProtocol> & { slug: string; name: string }): SnapshotProtocol {
  return {
    category: 'Dexs',
    chains: ['Ethereum', 'Base'],
    tvl_usd: 10_000_000,
    change_7d: 5,
    mcap_usd: null,
    listed_at: '2025-01-15',
    gecko_id: null,
    symbol: null,
    ...overrides,
  };
}

function buildSyntheticSnapshot(): Snapshot {
  const categories = ['Dexs', 'Lending', 'Yield', 'Derivatives', 'CDP', 'Curator', 'Bridge'];
  const chainSets = [
    ['Ethereum', 'Arbitrum', 'Base'],
    ['Ethereum', 'Solana'],
    ['Base', 'Optimism'],
    ['Ethereum'],
    ['Solana'],
    ['Arbitrum', 'Polygon', 'Scroll'],
    [],
  ];
  const protocols: SnapshotProtocol[] = [];
  const watchlist: string[] = [];

  // 40 watchlist pre-token protocols (>= $50M floor)
  for (let i = 0; i < 40; i++) {
    const slug = `watch-${String(i).padStart(2, '0')}`;
    watchlist.push(slug);
    const cat = i === 0 ? 'Bridge' : categories[i % categories.length]!;
    protocols.push(
      makeProtocol({
        slug,
        name: `Watch Protocol ${i}`,
        category: cat,
        chains: chainSets[i % chainSets.length]!,
        tvl_usd: 60_000_000 + i * 12_500_000,
        change_7d: i % 5 === 0 ? null : (i % 9) - 3,
        listed_at: i % 6 === 0 ? null : `2024-${String((i % 12) + 1).padStart(2, '0')}-10`,
      }),
    );
  }

  // 130 early pre-token protocols (< $50M floor) + 25 above-floor non-watchlist eligible = 155 more pre-token
  for (let i = 0; i < 155; i++) {
    const slug = `pre-${String(i).padStart(3, '0')}`;
    const aboveFloor = i >= 130;
    protocols.push(
      makeProtocol({
        slug,
        name: `Pre Launch ${i}`,
        category: categories[i % (categories.length - 1)]!, // non-Bridge so aboveFloor passes house rule
        chains: chainSets[i % chainSets.length]!,
        tvl_usd: aboveFloor ? 55_000_000 + (i - 130) * 3_000_000 : 1_000_000 + i * 320_000,
        change_7d: i % 7 === 0 ? null : ((i * 3) % 40) - 15,
        listed_at: i % 8 === 0 ? null : `2025-${String((i % 10) + 1).padStart(2, '0')}-01`,
      }),
    );
  }

  // Protocols that must be filtered out from ranking / house eligibility:
  protocols.push(
    makeProtocol({ slug: 'cex-pre', name: 'Sample CEX', category: 'CEX', tvl_usd: 500_000_000 }),
    makeProtocol({ slug: 'pool-v2', name: 'Alpha Pool V2', category: 'Dexs', tvl_usd: 120_000_000 }),
    makeProtocol({ slug: 'pool-v3', name: 'Beta Swap v3', category: 'Dexs', tvl_usd: 110_000_000 }),
    makeProtocol({ slug: 'pool-20', name: 'Gamma Vault 2.0', category: 'Yield', tvl_usd: 95_000_000 }),
    makeProtocol({ slug: 'wrapped-above', name: 'Wrapped Dollar', category: 'Yield', tvl_usd: 150_000_000 }),
    makeProtocol({ slug: 'staked-above', name: 'Staked Ether Vault', category: 'Yield', tvl_usd: 140_000_000 }),
    makeProtocol({ slug: 'binance-above', name: 'Binance Earn Clone', category: 'Yield', tvl_usd: 130_000_000 }),
    makeProtocol({ slug: 'bridge-above', name: 'NonWatch Bridge', category: 'Bridge', tvl_usd: 125_000_000 }),
  );

  // 60 live-token protocols: log10(mcap) ~= 3.2 + 0.5 * log10(tvl) + category noise + heavy-tailed outliers + CEX + ties
  for (let i = 0; i < 60; i++) {
    const slug = `live-${String(i).padStart(2, '0')}`;
    const isCex = i >= 57; // 3 CEX live tokens excluded from fitSet & liveRows
    const tvl = 5_000_000 * Math.pow(1.13, i % 40);
    const baseLogMcap = 3.2 + 0.5 * Math.log10(tvl) + ((i % 5) - 2) * 0.08;
    // Heavy-tailed outliers on indices 4, 19, 37
    const outlierShift = i === 4 ? 2.8 : i === 19 ? -2.4 : i === 37 ? 2.5 : 0;
    // Give live-55 and live-56 identical mcap & tvl to test slug tie-breaker
    const tied = i === 55 || i === 56;
    const mcap = tied ? 950_000_000 : Math.round(Math.pow(10, baseLogMcap + outlierShift));
    const finalTvl = tied ? 250_000_000 : Math.round(tvl);
    protocols.push(
      makeProtocol({
        slug,
        name: `Live Token ${i}`,
        category: isCex ? 'CEX' : categories[i % (categories.length - 1)]!,
        chains: chainSets[i % chainSets.length]!,
        tvl_usd: finalTvl,
        change_7d: i % 4 === 0 ? null : ((i * 7) % 30) - 12,
        mcap_usd: mcap,
        listed_at: '2023-06-01',
        gecko_id: slug,
        symbol: `LIV${i}`,
      }),
    );
  }

  return {
    as_of: '2026-11-14',
    source: 'synthetic-test-snapshot',
    floor_usd: 50_000_000,
    protocols,
    watchlist,
  };
}

describe('parseSnapshot', () => {
  it('parses valid snapshot and normalizes optional fields', () => {
    const snap = buildSyntheticSnapshot();
    const parsed = parseSnapshot(JSON.stringify(snap));
    assert.equal(parsed.as_of, '2026-11-14');
    assert.equal(parsed.watchlist.length, 40);
    assert.ok(parsed.protocols.length >= 250);
  });

  it('rejects malformed snapshots with SnapshotError', () => {
    assert.throws(() => parseSnapshot('{not-json'), SnapshotError);
    assert.throws(() => parseSnapshot('[]'), SnapshotError);
    assert.throws(() => parseSnapshot(JSON.stringify({ source: 'x', floor_usd: 1, protocols: [], watchlist: [] })), SnapshotError);
    assert.throws(
      () => parseSnapshot(JSON.stringify({ as_of: '2026-11-14', source: 'x', floor_usd: 0, protocols: [], watchlist: [] })),
      SnapshotError,
    );
    assert.throws(
      () =>
        parseSnapshot(
          JSON.stringify({
            as_of: '2026-11-14',
            source: 'x',
            floor_usd: 100,
            protocols: [{ slug: 'a', name: 'A', tvl_usd: Number.NaN }],
            watchlist: [],
          }),
        ),
      SnapshotError,
    );
  });
});

describe('statistics, fits, and edge-case guards', () => {
  it('guards median, olsFit, and huberFit for empty, singleton, and zero-variance inputs', () => {
    assert.equal(median([]), 0);
    assert.equal(median([7]), 7);
    assert.equal(median([10, 2, 6, 4]), 5);

    assert.deepEqual(olsFit([], []), [0, 0]);
    assert.deepEqual(huberFit([], []), [0, 0]);
    assert.deepEqual(olsFit([3], [4.5]), [4.5, 0]);
    assert.deepEqual(huberFit([3], [4.5]), [4.5, 0]);
    assert.deepEqual(olsFit([2, 2, 2], [1, 3, 5]), [3, 0]);
    const [ha, hb] = huberFit([2, 2, 2], [1, 3, 5]);
    assert.equal(hb, 0);
    assert.ok(Number.isFinite(ha));
  });

  it('keeps huberFit resistant to heavy-tailed outliers compared with olsFit', () => {
    const xs = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 8.2];
    const ys = xs.map((x, i) => (i === xs.length - 1 ? 2 + 0.5 * x + 6 : 2 + 0.5 * x));
    const [, olsSlope] = olsFit(xs, ys);
    const [huberInt, huberSlope] = huberFit(xs, ys);
    assert.ok(Math.abs(huberSlope - 0.5) < 0.05, `expected huberSlope near 0.5, got ${huberSlope}`);
    assert.ok(Math.abs(huberInt - 2.0) < 0.4, `expected huberInt near 2.0, got ${huberInt}`);
    assert.ok(Math.abs(olsSlope - 0.5) > Math.abs(huberSlope - 0.5));
  });

  it('computes spearmanRank accurately including ties and degenerate cases', () => {
    assert.equal(spearmanRank([], []), 0);
    assert.equal(spearmanRank([1], [2]), 0);
    assert.equal(spearmanRank([5, 5, 5], [1, 2, 3]), 0);
    assert.ok(Math.abs(spearmanRank([10, 20, 30, 40], [1, 2, 3, 4]) - 1) < 1e-12);
    assert.ok(Math.abs(spearmanRank([10, 20, 30, 40], [4, 3, 2, 1]) + 1) < 1e-12);

    // Ties: xs=[1, 2, 2, 4] -> ranks [1, 2.5, 2.5, 4]; ys=[10, 20, 30, 40] -> ranks [1, 2, 3, 4]
    // mean=2.5; dx=[-1.5, 0, 0, 1.5], dy=[-1.5, -0.5, 0.5, 1.5]
    // sxy=4.5, sxx=4.5, syy=5 -> 4.5 / sqrt(22.5) = 3 / sqrt(10)
    const r = spearmanRank([1, 2, 2, 4], [10, 20, 30, 40]);
    assert.ok(Math.abs(r - 3 / Math.sqrt(10)) < 1e-12);
  });

  it('handles tiny fitSet (n < 2) without NaN or crashes', () => {
    const emptySnap: Snapshot = {
      as_of: '2026-11-14',
      source: 'tiny',
      floor_usd: 50_000_000,
      protocols: [makeProtocol({ slug: 'only-pre', name: 'Only Pre' })],
      watchlist: ['only-pre'],
    };
    const fit0 = fitLaunchCurve(emptySnap);
    const val0 = validateFit(emptySnap);
    assert.equal(fit0.n, 0);
    assert.equal(fit0.slope, 0);
    assert.equal(val0.loo_spearman, 0);
    assert.equal(val0.loo_mdape_pct, 0);

    const oneLiveSnap: Snapshot = {
      ...emptySnap,
      protocols: [
        ...emptySnap.protocols,
        makeProtocol({ slug: 'one-live', name: 'One Live', tvl_usd: 10_000_000, mcap_usd: 25_000_000, gecko_id: 'one', symbol: 'ONE' }),
      ],
    };
    const fit1 = fitLaunchCurve(oneLiveSnap);
    const val1 = validateFit(oneLiveSnap);
    assert.equal(fit1.n, 1);
    assert.equal(fit1.slope, 0);
    assert.ok(Number.isFinite(fit1.intercept));
    assert.equal(val1.loo_spearman, 0);

    const board1 = buildBoard(oneLiveSnap);
    assert.ok(board1[0]!.model.range_high_usd >= board1[0]!.model.range_low_usd);
    assert.ok(board1[0]!.model.range_low_usd >= 1);
  });
});

describe('fitLaunchCurve, validateFit, impliedValue, and farm routing', () => {
  it('computes loo_spearman in [-1, 1] and matches page recompute exactly', () => {
    const snap = buildSyntheticSnapshot();
    const fit = fitLaunchCurve(snap);
    const val = validateFit(snap);
    assert.equal(fit.n, fitSet(snap).length);
    assert.equal(fit.n, 57); // 60 live minus 3 CEX
    assert.ok(val.loo_spearman >= -1 && val.loo_spearman <= 1);
    assert.ok(val.loo_spearman > 0.3, `expected positive loo_spearman on synthetic curve, got ${val.loo_spearman}`);
    assert.ok(val.backtest_n > 0);

    const { board, radar } = buildRadar(snap);
    assert.equal(radar.model_version, MODEL_VERSION);
    assert.deepEqual(buildBoard(snap), board);

    // Page recompute parity check (mirrors dashboard/app.js impliedOf)
    const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
    for (const row of radar.rows) {
      const growthMult = round4(1 + (row.growth_relative_pct / 100) * MODEL.growth_weight);
      const age = row.age_days ?? MODEL.unknown_age_days;
      const maturity = round4(
        MODEL.maturity_floor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range,
      );
      const extra = Math.min(Math.max(row.chains.length - 1, 0), MODEL.breadth_max_extra);
      const breadth = round4(1 + extra * MODEL.breadth_per_chain);
      const recomputed = Math.max(1, Math.round(row.tvl_usd * row.fitted_multiple * growthMult * maturity * breadth));
      assert.equal(recomputed, row.implied_value_usd, `implied parity failed for ${row.slug}`);
      assert.ok(row.range_high_usd >= row.range_low_usd && row.range_low_usd >= 1);
    }

    // Verify impliedValue direct call matches too
    const growthMedians = { byCategory: new Map<string, number>(), global: radar.global_growth_median };
    const sample = snap.protocols[0]!;
    const direct = impliedValue(sample, snap.as_of, MODEL, fit, growthMedians);
    assert.ok(direct.implied >= 1);
  });

  it('routes farmChain to lowest-cost chain, avoids duplicate secondLegFor, and fixes bridge Step 1', () => {
    assert.equal(chainGasUsd('Solana'), 0.1);
    assert.equal(chainBridgeUsd('Solana'), 1);
    assert.equal(chainGasUsd('Ethereum'), 5);
    assert.equal(chainBridgeUsd('Ethereum'), 12);
    assert.equal(chainGasUsd('Base'), 1);
    assert.equal(chainBridgeUsd('Base'), 2);
    assert.equal(chainGasUsd('Robinhood Chain'), 1);
    assert.equal(chainBridgeUsd('UnknownChain'), 3);

    const ethSolBase = makeProtocol({ slug: 'a', name: 'MultiSol', chains: ['Ethereum', 'Base', 'Solana'] });
    assert.equal(farmChain(ethSolBase), 'Solana');
    assert.equal(gasUsd(ethSolBase), 0.1);
    assert.equal(bridgeUsd(ethSolBase), 1);

    const ethArbBase = makeProtocol({ slug: 'b', name: 'MultiL2', chains: ['Ethereum', 'Arbitrum', 'Base'] });
    assert.equal(farmChain(ethArbBase), 'Arbitrum'); // tie Arbitrum vs Base -> stable first
    const stepsL2 = farmSteps(ethArbBase, 200, 50_000_000);
    assert.equal(stepsL2.length, 9);
    // Step 5 (secondLegFor) must pick Base (cheapest other != Arbitrum), not Arbitrum!
    assert.ok(stepsL2[4]!.text.includes('on Base,'), `expected second leg on Base, got: ${stepsL2[4]!.text}`);
    assert.ok(stepsL2[4]!.text.includes('not tied to Arbitrum alone'));

    // Duplicate chain edge case: should not duplicate primary chain in secondLegFor
    const dupChains = makeProtocol({ slug: 'dup', name: 'DupChain', chains: ['Base', 'Base'], category: 'Dexs' });
    const stepsDup = farmSteps(dupChains, 200, 50_000_000);
    assert.ok(stepsDup[4]!.text.includes('second pool'), `expected fallback to second pool, got: ${stepsDup[4]!.text}`);

    // Empty chains fallback
    const noChains = makeProtocol({ slug: 'none', name: 'NoChain', chains: [] });
    assert.equal(farmChain(noChains), 'its main chain');
    assert.equal(totalFeesUsd(noChains, null), 21); // bridge 3 + gas 2 * (2 + ceil(45 / 7))

    // Bridge and Cross Chain Step 1 must not double-bridge
    const bridgeProto = makeProtocol({ slug: 'br', name: 'FastBridge', category: 'Bridge', tvl_usd: 25_000_000, chains: ['Ethereum', 'Base'] });
    const bridgeSteps = farmSteps(bridgeProto, 120, 80_000_000);
    assert.ok(bridgeSteps[0]!.text.includes('prepare $100 of USDC on a source chain to bridge onto Base through FastBridge'));
    assert.ok(!bridgeSteps[0]!.text.includes('official bridge'));
    const crossSteps = farmSteps(makeProtocol({ slug: 'cc', name: 'CrossHop', category: 'Cross Chain', chains: ['Ethereum', 'Arbitrum'] }), 120, 80_000_000);
    assert.ok(crossSteps[0]!.text.includes('prepare $50 of USDC on a source chain to bridge onto Arbitrum through CrossHop'));
    for (const s of [...bridgeSteps, ...crossSteps]) {
      assert.ok(s.text.length >= 20 && s.text.length <= 600);
    }
  });

  it('passes boardIssue gate, excludes CEX/versioned/house-ineligible, and sorts liveRows deterministically', () => {
    const snap = buildSyntheticSnapshot();
    const { board, radar } = buildRadar(snap);
    assert.equal(boardIssue(board, snap), null);
    assert.equal(radar.watchlist_size, 40);
    assert.equal(board.filter((r) => r.on_watchlist).length, 40);

    const slugs = new Set(board.map((r) => r.slug));
    for (const excluded of ['cex-pre', 'pool-v2', 'pool-v3', 'pool-20', 'wrapped-above', 'staked-above', 'binance-above', 'bridge-above']) {
      assert.ok(!slugs.has(excluded), `expected ${excluded} to be excluded from board`);
    }
    for (const row of board) {
      assert.equal(row.model.farm_chain, farmChain(snap.protocols.find((p) => p.slug === row.slug)!));
      for (const step of row.farm_steps) {
        assert.ok(step.length >= 20 && step.length <= 600);
      }
    }
    for (let i = 0; i < board.length; i++) {
      assert.equal(board[i]!.model.farm_chain, radar.rows[i]!.farm_chain);
    }

    const live = liveRows(snap);
    assert.ok(live.every((r) => r.category !== 'CEX'));
    const idx55 = live.findIndex((r) => r.slug === 'live-55');
    const idx56 = live.findIndex((r) => r.slug === 'live-56');
    assert.ok(idx55 >= 0 && idx56 === idx55 + 1, 'expected live-55 before live-56 on tie');
  });
});

describe('main.ts end-to-end determinism and CLI hardening', () => {
  it('writes byte-identical output across two runs, supports directory --input, cleans stale files, and fails on missing flag values', () => {
    const root = mkdtempSync(join(tmpdir(), 'token-radar-test-'));
    try {
      const snap = buildSyntheticSnapshot();
      const inputDir = join(root, 'input');
      const snapFile = join(inputDir, 'snapshot.json');
      const out1 = join(root, 'out1');
      const out2 = join(root, 'out2');
      mkdirSync(inputDir, { recursive: true });
      writeFileSync(snapFile, JSON.stringify(snap));

      // Seed a stale file in out1/screenshots to verify copyDir cleans destination first
      mkdirSync(join(out1, 'screenshots'), { recursive: true });
      writeFileSync(join(out1, 'screenshots', 'stale-extra.png'), 'stale');

      const repoRoot = resolve(import.meta.dirname, '..');
      execFileSync(process.execPath, ['main.ts', '--input', snapFile, '--output', out1], { cwd: repoRoot });
      execFileSync(process.execPath, ['main.ts', `--input=${inputDir}`, `--output=${out2}`], { cwd: repoRoot });

      for (const file of ['board.json', 'data.js', 'dossier.json']) {
        const b1 = readFileSync(join(out1, file));
        const b2 = readFileSync(join(out2, file));
        assert.ok(b1.equals(b2), `${file} differed between two runs`);
      }

      const staleCheck = spawnSync(process.execPath, ['-e', `process.exit(require('node:fs').existsSync(${JSON.stringify(join(out1, 'screenshots', 'stale-extra.png'))}) ? 1 : 0)`]);
      assert.equal(staleCheck.status, 0, 'stale file in output screenshots/ should be removed');

      // Missing flag value checks
      const missingEnd = spawnSync(process.execPath, ['main.ts', '--input'], { cwd: repoRoot, encoding: 'utf8' });
      assert.notEqual(missingEnd.status, 0);
      assert.match(missingEnd.stderr, /--input requires a value/);

      const missingBeforeFlag = spawnSync(process.execPath, ['main.ts', '--input', '--output', out1], { cwd: repoRoot, encoding: 'utf8' });
      assert.notEqual(missingBeforeFlag.status, 0);
      assert.match(missingBeforeFlag.stderr, /--input requires a value/);

      const missingGlued = spawnSync(process.execPath, ['main.ts', `--input=${snapFile}`, '--output='], { cwd: repoRoot, encoding: 'utf8' });
      assert.notEqual(missingGlued.status, 0);
      assert.match(missingGlued.stderr, /--output requires a value/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
