# Speed Test Application

A professional, browser-based internet speed test application built with Next.js 15, measuring ping, jitter, download, and upload speeds using multi-connection saturation techniques.

## Features

- **Accurate Speed Measurement**: Multi-threaded HTTP connections to saturate your link
- **Comprehensive Metrics**: Ping, jitter, download speed, upload speed
- **Auto Server Selection**: Automatically selects the lowest-latency test server
- **Real-time Progress**: Live updates while testing
- **Results Storage**: SQLite database for test history
- **Privacy-Focused**: IP addresses are hashed, no PII collection
- **Professional UI**: Modern, responsive design inspired by industry standards

## Technology Stack

- **Frontend**: Next.js 15 + React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **Backend**: Next.js API Routes (Node.js)
- **Database**: SQLite with better-sqlite3
- **Measurement**: Multi-connection HTTP with Fetch API

## Quick Start

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. Install dependencies:

```bash
npm install
```

2. Initialize the database:

```bash
npm run db:init
```

3. Start the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
speedtest-app/
├── app/
│   ├── api/
│   │   ├── servers/route.ts      # Server list endpoint
│   │   ├── ping/route.ts         # Latency measurement
│   │   ├── download/route.ts     # Download speed test
│   │   ├── upload/route.ts       # Upload speed test
│   │   └── results/route.ts      # Results storage/retrieval
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Main speed test UI
│   └── globals.css               # Global styles
├── lib/
│   ├── speedtest-engine.ts       # Core measurement logic
│   └── database.ts               # Database utilities
├── ARCHITECTURE.md               # Detailed architecture docs
└── README.md                     # This file
```

## How It Works

### Measurement Methodology

1. **Server Selection**
   - Fetches available test servers
   - Pings each server 5-10 times
   - Selects server with lowest median latency

2. **Latency & Jitter**
   - Sends 20 sequential HTTP requests
   - Measures round-trip time (RTT)
   - Ping = median RTT
   - Jitter = standard deviation of RTTs

3. **Download Speed**
   - Pre-test with single connection to estimate speed
   - Opens multiple parallel connections (2-8 based on speed)
   - Fetches random data chunks with cache-busting
   - Measures throughput every 100ms
   - Discards warm-up samples and outliers
   - Reports average Mbps

4. **Upload Speed**
   - Generates random data client-side
   - Uploads via multiple parallel POST requests
   - Server measures bytes received
   - Same filtering logic as download

### Configuration

Default test configuration:
- **Latency test**: 20 pings per server
- **Download test**: 10 seconds, 2-8 connections
- **Upload test**: 10 seconds, 2-8 connections
- **Chunk sizes**: 256KB - 10MB (adaptive based on speed)

Connection counts are automatically adjusted:
- < 10 Mbps: 2 connections
- 10-50 Mbps: 4 connections
- 50-200 Mbps: 6 connections
- \> 200 Mbps: 8 connections

## API Documentation

### GET /api/servers
Returns list of available test servers.

**Response:**
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

### GET /api/ping
Lightweight endpoint for latency measurement.

**Response:**
```json
{
  "timestamp": 1737584000000,
  "server": "server-1"
}
```

### GET /api/download?size=1048576&nonce=abc123
Streams random data for download speed testing.

**Query Parameters:**
- `size`: Bytes to download (required)
- `nonce`: Cache-busting string (required)

**Response:** Binary stream (application/octet-stream)

### POST /api/upload
Receives upload data and measures throughput.

**Request Body:** Binary data (ArrayBuffer/Blob)

**Response:**
```json
{
  "bytesReceived": 1048576,
  "duration": 1234,
  "mbps": 6.78
}
```

### POST /api/results
Stores test results in database.

**Request Body:**
```json
{
  "serverId": "server-1",
  "ping": 45.2,
  "jitter": 3.1,
  "downloadMbps": 95.4,
  "uploadMbps": 45.8,
  "userAgent": "Mozilla/5.0...",
  "connectionType": "4g"
}
```

### GET /api/results?limit=10
Retrieves recent test history.

**Query Parameters:**
- `limit`: Number of results (optional, default: 10)

## Database Schema

SQLite database (`speedtest.db`) with single table:

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
  packet_loss REAL DEFAULT 0,
  user_agent TEXT,
  connection_type TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

## Development

### Running Tests

```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Adding Test Servers

Edit `/app/api/servers/route.ts` to add more test server locations:

```typescript
const servers = [
  {
    id: 'server-1',
    name: 'US East',
    location: 'New York',
    endpoints: {
      ping: 'https://us-east.example.com/api/ping',
      download: 'https://us-east.example.com/api/download',
      upload: 'https://us-east.example.com/api/upload',
    },
  },
  // Add more servers...
]
```

### Customizing UI

Edit `/app/page.tsx` to customize colors, layout, or add features:
- Modify Tailwind classes for styling
- Add charts/graphs for historical data
- Implement export features (CSV, JSON, image)

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel dashboard
3. Deploy automatically

**Note**: SQLite works for development but consider PostgreSQL for production at scale.

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables

Create `.env.local` for configuration:

```env
# Optional: Custom database path
DATABASE_PATH=/path/to/speedtest.db

# Optional: Rate limiting
RATE_LIMIT_PER_HOUR=10
```

## Performance Considerations

### Accuracy Tips

- Run tests from wired connection when possible
- Close bandwidth-intensive applications
- Test multiple times and average results
- Peak vs off-peak hours affect results

### Server Requirements

For production deployment:
- **CPU**: 2+ cores recommended
- **RAM**: 2GB+ for handling multiple concurrent tests
- **Bandwidth**: Sufficient to saturate user connections
- **Storage**: Minimal (database grows slowly)

### Scaling

For high traffic:
1. Use PostgreSQL instead of SQLite
2. Add Redis for rate limiting
3. Deploy multiple test server nodes
4. Use CDN for static assets
5. Implement connection pooling

## Security

- IP addresses are SHA-256 hashed before storage
- No personally identifiable information collected
- Rate limiting prevents abuse (configurable)
- CORS headers can be added for API restrictions

## Troubleshooting

### Tests fail to start
- Check network connectivity
- Verify API endpoints are accessible
- Check browser console for errors

### Inaccurate results
- Ensure no other bandwidth usage during test
- Try different test servers
- Check for browser extensions interfering
- Verify server has sufficient bandwidth

### Database errors
- Run `npm run db:init` to recreate database
- Check file permissions on `speedtest.db`
- Ensure SQLite is installed properly

## Future Enhancements

Potential improvements:
- [ ] Multiple test server locations
- [ ] Historical charts and trends
- [ ] Share results via URL
- [ ] Export results (CSV, JSON, PNG)
- [ ] User accounts and saved history
- [ ] Packet loss measurement
- [ ] Mobile app version
- [ ] Admin dashboard for server stats
- [ ] WebSocket-based measurements
- [ ] Comparison with ISP advertised speeds

## Legal & Disclaimer

This tool is an **independent implementation** using publicly available web speed testing methodologies. No proprietary code, protocols, or assets have been used from any third-party speed testing services.

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For issues or questions:
- Check ARCHITECTURE.md for technical details
- Review this README thoroughly
- Open an issue on GitHub

## Acknowledgments

Built with modern web technologies following industry best practices for speed testing methodologies.
