import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createPublicClient, http, parseEventLogs } from 'viem'
import { and, asc, eq } from 'drizzle-orm'
import { db, trades } from '../src/lib/indexer-db'

const RPC_URL = 'https://rpc.testnet.arc.io'
const LAUNCHPAD = '0x6966f646e45d1441462e81c20d0583125e79ee69' as `0x${string}`
const chain = { id: 5042002, name: 'Arc Testnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } } as const
const client = createPublicClient({ chain, transport: http(RPC_URL) })
const tradeEvent = { type: 'event', name: 'Trade', inputs: [{ indexed: true, name: 'launchId', type: 'uint256' }, { indexed: true, name: 'trader', type: 'address' }, { indexed: true, name: 'isBuy', type: 'bool' }, { indexed: false, name: 'tokenAmount', type: 'uint256' }, { indexed: false, name: 'usdcAmount', type: 'uint256' }, { indexed: false, name: 'price', type: 'uint256' }, { indexed: false, name: 'timestamp', type: 'uint256' }], anonymous: false } as const

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const launchId = Number(req.query.launchId)
  const fromBlock = BigInt(String(req.query.fromBlock ?? '0'))
  if (!Number.isInteger(launchId) || fromBlock < 0n) return res.status(400).json({ error: 'launchId and fromBlock are required' })
  try {
    const toBlock = await client.getBlockNumber()
    const logs = await client.getLogs({ address: LAUNCHPAD, event: tradeEvent, args: { launchId: BigInt(launchId) }, fromBlock, toBlock })
    const parsed = parseEventLogs({ abi: [tradeEvent], logs })
    for (const log of parsed) {
      const args = log.args
      await db.insert(trades).values({ launchId: BigInt(launchId), transactionHash: log.transactionHash, logIndex: Number(log.logIndex), trader: args.trader, isBuy: args.isBuy, tokenAmount: args.tokenAmount.toString(), usdcAmount: args.usdcAmount.toString(), price: args.price.toString(), eventTimestamp: args.timestamp, blockNumber: log.blockNumber }).onConflictDoNothing()
    }
    const rows = await db.select().from(trades).where(eq(trades.launchId, BigInt(launchId))).orderBy(asc(trades.eventTimestamp))
    return res.status(200).json({ fromBlock: fromBlock.toString(), toBlock: toBlock.toString(), trades: rows.map((row) => ({ ...row, launchId: row.launchId.toString(), tokenAmount: row.tokenAmount, usdcAmount: row.usdcAmount, price: row.price, eventTimestamp: row.eventTimestamp.toString(), blockNumber: row.blockNumber.toString() })) })
  } catch (error) {
    console.error('[doxa-indexer] trade sync failed', { launchId, fromBlock: fromBlock.toString(), error })
    return res.status(502).json({ error: error instanceof Error ? error.message : 'RPC indexer request failed' })
  }
}
