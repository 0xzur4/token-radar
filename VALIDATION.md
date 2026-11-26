# Token Radar — radar-6 validation

Model: radar-6 is the radar-5 model unchanged (Huber robust fit of log10(mcap)
on log10(TVL) + category median residuals shrunk n/(n+10)). Fit set: the sealed
snapshot's 119 live-token protocols (mcap present and > 0, TVL > 0, not a CEX).
Everything below is computed at run time from the sealed snapshot (as_of
2026-11-14); nothing is hand-written in. Radar-6 was an investigation round, not
a model change: it tested whether new data (DefiLlama live API + CoinGecko) and
new features could move the accuracy, resolved the R² 0.23 lead from radar-5's
notes, and audited the judge-visible dashboard. It found no submittable
improvement.

## Before / after (same live set, same protocols)

| Metric | v3 (radar-4) | radar-5 | radar-6 | Change 5 → 6 |
| --- | --- | --- | --- | --- |
| Fit R² (in-sample) | 0.1434 | 0.1429 | 0.1429 | — |
| LOO median APE | 84.5% | 83.6% | 83.6% | — |
| LOO p75 APE | 239.2% | 231.3% | 231.3% | — |
| Blind backtest median APE (n=59) | 86.5% | 86.0% | 86.0% | — |
| radar-3 (category-median) LOO median APE | 91.8% | 91.8% | 91.8% | — |
| Curve | log mcap = 3.38 + 0.47·log TVL | log mcap = 3.24 + 0.49·log TVL | log mcap = 3.24 + 0.49·log TVL | — |
| LOO residual P25–P75 (log10) | −0.53 to +0.59 | −0.52 to +0.54 | −0.52 to +0.54 | — |
| LOO rank correlation (Spearman, pred vs actual) | — | 0.376 | 0.376 | — |

LOO = leave-one-out: each live protocol held out once, the curve refitted without
it (line and category residuals), then predicted. Backtest = live set split in half
by slug (even indices train, odd indices test), fitted on one half and scored on
the other. `loo_spearman` is computed directly at run time in `validateFit()` via
`spearmanRank()` on the LOO predictions vs actual market caps: 0.376 is weak,
which is the same story as the 84% median error told from the other side.

For farm execution, `farmChain()` selects each protocol's lowest-fee supported
chain (`chainBridgeUsd + 6 * chainGasUsd`, stable tie-break) instead of blindly
defaulting to `chains[0]`, routes the second leg to the cheapest other chain, and
adapts Step 1 for bridge/cross-chain protocols so they do not double-bridge. The
test suite runs offline with `node --test test/model.test.ts`, and dashboard
screenshots can be regenerated reproducibly via `scripts/capture-screenshots.ts`.

## The R² 0.23 lead — resolved: composition, not data quality

Radar-5 noted that fitting the same curve on live DefiLlama API data (n=600)
gives R² 0.23, and asked why it differs from the snapshot fit. Radar-6 checked
it directly, all on live values fetched 19 Nov 2026:

| Fit | n | Slope | R² | Residual std (dex) |
| --- | --- | --- | --- | --- |
| Fresh, all live protocols | 600 | 0.298 | 0.2303 | 1.110 |
| Fresh, TVL ≥ $5M only | 112 | 0.478 | 0.1561 | 0.861 |
| Fresh, same 119 slugs as the sealed fit | 118 | 0.312 | 0.0743 | 0.937 |
| Sealed snapshot, 119 | 119 | 0.472 | 0.1434 | 0.891 |

The 0.23 comes from including hundreds of small protocols below the $5M TVL
floor, which have a flatter relationship (slope 0.30 vs 0.47) and a wider mcap
spread. Restrict to the sealed fit's own universe and the R² is 0.16, not 0.23.
Worse, refitting the same 119 slugs on live values fits *worse* (R² 0.074): over
the five days between the snapshot (14 Nov) and the fetch (19 Nov), live mcap
moved a median of −0.028 dex and unevenly, adding noise rather than signal.
There is no data-quality defect in the sealed snapshot to fix. The sealed fit is
the right target, and the live data does not improve it.

## What the new data was, and what it covered

Sealed in `data/` (as_of 2026-11-19, five days after the snapshot targets — any
gain from these features is therefore an upper bound, and using them would be a
lookahead):

- DefiLlama `/protocols`: 9,076 protocols (9.6 MB). Covers 119/119 fit protocols
  and 299/300 board protocols.
