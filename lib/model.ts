// Token Radar's value model (radar-3): a sealed DefiLlama snapshot in, a ranked board out.
//
// The board ranks every protocol in the snapshot that records no token and is not a centralised
// exchange or a versioned pool of another protocol. The snapshot's own watchlist (40 protocols at
// or above the $50M floor) is the floor, never the ceiling: the early radar adds every further
// pre-token protocol below the floor, by the same rule, plus the genuine launches above the floor
// the watchlist leaves out (the house's own rule, applied to the snapshot: no wrapped, staked or
// bridged product, no bridge or liquid-staking category, no exchange-prefixed name). Protocols
// whose token already trades are kept apart in the live view, shown at their market cap, never
// mixed into the ranking.
//
// A protocol "records no token" when its snapshot entry carries no market cap, no CoinGecko id
// and no symbol. That is what the snapshot says; it is not proof the protocol has no token.
//
// Implied value follows only from the snapshot's own figures. The model is anchored to what the
// market already pays: for each category, the median market-cap-to-TVL ratio of the snapshot's
// own live-token protocols (at least three of them, else the global median across all live
// protocols). A launch is then worth that multiple of the protocol's TVL, tilted by how its
// seven-day growth compares with its own category's median growth, by how long it has run with
// no token, and by how many chains it reaches:
//
//   multiple   = median(mcap_usd / tvl_usd) over live protocols of the category (n >= 3),
//                else the global median over all live protocols; clamped to [0.03, 1.50]
//   base       = tvl_usd x multiple
//   relative   = clamp(change_7d - category median change_7d, -30, +40) per cent;
//                missing growth counts as the category median, so relative is 0
//   growth x   = 1 + relative / 100 x 0.8
//   age        = days from listed_at to as_of; missing age counts as 365
//   maturity x = 0.60 + min(age, 1095) / 1095 x 0.55
//   breadth x  = 1 + 0.04 x min(chains - 1, 5), floored at 0 chains extra
//   implied    = max(1, round(base x growth x x maturity x x breadth x))
//
// Why each factor: the market multiple is what a token is actually worth per dollar locked in
// that line of business, read off the protocols that already trade — a DEX is not a lender and
// the market does not price them alike. Relative growth tilts the value toward protocols gaining
// share against their own peers and away from shrinking ones, in a week when nearly everything
// fell, so the comparison is against the category, not against zero. Age with no token is the
// waiting time the market has already priced in: a protocol that has run three years without a
// token has more pent-up launch value than one listed last month. Chain breadth rewards
// distribution: a protocol live on several chains reaches more wallets at launch than a
// single-chain one, capped at five extra chains so a protocol on a hundred chains does not run
// away with the board. No protocol name is ever special-cased: the same function scores every
// row, and the multiples are computed from the snapshot at run time, never written in by hand.

/** One protocol entry of the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole sealed snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_rel_floor: number;
  growth_rel_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_extra: number;
  multiple_min: number;
  multiple_max: number;
  multiple_min_live: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.8,
  growth_rel_floor: -30,
  growth_rel_cap: 40,
  maturity_floor: 0.6,
  maturity_range: 0.55,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_per_chain: 0.04,
  breadth_max_extra: 5,
  multiple_min: 0.03,
  multiple_max: 1.5,
  multiple_min_live: 3,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** The most early rows the board carries; the snapshot holds fewer, so the cap never binds. */
export const EARLY_LIMIT = 200;

/** How many live-token protocols the dashboard's live view carries, by market cap. */
export const LIVE_LIMIT = 24;

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    multiple_source: 'live' | 'global';
    growth_pct: number;
    growth_median_pct: number;
    growth_relative_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** One row as the dashboard reads it: the board's row, farm plan included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  on_watchlist: boolean;
  category_multiple: number;
  multiple_source: 'live' | 'global';
  growth_median_pct: number;
  growth_relative_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A protocol whose token already trades: the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's market multiple, read off its live-token protocols. */
