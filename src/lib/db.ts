import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

// ========================================
// DATABASE CONFIG
// Local dev: SQLite file
// Cloudflare Pages: Turso via libSQL
// ========================================

function createDatabaseClient() {
  const databaseUrl = process.env.DATABASE_URL || 'file:db/custom.db'

  // If using libsql:// or turso:// URL (Cloudflare Pages / Turso)
  if (databaseUrl.startsWith('libsql://') || databaseUrl.startsWith('turso://')) {
    const authToken = process.env.TURSO_AUTH_TOKEN
    const libsql = createClient({
      url: databaseUrl,
      authToken: authToken,
    })
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