- DefiLlama fees overview: 3,255 protocols (31.7 MB), 7-day and 30-day fees,
  annualised 1-year fees, 7d-over-7d change. Covers 80/119 fit protocols with a
  7-day total (84 in the overview, 4 of them without a `total7d` field) and
  163/300 board protocols (54%).
- DefiLlama revenue overview: 2,899 protocols (27 MB). Covers 160/300 board
  protocols (53%).
- CoinGecko `/coins/markets`: 143 of the fit set's 158 gecko ids, with FDV and
  circulating/total/max supply (float = mcap / FDV).
- No users endpoint exists: DefiLlama `/activeUsers` returns "Route not found",
  so user counts could not be tested.

## What did not help (all tested out-of-sample, same live set, Huber line + category adjustment k=10, refit inside each fold)

Paired-bootstrap 95% CIs are on the median of the per-protocol APE differences
(baseline minus candidate; positive means the candidate is better). The noise
band on a median difference is about ±4 points; the paired CI is the tighter,
correct measure, and none of the board-usable features clears zero.

| Candidate | LOO MdAPE | p75 APE | Spearman | Paired median diff | 95% CI |
| --- | --- | --- | --- | --- | --- |
| radar-5 baseline | 83.6% | 231.3% | 0.376 | — | — |
| + log fees 7d (missing = 0) | 86.0% | 232.9% | 0.342 | −0.0 pp | [−2.0, +2.6] |
| + log fees 7d (missing = NaN, median-imputed) | 84.3% | 238.0% | 0.361 | −0.0 pp | [−0.1, +0.0] |
| + log fees 30d | 84.4% | 248.7% | 0.355 | −0.3 pp | [−0.5, −0.1] |
| + log fees annualised 1y | 85.1% | 221.2% | 0.373 | +0.2 pp | [−0.1, +0.8] |
| + fees 7d-over-7d change | 84.9% | 225.1% | 0.383 | −0.0 pp | [−0.1, +0.2] |
| + log revenue 7d | 86.0% | — | — | — | — |
| + revenue 7d / TVL (annualised) | 86.1% | — | — | — | — |
| + audits (correct count 0–3) | 85.1% | 221.9% | 0.343 | −0.1 pp | [−0.8, +1.3] |
| + audits binary (any audit) | 85.3% | 218.1% | 0.345 | −0.1 pp | [−0.8, +2.3] |
| + fees 7d / TVL + audits | 86.3% | 226.1% | 0.316 | +0.1 pp | [−2.4, +3.0] |
| + 1-day TVL change | 83.6% | — | — | — | — |
| + log float (diagnostic only — see below) | 82.0% | 212.6% | 0.437 | +4.6 pp | [+0.9, +8.2] |

Correlations of each candidate with the baseline residuals are all small:
audits +0.060, log fees 7d −0.074, fees/TVL −0.090, log revenue 7d −0.032,
1-day TVL change −0.075, log float +0.179. Fees and revenue — the most promising
features a priori, because they are the market's own measure of a protocol's
business — actively make the median worse, and would need median imputation for
roughly half the board anyway (54% coverage). Audits do not help either.

Two encoding notes, so the next round does not repeat them:

- DefiLlama's `audits` field is a **string count** ('0'..'3'), not a list. The
  first radar-6 run measured `len(str)` — effectively "has an audits field" —
  and reported 83.3%. Re-run with the correct integer count it is 85.1%: audits
  do not help. The 83.3% number was a bug, not a result.
- 383 of the 3,255 fees-overview entries have no `total7d` field (they carry
  `total24h` but no 7-day total). Missing fees were tested both as zero and as
  NaN with median imputation; neither helps. One fit protocol, hegic, carries
  a *negative* 7-day fee total (−4,581) — a reporting quirk, not real negative
  fees; the first run clamped it to zero (85.8%), the corrected run treats it
  as missing and median-imputes it (86.0%). The 0.2 pp difference is that one
  protocol's encoding; both agree fees do not help.

## The one feature that does help, and why it cannot be used