export interface CategoryMultiple {
  category: string;
  median: number;
  n: number;
}

/** Everything the dashboard renders: the board, the live set, and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  multiples: CategoryMultiple[];
  global_multiple: number;
  global_growth_median: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why a snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, never below zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The market multiples, computed from the snapshot's own live-token protocols: for each
 * category with at least `multiple_min_live` live protocols carrying both a market cap and a
 * TVL, the median market-cap-to-TVL ratio; plus the global median over every live protocol.
 * A category with too few live protocols falls back to the global median at scoring time.
 */
export function categoryMultiples(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { byCategory: Map<string, CategoryMultiple>; global: number } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  const global = all.length > 0 ? median(all) : 0.2;
  const out = new Map<string, CategoryMultiple>();
  for (const [category, values] of byCategory) {
    if (values.length < model.multiple_min_live) continue;
    const m = Math.min(model.multiple_max, Math.max(model.multiple_min, median(values)));
    out.set(category, { category, median: round4(m), n: values.length });
  }
  return { byCategory: out, global: round4(global) };
}

/**
 * The median seven-day TVL change of the snapshot's pre-token protocols, per category and
 * globally: the peer growth each protocol's own growth is measured against.
 */
export function categoryGrowthMedians(snapshot: Snapshot): { byCategory: Map<string, number>; global: number } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (!isPreToken(p) || p.change_7d === null) continue;
    all.push(p.change_7d);
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(p.change_7d);
    byCategory.set(key, list);
  }
  const global = all.length > 0 ? median(all) : 0;
  const out = new Map<string, number>();
  for (const [category, values] of byCategory) {
    if (values.length < MODEL.multiple_min_live) continue;
    out.set(category, round4(median(values)));
  }
  return { byCategory: out, global: round4(global) };
}

/** The factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  multiples: { byCategory: Map<string, CategoryMultiple>; global: number },
  growthMedians: { byCategory: Map<string, number>; global: number },
): {
  implied: number;
  categoryMultiple: number;
  multipleSource: 'live' | 'global';
  growthPct: number;
  growthMedianPct: number;
  growthRelativePct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const key = protocol.category ?? 'Other';
  const live = multiples.byCategory.get(key);
  const categoryMultiple = live !== undefined ? live.median : multiples.global;
  const multipleSource: 'live' | 'global' = live !== undefined ? 'live' : 'global';
  const growthPct = round4(finite(protocol.change_7d, 0));
  const growthMedianPct = growthMedians.byCategory.get(key) ?? growthMedians.global;
  const growthRelativePct =
    protocol.change_7d === null
      ? 0
      : round4(Math.min(model.growth_rel_cap, Math.max(model.growth_rel_floor, protocol.change_7d - growthMedianPct)));
  const growthMult = 1 + (growthRelativePct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_extra);
  const breadthMult = 1 + extraChains * model.breadth_per_chain;
  const base = protocol.tvl_usd * categoryMultiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return { implied, categoryMultiple, multipleSource, growthPct, growthMedianPct, growthRelativePct, growthMult, maturityMult, breadthMult, age };
}

/** A name ending in a release marker (V2, v3, 2.0): a pool of another protocol, not a launch. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether the snapshot records no token for a protocol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol may be ranked: it records no token, is not a centralised exchange, and is
 * not a versioned pool. Wrapped, staked and bridged products above the watchlist floor are kept
 * out by the watchlist itself, which the board takes as given; below the floor the same rule
 * applies to every row the radar adds.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Categories the house's watchlist rule keeps out: wrapped, staked or bridged products. */
const HOUSE_EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a watchlist protocol's name never begins with, per the house's rule. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A whole word that marks a name a wrapped or staked product of a token that trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * Whether a protocol passes the house's own watchlist rule, as the snapshot's RULES.txt states
 * it: not a wrapped, staked or bridged product, its category not one the rule excludes, its name
 * not ending in a version marker, carrying no whole word wrapped, staked or staking, and not
 * beginning with an exchange's name. Used for the genuine launches above the floor the watchlist
 * leaves out; the watchlist itself is taken as given.
 */
