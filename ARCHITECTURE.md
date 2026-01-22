# Speed Test Application Architecture

## System Overview

A professional browser-based internet speed test application built with Next.js 15, measuring ping, jitter, download, and upload speeds using multi-connection saturation techniques.

### Technology Stack
- **Frontend**: Next.js 15 + React 19 + TypeScript + Tailwind CSS
- **Backend**: Next.js API Routes (Node.js)
- **Database**: SQLite with better-sqlite3
- **Measurement**: Multi-threaded HTTP connections with real-time metrics

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser (Client)                       │
│                                                              │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │  UI Layer  │  │ Test Engine  │  │  Measurement Utils  │ │
│  │            │  │              │  │                     │ │
│  │ - GO Button│  │ - Orchestr.  │  │ - Multi-connection  │ │
│  │ - Gauges   │  │ - Server Sel.│  │ - Throughput calc   │ │
│  │ - Results  │  │ - Test Flow  │  │ - Latency tracking  │ │
│  └────────────┘  └──────────────┘  └─────────────────────┘ │
│         │                 │                    │            │
└─────────┼─────────────────┼────────────────────┼────────────┘
          │                 │                    │
          │         HTTPS / Fetch API            │
          │                 │                    │
┌─────────┼─────────────────┼────────────────────┼────────────┐
│         ▼                 ▼                    ▼            │
│              Next.js Server (API Routes)                    │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  /api/servers│  │ /api/download│  │   /api/upload    │ │
│  │              │  │              │  │                  │ │
│  │ Returns test │  │ Streams rand │  │ Receives data,   │ │
│  │ server list  │  │ bytes with   │  │ measures upload  │ │
│  │              │  │ cache-bust   │  │ throughput       │ │
│  └──────────────┘  └──────────────┘  └──────────────────┘ │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  /api/ping   │  │ /api/results │  │  Database Layer  │ │
│  │              │  │              │  │                  │ │
│  │ Echo endpoint│  │ Store & ret. │  │  SQLite + Schema │ │
│  │ for latency  │  │ test history │  │  for test logs   │ │
│  └──────────────┘  └──────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## API Specification

### 1. GET /api/servers
**Purpose**: Return list of available test servers for client selection

**Request**: None

**Response**:
```json
{
  "servers": [
    {
      "id": "server-1",
      "name": "Primary Server",
      "location": "Local",
      "endpoints": {
        "ping": "/api/ping",
        "download": "/api/download",
        "upload": "/api/upload"
      }
    }
  ]
}
```

### 2. GET /api/ping
**Purpose**: Measure round-trip latency

**Request**: None (lightweight GET)

**Response**:
```json
{
  "timestamp": 1737584000000,
  "server": "server-1"
}
```

### 3. GET /api/download?size=1048576&nonce=abc123
**Purpose**: Stream random data for download speed measurement

**Query Parameters**:
- `size` (required): Bytes to download (e.g., 1048576 for 1MB)
- `nonce` (required): Cache-busting string (timestamp or random)

**Response**: Binary stream of random bytes
- Header: `Content-Type: application/octet-stream`
- Header: `Cache-Control: no-cache, no-store, must-revalidate`
- Header: `Content-Length: {size}`

### 4. POST /api/upload
**Purpose**: Receive upload data and measure throughput

**Request Body**: Binary data (ArrayBuffer/Blob)

**Response**:
```json
{
  "bytesReceived": 1048576,
  "duration": 1234,
  "mbps": 6.78
}
```

### 5. POST /api/results
**Purpose**: Store completed test results

**Request Body**:
```json
{
  "serverId": "server-1",
  "ping": 45.2,
  "jitter": 3.1,
  "downloadMbps": 95.4,
  "uploadMbps": 45.8,
  "packetLoss": 0,
  "userAgent": "Mozilla/5.0...",
  "connectionType": "4g"
}
```

**Response**:
```json
{
  "id": "test-12345",
  "timestamp": 1737584000000,
  "success": true
}
```

### 6. GET /api/results?limit=10
**Purpose**: Retrieve recent test history

**Query Parameters**:
- `limit` (optional): Number of results to return (default: 10)

**Response**:
```json
{
  "results": [
    {
      "id": "test-12345",
      "timestamp": 1737584000000,
      "ping": 45.2,
      "downloadMbps": 95.4,
      "uploadMbps": 45.8
    }
  ]
}
```

## Database Schema

### Table: test_results

```sql
CREATE TABLE test_results (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  server_id TEXT NOT NULL,
  ping REAL,
  jitter REAL,
  download_mbps REAL,
  upload_mbps REAL,
  packet_loss REAL,
  user_agent TEXT,
  connection_type TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_timestamp ON test_results(timestamp DESC);
CREATE INDEX idx_ip_hash ON test_results(ip_hash);
```

## Measurement Methodology

### Server Selection Algorithm
1. Fetch server list from `/api/servers`
2. Ping each server 5-10 times sequentially
3. Calculate median RTT for each server
4. Select server with lowest median latency

### Download Speed Test
1. **Pre-test**: Single connection, small chunk (256KB) to estimate speed
2. **Main test**: 
   - Open N parallel connections (2-8 based on pre-test)
   - Fetch large chunks (1-10MB per connection)
   - Measure bytes received every 100ms
   - Calculate instantaneous Mbps
3. **Computation**:
   - Discard first 2 seconds (TCP slow start)
   - Discard worst 10% of samples (outliers)
   - Average remaining samples for final Mbps

### Upload Speed Test
1. Generate random ArrayBuffer client-side
2. Open N parallel POST requests
3. Stream data to `/api/upload`
4. Server measures bytes received and duration
5. Calculate throughput using same filtering as download

### Ping & Jitter
1. Send 20-30 sequential requests to `/api/ping`
2. Measure RTT for each (request send to response received)
3. **Ping**: Median of all RTTs
4. **Jitter**: Standard deviation of RTTs

## Configuration

### Test Duration
- **Short**: 10 seconds per test (download + upload)
- **Normal**: 15 seconds per test (default)
- **Long**: 20 seconds per test

### Connection Counts (based on pre-test speed)
- < 10 Mbps: 2 connections
- 10-50 Mbps: 4 connections
- 50-200 Mbps: 6 connections
- > 200 Mbps: 8 connections

### Chunk Sizes
- **Download**: 1MB - 10MB per chunk
- **Upload**: 512KB - 5MB per chunk

## Security & Performance

### Rate Limiting
- Max 10 tests per IP per hour
- Implemented via in-memory cache or DB query

### Data Privacy
- Store IP as SHA-256 hash
- No PII collection
- Aggregate stats only

### Browser Compatibility
- Modern browsers with Fetch API
- No IE11 support
- Progressive enhancement for older browsers

## Disclaimer
This tool is an independent implementation using publicly available web speed testing methodologies.
