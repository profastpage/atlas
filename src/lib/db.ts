import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

// ========================================
// DATABASE CONFIG
// Works locally (SQLite) and on Cloudflare Pages (libSQL/D1/Turso)
// ========================================

function createDatabaseClient() {
  const databaseUrl = process.env.DATABASE_URL || 'file:db/custom.db'

  // If using libsql:// or turso:// URL (Cloudflare Pages / Turso)
  if (databaseUrl.startsWith('libsql://') || databaseUrl.startsWith('turso://')) {
    const libsql = createClient({ url: databaseUrl })
    const adapter = new PrismaLibSql(libsql)
    return new PrismaClient({ adapter, log: ['error'] })
  }

  // Local development: use SQLite directly
  return new PrismaClient({
    log: process.env.NODE_ENV !== 'production' ? ['query'] : ['error'],
  })
}

const globalForPrisma = globalThis as unknown as {
  db: PrismaClient | undefined
}

export const db = globalForPrisma.db ?? createDatabaseClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.db = db