export function isHouseEligible(p: SnapshotProtocol): boolean {
  if (p.category !== null && HOUSE_EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The snapshot's protocols by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** Four-decimal rounding for the multipliers the board and the page both show. */
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The protocols the board ranks, most valuable first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor, by TVL, capped.
  // A chosen protocol stays chosen; the cap is a guard, not a target.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_LIMIT);
  for (const p of early) chosen.set(p.slug, p);
  // Above the floor, the watchlist leaves genuine launches out: add the ones that pass the
  // house's own rule, by TVL, so the board holds the whole pre-token universe it can defend.
  const above = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd >= snapshot.floor_usd && isHouseEligible(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of above) chosen.set(p.slug, p);

  const multiples = categoryMultiples(snapshot, model);
  const growthMedians = categoryGrowthMedians(snapshot);
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, multiples, growthMedians);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    on_watchlist: snapshot.watchlist.includes(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: s.categoryMultiple,
      multiple_source: s.multipleSource,
      growth_pct: s.growthPct,
      growth_median_pct: s.growthMedianPct,
      growth_relative_pct: s.growthRelativePct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

// ---------------------------------------------------------------- farm plans

/** A step as one string: action, cost and time, inside the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and check the protocol's own page before withdrawing.`;
  return s;
}

/** The protocol's main chain, or a neutral phrase when it names none. */
function mainChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on the protocol's main chain, from its own chains field. */
function gasNote(p: SnapshotProtocol): string {
  const chain = (p.chains[0] ?? '').toLowerCase();
  if (chain === 'ethereum') return 'about $5 of gas';
  if (chain === 'solana') return 'under $0.10 of gas';
  if (
    chain === 'base' ||
    chain === 'arbitrum' ||
    chain === 'optimism' ||
    chain === 'polygon' ||
    chain === 'binance' ||
    chain === 'avalanche' ||
    chain === 'linea' ||
    chain === 'zksync' ||
    chain === 'scroll' ||
    chain === 'blast'
  ) {
    return 'under $1 of gas';
  }
  return 'about $2 of gas';
}

/** What bridging funds onto the protocol's main chain costs, from its own chains field. */
function bridgeNote(p: SnapshotProtocol): string {
  const chain = (p.chains[0] ?? '').toLowerCase();
  if (chain === 'ethereum') return 'about $12 in bridge fees and gas';
  if (chain === 'solana') return 'under $1 in bridge fees and gas';
  if (
    chain === 'base' ||
    chain === 'arbitrum' ||
    chain === 'optimism' ||
    chain === 'polygon' ||
    chain === 'binance' ||
    chain === 'avalanche' ||
    chain === 'linea' ||
    chain === 'zksync' ||
    chain === 'scroll' ||
    chain === 'blast'
  ) {
    return 'about $2 in bridge fees and gas';
  }
  return 'about $3 in bridge fees and gas';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 20_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols need a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in words a reader can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} and borrow a small amount against it, then repay the borrow before the snapshot window ends.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('farm')) {
    return `Add $${capital} of liquidity to ${name}'s largest pool on ${chain} and keep the position open through the next fee cycle.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Bridge $${capital} of USDC into ${chain} through ${name}, then use the bridged funds inside its app instead of bridging straight back.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} and hold the receipt token it issues until the lock window passes.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade, then close it before funding eats the position.`;
  }
  if (c.includes('prediction')) {
    return `Fund your account with $${capital} on ${name} and take one position in a market that settles within the month.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('asset management')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and hold the vault shares while the curator reallocates.`;
  }
  if (c.includes('stable')) {
    return `Mint or hold $${capital} of the stable asset ${name} issues on ${chain} and keep it in the protocol's own app.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it through one full yield period.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active past the next renewal.`;
  }
  if (c.includes('yield')) {
    return `Deposit $${capital} into ${name}'s highest-TVL strategy on ${chain} and keep it earning through one harvest.`;
  }
  if (c.includes('payment')) {
    return `Send $${capital} through ${name} on ${chain} as a real payment, then keep the account funded for the next one.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** What to verify on the protocol's own rewards page, shaped by the category. */
function eligibilityFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('dex') || c.includes('farm')) {
    return `Open ${name}'s points page and check the pool shows your liquidity and its fee tier, then note the snapshot cadence it publishes.`;
  }
  if (c.includes('lend') || c.includes('cdp')) {
    return `Open ${name}'s rewards page and check the supply shows as active, the borrow stays well under the liquidation line, and the points accrue.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Open ${name}'s activity page and check the bridge run shows as complete with its volume counted, not merely started.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Open ${name}'s staking page and check the receipt token is in your wallet and the stake shows as locked, not pending.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('prediction')) {
    return `Open ${name}'s rewards page and check the trade history lists your closed trade and its volume, not only the open one.`;
  }
  return `Open ${name}'s points or rewards page and check the position is listed as qualifying, then note the snapshot cadence it publishes.`;
}

