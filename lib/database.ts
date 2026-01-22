import Database from 'better-sqlite3'
import { createHash } from 'crypto'
import path from 'path'

const dbPath = path.join(process.cwd(), 'speedtest.db')
const db = new Database(dbPath)

// Initialize database schema
export function initDatabase() {
  const schema = `
    CREATE TABLE IF NOT EXISTS test_results (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      ip_hash TEXT NOT NULL,
      server_id TEXT NOT NULL,
      ping REAL,
      jitter REAL,
      download_mbps REAL,
      upload_mbps REAL,
      packet_loss REAL DEFAULT 0,
      user_agent TEXT,
      connection_type TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_timestamp ON test_results(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_ip_hash ON test_results(ip_hash);
  `

  db.exec(schema)
}

// Hash IP address for privacy
export function hashIP(ip: string): string {
  return createHash('sha256').update(ip).digest('hex')
}

// Save test result
export interface TestResult {
  serverId: string
  ping: number
  jitter: number
  downloadMbps: number
  uploadMbps: number
  packetLoss?: number
  userAgent: string
  connectionType?: string
}

export function saveTestResult(ipHash: string, result: TestResult) {
  const id = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const timestamp = Date.now()
  
  // Sanitize user agent to prevent XSS (limit length and remove dangerous characters)
  const sanitizedUserAgent = result.userAgent
    .substring(0, 500) // Limit length
    .replace(/[<>\"']/g, '') // Remove potential XSS characters

  const stmt = db.prepare(`
    INSERT INTO test_results 
    (id, timestamp, ip_hash, server_id, ping, jitter, download_mbps, upload_mbps, packet_loss, user_agent, connection_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    id,
    timestamp,
    ipHash,
    result.serverId,
    result.ping,
    result.jitter,
    result.downloadMbps,
    result.uploadMbps,
    result.packetLoss || 0,
    sanitizedUserAgent,
    result.connectionType || null
  )

  return { id, timestamp }
}

// Get recent test results
export function getRecentResults(limit: number = 10) {
  const stmt = db.prepare(`
    SELECT id, timestamp, ping, jitter, download_mbps, upload_mbps, server_id
    FROM test_results
    ORDER BY timestamp DESC
    LIMIT ?
  `)

  return stmt.all(limit)
}

// Get test results by IP hash
export function getResultsByIP(ipHash: string, limit: number = 10) {
  const stmt = db.prepare(`
    SELECT id, timestamp, ping, jitter, download_mbps, upload_mbps, server_id
    FROM test_results
    WHERE ip_hash = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `)

  return stmt.all(ipHash, limit)
}

// Initialize database on module load
initDatabase()

export default db
