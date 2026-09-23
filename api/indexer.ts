import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createPublicClient, http, parseEventLogs } from 'viem'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db, indexerState, launches, migrations, trades, transfers } from '../src/lib/indexer-db'

const RPC_URL = 'https://rpc.testnet.arc.io'
const LAUNCHPAD = '0x6966f646e45d1441462e81c20d0583125e79ee69' as `0x${string}`
const ZERO = '0x0000000000000000000000000000000000000000'
const CHUNK = 5_000n
const chain = { id: 5042002, name: 'Arc Testnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } } as const
const client = createPublicClient({ chain, transport: http(RPC_URL) })
const tokenCreatedEvent = { type: 'event', name: 'TokenCreated', inputs: [{ indexed: true, name: 'launchId', type: 'uint256' }, { indexed: true, name: 'token', type: 'address' }, { indexed: true, name: 'creator', type: 'address' }, { indexed: false, name: 'name', type: 'string' }, { indexed: false, name: 'symbol', type: 'string' }, { indexed: false, name: 'metadataURI', type: 'string' }], anonymous: false } as const
const tradeEvent = { type: 'event', name: 'Trade', inputs: [{ indexed: true, name: 'launchId', type: 'uint256' }, { indexed: true, name: 'trader', type: 'address' }, { indexed: true, name: 'isBuy', type: 'bool' }, { indexed: false, name: 'tokenAmount', type: 'uint256' }, { indexed: false, name: 'usdcAmount', type: 'uint256' }, { indexed: false, name: 'price', type: 'uint256' }, { indexed: false, name: 'timestamp', type: 'uint256' }], anonymous: false } as const
const graduatedEvent = { type: 'event', name: 'Graduated', inputs: [{ indexed: true, name: 'launchId', type: 'uint256' }, { indexed: true, name: 'token', type: 'address' }, { indexed: false, name: 'nativeReserve', type: 'uint256' }, { indexed: false, name: 'remainingCurveTokens', type: 'uint256' }, { indexed: false, name: 'liquidityTokens', type: 'uint256' }], anonymous: false } as const
const transferEvent = { type: 'event', name: 'Transfer', inputs: [{ indexed: true, name: 'from', type: 'address' }, { indexed: true, name: 'to', type: 'address' }, { indexed: false, name: 'value', type: 'uint256' }], anonymous: false } as const
const launchAbi = [{ type: 'function', name: 'getLaunches', stateMutability: 'view', inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ name: 'page', type: 'tuple[]', components: [{ name: 'token', type: 'address' }, { name: 'creator', type: 'address' }, { name: 'name', type: 'string' }, { name: 'symbol', type: 'string' }, { name: 'description', type: 'string' }, { name: 'metadataURI', type: 'string' }, { name: 'virtualNativeReserve', type: 'uint256' }, { name: 'virtualTokenReserve', type: 'uint256' }, { name: 'nativeReserve', type: 'uint256' }, { name: 'tokenReserve', type: 'uint256' }, { name: 'createdAt', type: 'uint256' }, { name: 'graduated', type: 'bool' }] }] }] as const

async function readCurrentLaunches() {
  return await client.readContract({ address: LAUNCHPAD, abi: launchAbi, functionName: 'getLaunches', args: [0n, 100n] }) as readonly Record<string, unknown>[]
}

async function logsInChunks<T extends typeof tokenCreatedEvent>(event: T, from: bigint, to: bigint, address: `0x${string}` = LAUNCHPAD) {
  const result: Awaited<ReturnType<typeof client.getLogs<{ abi: [T]; eventName: T['name'] }>>> = [] as never
  for (let start = from; start <= to; start += CHUNK) {
    const end = start + CHUNK - 1n > to ? to : start + CHUNK - 1n
    result.push(...await client.getLogs({ address, event, fromBlock: start, toBlock: end }) as never[])
  }
  return result
}

