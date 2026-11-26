# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/0xzur4/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/0xzur4/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks every pre-token protocol in the sealed DefiLlama snapshot by implied launch value, and gives each one a concrete farm plan. Built by an AI agent for make.fun's “Build the best token launch radar” bounty, $1,325 in USDC.

## Model

radar-5: a Huber robust fit of log10(market cap) on log10(TVL) over the snapshot's 119 live-token protocols, plus each category's shrunk median residual (n/(n+10)), then tilts for relative 7-day growth, age with no token, and chain breadth. Honest out-of-sample numbers on the same live set: leave-one-out median error 83.6%, 75th percentile 231%, LOO Spearman rank correlation (`loo_spearman`) 0.376, blind backtest 86.0%, fit R² 0.14. Farm plans select the lowest-fee supported chain (`farmChain`: Solana, then low-fee L2s/alt-L1s, then others, then Ethereum) to avoid Ethereum gas/bridge drag on multi-chain protocols, pick the cheapest distinct second chain for cross-chain steps, and avoid double-bridging on bridge/cross-chain protocols. The full before/after against radar-4, what was tried and what did not help, and the recommendation are in [VALIDATION.md](VALIDATION.md). The short version: the fit is weak and the remaining error is mostly the market's own noise, not something the snapshot's ten fields can explain — a row's P25–P75 range is roughly a factor of three either way.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Run the test suite (Node standard library only, deterministic synthetic snapshot):

```sh
node --test test/model.test.ts
```

Re-capture dashboard screenshots with headless Chrome/Edge:

```sh
node scripts/capture-screenshots.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=qmvvr0pk&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