/** The weekly habit that keeps the position qualifying, shaped by the category. */
function weeklyFor(p: SnapshotProtocol, capital: number): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const weekly = Math.max(10, Math.round(capital / 10));
  if (c.includes('dex') || c.includes('farm')) {
    return `Swap $${weekly} through ${name} each week and add or remove a little liquidity, so the pool keeps seeing fresh flow.`;
  }
  if (c.includes('lend') || c.includes('cdp')) {
    return `Adjust the supply or the borrow on ${name} by about $${weekly} each week so the position shows fresh activity instead of one stale deposit.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('prediction')) {
    return `Place one small trade of about $${weekly} on ${name} each week and close it, rather than leaving a single trade untouched.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Move about $${weekly} through ${name} each week instead of using it once and never returning.`;
  }
  return `Do one qualifying action on ${name} each week worth about $${weekly}: a deposit, a swap, a vote or a claim, whatever the app offers.`;
}

/** A second leg inside the same protocol, on its second chain or its second feature. */
function secondLegFor(p: SnapshotProtocol, capital: number): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const chain = mainChain(p);
  const second = Math.max(25, Math.round(capital / 2));
  if (p.chains.length > 1) {
    const other = p.chains[1]!;
    return `Open the same kind of position with $${second} on ${other}, the protocol's second chain, so the farm is not tied to ${chain} alone.`;
  }
  if (c.includes('dex') || c.includes('farm')) {
    return `Add $${second} of liquidity to a second pool on ${name} on ${chain}, in a different pair, so the farm is not tied to one pool.`;
  }
  if (c.includes('lend') || c.includes('cdp')) {
    return `Supply $${second} of a second asset to ${name} on ${chain}, so the farm is not tied to one market.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('asset management')) {
    return `Deposit $${second} into a second ${name} vault on ${chain}, in a different strategy, so the farm is not tied to one curator.`;
  }
  return `Use a second feature of ${name} on ${chain} with about $${second}: a swap, a vote or a claim the app offers.`;
}

/** How to unwind, in the order that does not strand funds, shaped by the category. */
function exitFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const chain = mainChain(p);
  if (c.includes('lend') || c.includes('cdp')) {
    return `Unwind ${name} on ${chain} in order: repay any borrow first, then withdraw the supply, and only then move the funds off the chain.`;
  }
  if (c.includes('dex') || c.includes('farm')) {
    return `Unwind ${name} on ${chain} in order: remove the liquidity, swap the pair tokens back to one asset, and only then move the funds off the chain.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Unwind ${name} on ${chain} in order: start the unstake and wait out its delay, then claim the receipt token's underlying and move it off the chain.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Unwind ${name} on ${chain} in order: use the funds inside the destination app first, then bridge the remainder back in one run instead of many small ones.`;
  }
  return `Unwind ${name} on ${chain} in order: claim any rewards first, then withdraw the position, and only then move the funds off the chain.`;
}