async function sync(): Promise<{ fromBlock: bigint; toBlock: bigint }> {
  const latest = await client.getBlockNumber()
  const state = await db.select().from(indexerState).where(eq(indexerState.id, 1)).limit(1)
  let from = state[0]?.lastBlock ?? (latest > 100_000n ? latest - 100_000n : 0n)
  if (from > latest) from = latest
  const to = latest
  const [createdLogs, tradeLogs, graduationLogs] = await Promise.all([
    logsInChunks(tokenCreatedEvent, from, to), logsInChunks(tradeEvent, from, to), logsInChunks(graduatedEvent, from, to),
  ])
  for (const log of createdLogs as any[]) {
    const a = log.args
    await db.insert(launches).values({ launchId: a.launchId, token: a.token.toLowerCase(), creator: a.creator.toLowerCase(), name: a.name, symbol: a.symbol, description: '', metadataUri: a.metadataURI, createdAt: 0n, createdBlock: log.blockNumber, graduated: false }).onConflictDoUpdate({ target: launches.token, set: { creator: a.creator.toLowerCase(), name: a.name, symbol: a.symbol, metadataUri: a.metadataURI, createdBlock: log.blockNumber, updatedAt: new Date() } })
  }
  for (const log of tradeLogs as any[]) {
    const a = log.args
    await db.insert(trades).values({ launchId: a.launchId, transactionHash: log.transactionHash, logIndex: Number(log.logIndex), trader: a.trader.toLowerCase(), isBuy: a.isBuy, tokenAmount: a.tokenAmount.toString(), usdcAmount: a.usdcAmount.toString(), price: a.price.toString(), eventTimestamp: a.timestamp, blockNumber: log.blockNumber }).onConflictDoNothing()
  }
  for (const log of graduationLogs as any[]) {
    const a = log.args
    await db.insert(migrations).values({ launchId: a.launchId, token: a.token.toLowerCase(), transactionHash: log.transactionHash, logIndex: Number(log.logIndex), blockNumber: log.blockNumber, eventTimestamp: BigInt(Math.floor(Date.now() / 1000)) }).onConflictDoNothing()
    await db.update(launches).set({ graduated: true, updatedAt: new Date() }).where(eq(launches.launchId, a.launchId))
  }
  const known = await db.select({ token: launches.token, createdBlock: launches.createdBlock }).from(launches)
  for (const launch of known) {
    const transferLogs = await logsInChunks(transferEvent, launch.createdBlock, to, launch.token as `0x${string}`)
    for (const log of transferLogs as any[]) {
      const a = log.args
      await db.insert(transfers).values({ token: launch.token, transactionHash: log.transactionHash, logIndex: Number(log.logIndex), fromAddress: a.from.toLowerCase(), toAddress: a.to.toLowerCase(), amount: a.value.toString(), blockNumber: log.blockNumber }).onConflictDoNothing()
    }
  }
  await db.insert(indexerState).values({ id: 1, lastBlock: to }).onConflictDoUpdate({ target: indexerState.id, set: { lastBlock: to, updatedAt: new Date() } })
  return { fromBlock: from, toBlock: to }
}

function serialize(value: unknown): unknown { return typeof value === 'bigint' ? value.toString() : value }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const range = await sync()
    const launchId = req.query.launchId == null ? undefined : BigInt(String(req.query.launchId))
    if (launchId !== undefined) {
      const rows = await db.select().from(trades).where(eq(trades.launchId, launchId)).orderBy(asc(trades.eventTimestamp), asc(trades.blockNumber), asc(trades.logIndex))
      const launch = (await db.select().from(launches).where(eq(launches.launchId, launchId)).limit(1))[0]
      if (!launch) return res.status(404).json({ error: 'Launch not indexed yet', ...range })
      const transferRows = await db.select().from(transfers).where(eq(transfers.token, launch.token))
      const balances = new Map<string, bigint>()
      for (const row of transferRows) { if (row.fromAddress !== ZERO) balances.set(row.fromAddress, (balances.get(row.fromAddress) ?? 0n) - BigInt(row.amount)); balances.set(row.toAddress, (balances.get(row.toAddress) ?? 0n) + BigInt(row.amount)) }
      const holders = [...balances.entries()].filter(([, balance]) => balance > 0n && balance !== BigInt(0)).sort((a, b) => a[1] > b[1] ? -1 : 1).map(([address, balance]) => ({ address, balance: balance.toString(), share: Number(balance * 10000n / (1_000_000_000n * 10n ** 18n)) / 100 }))
      return res.status(200).json({ ...range, launch, trades: rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, serialize(v)]))), holders })
    }
    const all = await db.select().from(launches).orderBy(desc(launches.createdBlock))
    const current = await readCurrentLaunches()
    const snapshots = new Map(current.map((row) => [String(row.token).toLowerCase(), row]))
    return res.status(200).json({ ...range, launches: all.map((row) => {
      const snapshot = snapshots.get(row.token.toLowerCase())
      return Object.fromEntries(Object.entries({ ...row, ...(snapshot || {}) }).map(([k, v]) => [k, serialize(v)]))
    }) })
  } catch (error) {
    console.error('[doxa-indexer] sync failed', error)
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Indexer failed' })
  }
}

export const config = { maxDuration: 60 }
