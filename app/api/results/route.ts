import { NextRequest, NextResponse } from 'next/server'
import { saveTestResult, getRecentResults, hashIP, TestResult } from '@/lib/database'

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(ip: string, maxRequests: number = 5, windowMs: number = 60000): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(ip)
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs })
    return true
  }
  
  if (record.count >= maxRequests) {
    return false
  }
  
  record.count++
  return true
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip)
    }
  }
}, 300000) // Clean every 5 minutes

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               'unknown'
    
    // Check rate limit
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      )
    }
    
    // Validate content length before parsing
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10)
    if (contentLength > 10240) { // Max 10KB for test results
      return NextResponse.json(
        { error: 'Request body too large' },
        { status: 413 }
      )
    }
    
    const body = await request.json() as TestResult
    
    // Validate required fields
    if (!body.serverId || typeof body.ping !== 'number' || 
        typeof body.jitter !== 'number' || 
        typeof body.downloadMbps !== 'number' || 
        typeof body.uploadMbps !== 'number') {
      return NextResponse.json(
        { error: 'Invalid test result data' },
        { status: 400 }
      )
    }
    
    // Sanitize serverId (alphanumeric and hyphens only)
    if (!/^[a-zA-Z0-9-_]+$/.test(body.serverId) || body.serverId.length > 100) {
      return NextResponse.json(
        { error: 'Invalid server ID format' },
        { status: 400 }
      )
    }
    
    // Validate reasonable ranges
    if (body.ping < 0 || body.ping > 10000 ||
        body.jitter < 0 || body.jitter > 1000 ||
        body.downloadMbps < 0 || body.downloadMbps > 100000 ||
        body.uploadMbps < 0 || body.uploadMbps > 100000) {
      return NextResponse.json(
        { error: 'Test result values out of valid range' },
        { status: 400 }
      )
    }
    
    // Get client IP (considering proxies)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               'unknown'
    
    const ipHash = hashIP(ip)
    
    const result = saveTestResult(ipHash, body)
    
    return NextResponse.json({
      success: true,
      id: result.id,
      timestamp: result.timestamp,
    })
  } catch (error) {
    // Log error for debugging but don't expose details to client
    console.error('[Results API] Error saving test result:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json(
      { error: 'Failed to save results' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limitParam = searchParams.get('limit') || '10'
    const limit = parseInt(limitParam, 10)
    
    // Validate limit parameter
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Invalid limit parameter (must be 1-100)' },
        { status: 400 }
      )
    }
    
    const results = getRecentResults(limit)
    
    return NextResponse.json({ results }, {
      headers: {
        'Cache-Control': 'private, max-age=10',
      }
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch results' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Rate limit DELETE operations more strictly
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               'unknown'
    
    if (!checkRateLimit(ip, 2, 300000)) { // Only 2 deletions per 5 minutes
      return NextResponse.json(
        { error: 'Too many delete requests' },
        { status: 429 }
      )
    }
    
    const Database = require('better-sqlite3')
    const path = require('path')
    const dbPath = path.join(process.cwd(), 'speedtest.db')
    const db = new Database(dbPath)
    
    db.prepare('DELETE FROM test_results').run()
    db.close()
    
    console.log(`[Results API] History cleared by IP: ${ip}`)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Results API] Error clearing history:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json(
      { error: 'Failed to clear history' },
      { status: 500 }
    )
  }
}
