# Security Documentation

## Security Improvements Implemented

### 1. **Rate Limiting** ✅
- **POST /api/results**: 5 requests per minute per IP
- **DELETE /api/results**: 2 requests per 5 minutes per IP
- Prevents DoS attacks and abuse
- In-memory rate limiter with automatic cleanup

### 2. **Input Validation** ✅
- **Server ID**: Alphanumeric and hyphens only, max 100 characters
- **Test Results**: Numeric validation with reasonable ranges
  - Ping: 0-10000ms
  - Jitter: 0-1000ms
  - Download: 0-100000 Mbps
  - Upload: 0-100000 Mbps
- **Content Length**: Max 10KB for test results
- **IP Format**: Validated to prevent SSRF attacks

### 3. **SQL Injection Prevention** ✅
- Using parameterized queries with better-sqlite3
- User input sanitized before database insertion
- User-agent strings sanitized (length limit + XSS character removal)

### 4. **XSS Protection** ✅
- Content Security Policy (CSP) headers configured
- User-agent sanitization removes `<>\"'` characters
- X-XSS-Protection header enabled

### 5. **Request Size Limits** ✅
- **Download**: Max 50MB per request
- **Upload**: Max 100MB per request
- **API Requests**: Max 10KB for JSON payloads
- Prevents memory exhaustion attacks

### 6. **Timeout Protection** ✅
- External API calls timeout after 3 seconds
- Prevents hanging requests
- Proper AbortController usage

### 7. **SSRF Prevention** ✅
- IP format validation before external API calls
- Whitelist of allowed external domains
- Private IP ranges blocked from external lookups

### 8. **Security Headers** ✅
- `Strict-Transport-Security`: Force HTTPS
- `X-Frame-Options`: Prevent clickjacking
- `X-Content-Type-Options`: Prevent MIME sniffing
- `Content-Security-Policy`: Control resource loading
- `Referrer-Policy`: Control referrer information
- `Permissions-Policy`: Disable unnecessary browser features

### 9. **Error Handling** ✅
- Errors logged server-side with context
- Generic error messages sent to clients
- No sensitive information exposed in error responses
- Proper HTTP status codes used

### 10. **Privacy Protection** ✅
- IP addresses hashed (SHA-256) before storage
- No personal information stored
- Database records don't expose raw IPs

## Security Best Practices for Deployment

### Environment Variables
Create a `.env.local` file (never commit to git):
```env
# Database encryption key (if implementing encrypted database)
DB_ENCRYPTION_KEY=your-secret-key-here

# API rate limits (optional overrides)
RATE_LIMIT_MAX_REQUESTS=5
RATE_LIMIT_WINDOW_MS=60000

# Enable production mode security
NODE_ENV=production
```

### Database Security
1. **File Permissions**: Ensure `speedtest.db` has restricted permissions
   ```bash
   chmod 600 speedtest.db
   ```

2. **Backup Strategy**: Regular automated backups
   ```bash
   # Add to cron: daily backup at 2 AM
   0 2 * * * cp /path/to/speedtest.db /path/to/backups/speedtest-$(date +\%Y\%m\%d).db
   ```

3. **Database Size**: Implement cleanup for old records
   ```sql
   DELETE FROM test_results WHERE timestamp < (strftime('%s', 'now') - 2592000) * 1000;
   ```

### Production Deployment Checklist

- [ ] Enable HTTPS with valid SSL certificate
- [ ] Set `NODE_ENV=production`
- [ ] Configure firewall rules
- [ ] Set up monitoring and alerting
- [ ] Enable database backups
- [ ] Review and adjust rate limits
- [ ] Add health check endpoint
- [ ] Configure log rotation
- [ ] Set up error tracking (e.g., Sentry)
- [ ] Review and update CSP policy
- [ ] Add API authentication if needed
- [ ] Configure CORS if needed
- [ ] Set up DDoS protection (Cloudflare, etc.)

### Known Limitations

1. **Rate Limiting**: In-memory rate limiting doesn't persist across server restarts. For production, consider Redis-based rate limiting.

2. **No Authentication**: The DELETE endpoint has rate limiting but no authentication. Consider adding API keys or session-based auth for production.

3. **Public API**: All endpoints are public. Consider adding authentication for sensitive operations.

4. **Database**: SQLite is great for development but consider PostgreSQL for high-traffic production deployments.

### Vulnerability Reporting

If you discover a security vulnerability, please email: [your-email@example.com]

**Do not** create a public GitHub issue for security vulnerabilities.

## Security Testing

### Manual Testing
```bash
# Test rate limiting
for i in {1..10}; do curl -X POST http://localhost:3000/api/results -H "Content-Type: application/json" -d '{"serverId":"test","ping":10,"jitter":5,"downloadMbps":100,"uploadMbps":50,"userAgent":"test"}'; done

# Test input validation
curl -X POST http://localhost:3000/api/results -H "Content-Type: application/json" -d '{"serverId":"<script>alert(1)</script>","ping":10,"jitter":5,"downloadMbps":100,"uploadMbps":50,"userAgent":"test"}'

# Test size limits
curl -X GET "http://localhost:3000/api/download?size=999999999999"
```

### Automated Security Scanning
```bash
# Install dependencies
npm audit

# Fix vulnerabilities
npm audit fix

# Check for outdated packages
npm outdated
```

## Regular Maintenance

1. **Weekly**: Check npm audit for vulnerabilities
2. **Monthly**: Review logs for suspicious activity
3. **Quarterly**: Update all dependencies
4. **Yearly**: Full security audit

## Compliance

- **GDPR**: IP addresses are hashed, not stored in plain text
- **CCPA**: Users can request data deletion (implement if needed)
- **PCI DSS**: N/A (no payment processing)

---

Last Updated: February 4, 2026
Security Version: 1.0
