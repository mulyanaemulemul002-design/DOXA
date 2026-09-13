# DOXA.xyz — Contract V2 Rebuild & Terminal/Chart Fixes

## Context
V1 contract and UI are functional but have gaps listed below. This spec defines contract V2 plus the data/indexing/chart fixes needed on the frontend side.

---

## 1. Token Supply Standard (Contract Fix)

- Fix total supply to **1,000,000,000 (1B) tokens**, fixed forever — no mint function, or mint function renounced/disabled after initial mint.
- Split allocation (standard pump.fun / four.meme model) — **locked values for v2**:
  - **Bonding curve share: 78%** (780,000,000 tokens) sold to the public via the curve
  - **DEX liquidity share: 22%** (220,000,000 tokens) locked/reserved for the DEX pool at graduation
  - Hardcode these as constants
- **Dev/creator buy limit: locked at 3% of total supply per wallet**, enforced at the contract level at/near token creation, to prevent creators from cornering their own curve
- Bonding curve math (virtual reserves, price formula) must be derived against this exact split — do not just change the constant without re-deriving curve parameters.

## 1b. Upfront Deploy Fee

- Charge a fixed **deploy fee in USDC** when a creator calls `createToken(...)`, mirroring pump.fun's ~0.02 SOL / four.meme's ~0.005 BNB deploy fee model (paid to cover deployment + metadata storage costs, sent to platform treasury).
- Decide and hardcode the exact USDC amount (document the reasoning — e.g. roughly matching the USD value of the SOL/BNB equivalents at time of design) as a constant, adjustable only via an admin/governance function, not per-transaction input.

## 1c. Graduation Target