/** The risk this category carries, in one line a reader can act on. */
function riskFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp')) return `Watch the liquidation line on ${name}: a sharp price move can liquidate the borrow before you notice.`;
  if (c.includes('dex') || c.includes('farm')) return `Watch impermanent loss on ${name}: if the pair drifts far, the position can be worth less than holding the tokens.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Watch bridge risk on ${name}: a bridge holds your funds in its own contracts while the transfer settles.`;
  if (c.includes('staking') || c.includes('restak')) return `Watch the unstake delay on ${name}: the receipt token can trade below its underlying while the lock runs.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Watch funding on ${name}: a leveraged trade held for weeks can lose more to funding than it gains on price.`;
  if (c.includes('rwa')) return `Watch issuer risk on ${name}: the yield-bearing asset is only as sound as the issuer and custodian behind it.`;
  if (c.includes('stable')) return `Watch the peg on ${name}: a stable asset that slips from its peg can take the position down with it.`;
  if (c.includes('insurance')) return `Watch the cover terms on ${name}: a policy pays only for the events its wording names.`;
  return `Watch smart-contract risk on ${name}: the position is only as safe as the contracts that hold it.`;
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = mainChain(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasNote(p);
  const bridge = bridgeNote(p);
  const ageText = age === null ? 'an unlisted age' : `${age} days old`;
  return [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm, and move $${capital} of USDC onto ${chain} through its official bridge, to farm ${p.name}.`,
      cost: `${bridge}, plus ${gas} for the first transaction`,
      time: '20 to 30 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: eligibilityFor(p),
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: weeklyFor(p, capital),
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: secondLegFor(p, capital),
      cost: `$${Math.max(25, Math.round(capital / 2))} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: `Hold the position for at least ${hold} days: ${p.name} is ${ageText} with no token on record, so a ${hold}-day window is counted in more than one snapshot instead of one.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before withdrawing, open the protocol's own points or rewards page and claim only from the link it publishes; never pay anyone to claim for you. ${exitFor(p)}`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Write the wallet address, the dates and every transaction hash in a farm log, so you can repeat the position or unwind it without guessing. ${riskFor(p)}`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

// ---------------------------------------------------------------- live set, dashboard data, parsing, gate

/** The live-token protocols, by market cap, for the dashboard's live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_LIMIT)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, farm plan included so the page and board.json agree. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    on_watchlist: row.on_watchlist,
    category_multiple: row.model.category_multiple,
    multiple_source: row.model.multiple_source,
    growth_median_pct: row.model.growth_median_pct,
    growth_relative_pct: row.model.growth_relative_pct,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.on_watchlist).length;
  const multiples = categoryMultiples(snapshot, model);
  const growthMedians = categoryGrowthMedians(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    multiples: [...multiples.byCategory.values()].sort((a, b) => b.median - a.median || (a.category < b.category ? -1 : 1)),
    global_multiple: multiples.global,
    global_growth_median: growthMedians.global,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json has no floor_usd');
  }
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  }
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/**
 * Why a board is not one the gate will take, or null: coverage, slug uniqueness, ranks, order,
 * one shared implied value, and farm steps.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows, outside 100..4000`;
  const slugs = new Set<string>();
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) {
    if (!known.has(r.slug)) return `${r.slug} is not a protocol in the snapshot`;
    if (slugs.has(r.slug)) return `${r.slug} appears twice on the board`;
    slugs.add(r.slug);
    if (typeof r.name !== 'string' || r.name.length === 0) return `${r.slug} has no name`;
  }
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** The dashboard's whole dataset as one script: no fetch, no network, read beside the page. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
