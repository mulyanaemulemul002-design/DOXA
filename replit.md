# DOXA.xyz on Replit

## Run the web app

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 5000
```

The Replit workflow is named `Start application` and serves the Vite app on port 5000.

## Arc Testnet contract

The frontend uses the deployed `DOXALaunchpad` contract at:

`0x6966f646e45d1441462e81c20d0583125e79ee69`

Network details:

- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.io`
- Explorer: `https://testnet.arcscan.app`

The Create page calls V2 `createLaunch` and requires a connected wallet on Arc Testnet. It uploads the image and metadata to Pinata IPFS, then pays the fixed 5 USDC deploy fee in the same transaction. The Wallet page reads native USDC, ERC-20 USDC, created launches, and token balances from the connected wallet.

V2 parameters are fixed in the contract: 1B total supply, 78% bonding curve / 22% reserved liquidity, 3% creator buy cap, 69,000 USDC graduation target, and a 1% trading fee split into 0.95% platform / 0.05% creator. Graduation emits a migration-ready event; the audited DEX migration remains deferred.

The terminal indexes `Trade` and token `Transfer` events for holders, activity, and OHLC candles. It aggregates both buys and sells into one-minute buckets. Every wallet connection and transaction re-checks the live chain ID and blocks transactions away from Arc Testnet.