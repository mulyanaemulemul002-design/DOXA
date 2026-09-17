import { drizzle } from 'drizzle-orm/node-postgres'
import { pgTable, bigint, boolean, integer, numeric, text, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'

export const indexerState = pgTable('doxa_indexer_state', {
  id: integer('id').primaryKey().default(1),
  lastBlock: bigint('last_block', { mode: 'bigint' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const launches = pgTable('doxa_launches', {
  launchId: bigint('launch_id', { mode: 'bigint' }).primaryKey(),
  token: text('token').notNull().unique(), creator: text('creator').notNull(), name: text('name').notNull(), symbol: text('symbol').notNull(), description: text('description').notNull(), metadataUri: text('metadata_uri').notNull(), createdAt: bigint('created_at', { mode: 'bigint' }).notNull(), createdBlock: bigint('created_block', { mode: 'bigint' }).notNull(), graduated: boolean('graduated').notNull().default(false), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const trades = pgTable('doxa_trades', {
  launchId: bigint('launch_id', { mode: 'bigint' }).notNull(), transactionHash: text('transaction_hash').notNull(), logIndex: integer('log_index').notNull(), trader: text('trader').notNull(), isBuy: boolean('is_buy').notNull(), tokenAmount: numeric('token_amount').notNull(), usdcAmount: numeric('usdc_amount').notNull(), price: numeric('price').notNull(), eventTimestamp: bigint('event_timestamp', { mode: 'bigint' }).notNull(), blockNumber: bigint('block_number', { mode: 'bigint' }).notNull(),
}, (table) => [primaryKey({ columns: [table.transactionHash, table.logIndex] })])

export const transfers = pgTable('doxa_transfers', {
  token: text('token').notNull(), transactionHash: text('transaction_hash').notNull(), logIndex: integer('log_index').notNull(), fromAddress: text('from_address').notNull(), toAddress: text('to_address').notNull(), amount: numeric('amount').notNull(), blockNumber: bigint('block_number', { mode: 'bigint' }).notNull(),
}, (table) => [primaryKey({ columns: [table.transactionHash, table.logIndex] })])

export const migrations = pgTable('doxa_migrations', {
  launchId: bigint('launch_id', { mode: 'bigint' }).notNull(), token: text('token').notNull(), transactionHash: text('transaction_hash').notNull(), logIndex: integer('log_index').notNull(), blockNumber: bigint('block_number', { mode: 'bigint' }).notNull(), eventTimestamp: bigint('event_timestamp', { mode: 'bigint' }).notNull(),
}, (table) => [primaryKey({ columns: [table.transactionHash, table.logIndex] })])

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool)
export type IndexerDb = typeof db
