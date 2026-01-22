import { NextRequest, NextResponse } from 'next/server'
import { saveTestResult, getRecentResults, hashIP, TestResult } from '@/lib/database'

export async function POST(request: NextRequest) {
  try {
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
    
    return NextResponse.json({ results })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch results' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    const Database = require('better-sqlite3')
    const path = require('path')
    const dbPath = path.join(process.cwd(), 'speedtest.db')
    const db = new Database(dbPath)
    
    db.prepare('DELETE FROM test_results').run()
    db.close()
    
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to clear history' },
      { status: 500 }
    )
  }
}
