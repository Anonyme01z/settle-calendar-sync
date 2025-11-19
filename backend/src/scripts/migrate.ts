import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'

function getPool() {
  const url = process.env.DATABASE_URL
  if (url) return new Pool({ connectionString: url, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined })
  const host = process.env.PGHOST || 'localhost'
  const port = parseInt(process.env.PGPORT || '5432', 10)
  const user = process.env.PGUSER || 'postgres'
  const password = process.env.PGPASSWORD || ''
  const database = process.env.PGDATABASE || process.env.DB_NAME || 'postgres'
  return new Pool({ host, port, user, password, database })
}

async function tableExists(pool: Pool, table: string) {
  const res = await pool.query("SELECT to_regclass($1) AS exists", [table])
  return res.rows[0]?.exists !== null
}

async function ensureMigrationsTable(pool: Pool) {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, executed_at TIMESTAMPTZ DEFAULT NOW())'
  )
}

async function hasMigration(pool: Pool, filename: string) {
  const res = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename])
  return (res.rowCount ?? 0) > 0
}

async function recordMigration(pool: Pool, filename: string) {
  await pool.query('INSERT INTO schema_migrations(filename) VALUES($1) ON CONFLICT DO NOTHING', [filename])
}

async function applySql(pool: Pool, filePath: string) {
  const sql = fs.readFileSync(filePath, 'utf8')
  await pool.query(sql)
}

async function run() {
  const pool = getPool()
  try {
    const bookingsExists = await tableExists(pool, 'public.bookings')
    if (!bookingsExists) {
      const schemaPath = path.resolve(__dirname, '..', '..', 'database', 'schema.sql')
      await applySql(pool, schemaPath)
    }
    await ensureMigrationsTable(pool)
    const migrationsDir = path.resolve(__dirname, '..', '..', 'database', 'migrations')
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
    for (const f of files) {
      const already = await hasMigration(pool, f)
      if (already) continue
      await applySql(pool, path.join(migrationsDir, f))
      await recordMigration(pool, f)
    }
  } finally {
    await pool.end()
  }
}

run().catch(err => {
  process.exitCode = 1
})