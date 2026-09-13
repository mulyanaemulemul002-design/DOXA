# DOXA.xyz

DOXA is a meme launchpad UI and V2 testnet contract for Arc.

## Arc Testnet

- RPC: `https://rpc.testnet.arc.io`
- Chain ID: `5042002`
- Explorer: `https://testnet.arcscan.app`
- Native gas token: USDC, 18 decimals
- ERC-20 USDC interface: `0x3600000000000000000000000000000000000000`

## Contract

`contracts/DOXALaunchpad.sol` is a testnet-first pump.fun-style launchpad:

- Each launch deploys a fixed-supply 1B ERC-20 token.
- 780M tokens are sold on the bonding curve and 220M are reserved for future DEX liquidity.
- Buys and sells use the Arc native USDC balance and a constant-product curve.
- A fixed 5 USDC creation fee is sent to the treasury.
- The 1% trading fee is split atomically: 0.95% platform / 0.05% creator.
- Metadata is registered immutably as an IPFS URI.
- Trading stops at the 69,000 USDC graduation target.
- Graduation emits a migration-ready event; DEX migration requires a separate audited integration.

The configured testnet admin and treasury are:

- Admin: `0x662ddf7d320b229f701e5e628e3ff6dec9c05855`
- Treasury: `0x4b1060f52c4af453d02826cd855f4866a6735190`

These addresses are public configuration, not credentials.

## Compile and deploy

```bash
npm install
npm run contract:compile
```

For a deployment, put the deployer private key in Replit Secrets as `DEPLOYER_PRIVATE_KEY`; never commit it or paste it into chat. Then run:

```bash
npm run contract:deploy
```

Optional environment variables are documented in `.env.example`. The default testnet parameters are a `69,000 USDC` graduation target and a fixed `1%` fee. The deployment script writes the public result to `deployments/arc-testnet.json`.

The Create page uploads token images and metadata through the server-only `/api/ipfs` endpoint. Configure `PINATA_JWT` as a server secret; it must never use a `VITE_` prefix or be exposed to the browser. Without it, token creation is intentionally blocked rather than storing local-only metadata.

This contract is not audited and is intended for Arc Testnet only.
