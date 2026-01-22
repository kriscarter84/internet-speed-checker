// Script to initialize the SQLite database
const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const dbPath = path.join(process.cwd(), 'speedtest.db')

// Remove existing database if it exists
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath)
  console.log('Removed existing database')
}

const db = new Database(dbPath)

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
console.log('Database initialized successfully at:', dbPath)

db.close()