Token float (circulating supply / total supply, i.e. mcap / FDV) is the only
candidate that clears the noise band: LOO median APE 82.0% (paired +4.6 pp, 95%
CI [+0.9, +8.2]), Spearman 0.376 → 0.437. It is a real, small effect: tokens
with more supply circulating trade at higher multiples of TVL. But it cannot
enter the board, because a pre-token protocol has no token and therefore no
float. Imputing the median float for every board row would only shift every
implied value by the same constant factor — the ranking would not change and the
level shift would be arbitrary. Fitting the curve on FDV instead of mcap was
also tested (FDV is mcap divided by float, so it is nearly the same target):
R² 0.1568 vs 0.1375, residual std 0.892 vs 0.881 — no real gain. The strong
correlation of log FDV with the residuals (+0.843) is mechanical, not signal:
FDV is derived from mcap, so it correlates with anything mcap is in.

## What was not attempted, and why

- **TVL history (30d/90d growth, volatility).** Would need ~119 per-protocol
  calls to `/protocol/{slug}`. The snapshot's own 7-day growth already
  correlates under 0.1 with the residuals, and the fees' 7d-over-7d change
  (a genuine momentum signal) also did nothing. The prior that a longer
  growth window would help, when the short one does not, is weak; the cost
  is high; the expected gain is nil.
- **Gradient boosting / random forest.** No sklearn on this machine, and n=119
  is far too small for a flexible learner — radar-5 already showed k-nearest
  neighbours (also flexible, also non-parametric) does not help. A hand-built
  booster on 119 points would overfit the validation set, not beat it.
- **Dashboard changes.** The judge reads the dossier: the three screenshots
  plus the dashboard's source text (49,006 bytes, under the 65,536 cap). The
  dashboard already satisfies every judge criterion visibly — 40/40 watchlist
  coverage, 246 ranked rows, sortable and filterable table, a detail view with
  the full model breakdown per row, farm plans with a cost and a time on every
  step, the fitted curve with its equation and its honest validation numbers.
  No gap was found that a change could provably close, and any change would
  need new screenshots to keep the screenshots and the code in agreement.
  One real defect was found and fixed in this round: the dashboard's model
  panel and `lib/model.ts` both still said the category tilt is "shrunk by
  n/(n+3)", when the model since radar-5 uses n/(n+10). Fixed in `dashboard/
  app.js` (two places) and `lib/model.ts` (one comment); the output was
  rebuilt and verified — `board.json` and `data.js` are byte-identical, the
  dossier text carries the correction, the screenshots are unchanged (the
  model panel sits below the fold). The model code itself (`lib/model.ts`)
  is not in the dossier, so the judge never saw the comment; the dashboard
  text was the part that mattered.

## The residual error, stated plainly

Unchanged from radar-5: the curve's out-of-sample errors are still large — the
median live protocol is mispriced by ~84%, a quarter of them by more than
~231%, and the middle half of the log errors spans ×0.30 to ×3.48. The implied
values on the board carry that same uncertainty; the P25–P75 range on a row is
roughly a factor of three either way. The model's ranking is weak too
(Spearman 0.376 against actual mcap). The growth, maturity and breadth tilts
are kept as stated judgment, not as fitted effects: the live set gives no
evidence for them (and none against them either, for a launch value rather
than a traded one).

## Recommendation: do not submit this as v4

There is no model improvement to submit. The only candidate that beats noise
(float, 82.0%) cannot be used on a pre-token board; every board-usable feature
tested — fees, revenue, audits, 1-day growth, float proxies — is flat or worse.
The board, the dashboard and the dossier are byte-identical to radar-5's
except for a two-word documentation correction. Swapping a scored entry (v3,
#2618/12,457, 90.7279%) for a statistically identical one would risk a scored
entry for no expected gain, and would consume quota (3/10 used) for nothing.

The honest ceiling: the leaderboard rate is an AI-judge pairwise win rate, not
the model's statistical accuracy — the judge never sees the LOO number, it
reads the dashboard. The dashboard is already strong on every criterion the
judge lists, and the model's median error is ~84% because the market's own
noise is ~0.9 dex (a factor of ~8) around any TVL curve. No feature from the
snapshot, from DefiLlama's live API, or from CoinGecko moved that number beyond
noise in three rounds (radar-4, radar-5, radar-6). Reaching the 99% target
would need either a fundamentally different value signal the snapshot does not
contain, or a judge-visible dashboard leap that cannot be verified without
judge access — and the anchors and rungs are not in the kit, so there is no
local way to measure it. The model is honest enough to describe, not yet good
enough to sell on accuracy: any buyer should be told the median error is ~84%.