- Set graduation threshold at **~$69,000 equivalent, denominated directly in USDC** (since ARC's bonding curve is USDC-quoted natively — no SOL/BNB-to-USD conversion needed, this is actually simpler on ARC).
- On reaching 100% curve fill (i.e., the graduation target is hit):
  - Remaining unsold curve tokens + the accumulated USDC in the curve are migrated together into the DEX pool (Uniswap on ARC mainnet migration path noted in Section 6 of the original spec — for now/testnet, this step can remain the placeholder/mock migration logic already defined)
  - **LP tokens must be burned or permanently locked** (100%) at migration — this must be enforced in the migration contract logic itself, not left as a manual step, to match the trust model of pump.fun/four.meme (prevents rug via LP withdrawal)

## 2. Token Metadata (Image, Description, Socials) — Contract + Storage Fix

**Root cause:** ERC-20 has no native slot for image/metadata. This must be handled off the token contract itself.

- Add a **metadata registry** at the Factory contract level: mapping `tokenAddress => metadataURI` (string), set once at creation time and immutable after.
- Flow at token creation:
  1. Frontend uploads image to IPFS (via Pinata/web3.storage/nft.storage) → gets image CID
  2. Frontend builds a metadata JSON (`{ name, symbol, description, image: ipfs://<CID>, socials }`) → uploads that JSON to IPFS too → gets metadata CID
  3. Factory contract's `createToken(...)` call includes the metadata URI (`ipfs://<metadata-CID>`) as a parameter, stored in the registry mapping
  4. Factory emits a `TokenCreated(address token, string metadataURI, ...)` event so indexers/frontend can pick it up without per-token calls
- Frontend must fetch `metadataURI` → resolve the JSON → render the `image` field. Confirm this round-trip works end-to-end before considering this fixed (test: create token → reload page → image still renders from IPFS, not from local browser cache).

## 3. Terminal/Trading Page — Missing Data (Indexing + Frontend Fix)

Current terminal only shows chart + buy/sell. Add, matching pump.fun-style launchpads:

- **Holders tab**: address list + % of supply held per address, holder count. Derive from `Transfer` events (track running balances) — do not rely on RPC balance calls per address at render time; index it.
- **Activity/Trade feed**: chronological list of Buy/Sell events — wallet (truncated), amount, USDC value, timestamp, tx hash link. Real-time update on new trades (via event subscription or polling).
- **Market cap**: `current price × circulating supply`, always live.
- **Bonding curve progress bar**: % of curve-allocated tokens sold, with graduation threshold marked.
- **Token info panel**: contract address (copyable), total supply, creation date, socials/description from metadata.

Required contract-side support: `Buy` and `Sell` events must include enough data (trader address, token amount, USDC amount, resulting price, timestamp) for all of the above to be derived without extra contract calls.

## 4. Chart Bug — "Staircase" Candles Instead of Proper OHLC

**Root cause:** current implementation renders one candle per trade instead of aggregating trades into fixed time-interval buckets.

**Fix — implement proper OHLC bucketing:**
- Choose interval granularity (e.g. 1m default, with zoom options for 5m/15m/1h)
- For each interval bucket, aggregate all trades (both buys and sells) that occurred in that window:
  - `open` = price of the first trade in the bucket
  - `high` = max price in the bucket
  - `low` = min price in the bucket
  - `close` = price of the last trade in the bucket
  - `volume` = sum of trade sizes in the bucket
- A bucket with only one trade still produces one candle (open=high=low=close is valid) — the bug is buckets with *multiple* trades incorrectly producing multiple short candles instead of merging into one OHLC candle.
- If no trades occur in an interval, either skip the candle or carry forward the previous close as a flat candle (standard charting convention) — do not leave gaps that break the x-axis.

## 5. Chart Bug — Sell Candles Not Rendering / Freezing at Last Buy Price

**Root cause (most likely):** the chart's data feed only listens to/processes `Buy` events, not `Sell` events, so price state never updates on a sell.

**Fix:**
- Chart data source must subscribe to (or poll) **both** `Buy` and `Sell` events, feeding both into the same OHLC aggregation pipeline from Section 4 — a sell is just a trade with a negative direction, it still moves price and must appear in the same candle stream.
- Candle color logic must be based on `close vs open` of the bucket (red if close < open, green if close > open) — not based on "was the most recent trade type a buy or sell." A bucket containing both buys and sells should still resolve to one correctly colored candle based on net price movement.
- After implementing, test explicitly: perform a sell, confirm (a) price decreases in the UI immediately, (b) a red candle appears reflecting the drop, (c) subsequent buys resume showing green candles from the new lower price — not from the stale pre-sell price.

## 6. Creator Fee Split (Contract Fix)

- Every buy/sell on the bonding curve routes a **total 1% trading fee**, split as follows (standard pump.fun/four.meme model):
  - **Platform fee**: remainder of the 1% after creator share (i.e. ~0.95%), sent to the DOXA treasury/fee wallet
  - **Creator fee**: **~0.05%** of total trade volume, sent to the address that created the token — this is the creator's passive revenue share during the curve phase
- **Post-graduation fee: NOT implemented in v2.** Deferred to a future v3 once ARC mainnet's Uniswap version (V2/V3 vs V4-with-hooks) is confirmed, since the implementation approach depends entirely on that. Do not build fee-on-transfer logic or hook contracts for this now.
- **Direct dev-buy profit** is separate from the above and isn't a contract mechanic — it's just the creator using their capped initial buy (Section 1) and trading it like any other holder; no special contract logic needed for this beyond the buy-limit cap already specified.
- Store `creator` address immutably on the token/curve struct at creation time (set once, cannot be changed after — prevents fee redirection exploits).
- Fee split must happen atomically within the same buy/sell transaction (no separate claim step, unless a claimable-rewards pattern is specifically preferred — decide and document which model is used).
- Emit a `FeesDistributed(address token, address creator, uint256 creatorFee, uint256 platformFee)` event for indexing/transparency on the activity feed.
- Test explicitly: creator wallet balance increases correctly on every trade, in the correct proportion (~0.05% of volume), for both buys and sells.

## 7. FATAL BUG — Wallet Not Enforced to ARC Network Before Transaction

**Symptom:** Tested with OKX Wallet connected to Ethereum mainnet (not ARC). The app allowed the transaction to proceed anyway — it executed on Ethereum instead of ARC, silently, with no warning beforehand. This is a critical/fatal bug: user funds could be sent/spent on the wrong chain entirely.

**Required fix — network guard, non-negotiable before any transaction:**
- On wallet connect AND before every transaction attempt (buy, sell, create token, claim, etc.), check the wallet's currently connected `chainId` against ARC's chain ID.
- If the wallet is on the wrong network:
  1. **Block the transaction entirely** — do not let it submit under any circumstance while on the wrong chain.
  2. Show a clear warning/modal to the user: "Wrong network detected. Please switch to ARC Network to continue."
  3. Trigger a programmatic network switch request (`wallet_switchEthereumChain`), and if ARC isn't yet added to the wallet, fall back to `wallet_addEthereumChain` with ARC's correct RPC/chainId/currency details, then re-prompt switch.
  4. Only re-enable the transaction button once the app confirms (via a fresh `chainId` read, not a cached value) that the wallet is actually on ARC.
- This check must be **re-verified live at the moment of every transaction**, not just once at wallet connect — a user can switch networks manually in their wallet mid-session without reloading the page.
- Test explicitly with multiple wallets (OKX Wallet, MetaMask, etc.) starting on Ethereum mainnet: confirm the warning appears, confirm the switch prompt works, confirm transactions are impossible until the switch is confirmed, and confirm a mid-session manual network switch away from ARC also immediately blocks further transactions until switched back.

## 8. Testing Checklist Before Considering This Done

- [ ] New token created with 1B supply, correct curve/liquidity split
- [ ] Image uploaded at creation renders correctly after page reload (from IPFS, not cache)
- [ ] Holders tab shows correct count and matches on-chain balances
- [ ] Activity feed shows real-time buys and sells with correct data
- [ ] Large single sell produces one appropriately-sized red candle, not a staircase
- [ ] Small trades within the same interval merge into one candle, not one each
- [ ] Chart price updates immediately and correctly after a sell (no freeze)
- [ ] Creator wallet receives correct fee % on every buy and sell
- [ ] Platform fee wallet receives correct fee % on every buy and sell
- [ ] Wallet on wrong network (e.g. Ethereum) is blocked from transacting and shown a clear switch-to-ARC prompt
- [ ] Network switch flow works end-to-end (add chain if missing, switch, re-verify before enabling transactions)
- [ ] Manually switching away from ARC mid-session immediately blocks further transactions
