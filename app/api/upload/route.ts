import { NextRequest, NextResponse } from 'next/server'

// Rate limiting for uploads
const uploadRateLimitMap = new Map<string, { count: number; resetTime: number }>()

function checkUploadRateLimit(ip: string, maxRequests: number = 20, windowMs: number = 60000): boolean {
  const now = Date.now()
  const record = uploadRateLimitMap.get(ip)
  
  if (!record || now > record.resetTime) {
    uploadRateLimitMap.set(ip, { count: 1, resetTime: now + windowMs })
    return true
  }
  
  if (record.count >= maxRequests) {
    return false
  }
  
  record.count++
  return true
}

// Maximum upload size: 100MB
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024

export async function POST(request: NextRequest) {
  // Get client IP for rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
             request.headers.get('x-real-ip') || 
             'unknown'
  
  // Check rate limit (20 requests per minute)
  if (!checkUploadRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }
  
  const startTime = Date.now()
  
  try {
    // Check content length before reading
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10)
    if (contentLength > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { error: 'Upload size exceeds maximum allowed' },
        { status: 413 }
      )
    }
    
    // Read the entire request body
    const buffer = await request.arrayBuffer()
    const bytesReceived = buffer.byteLength
    
    // Double-check actual size
    if (bytesReceived > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { error: 'Upload size exceeds maximum allowed' },
        { status: 413 }
      )
    }
    
    const endTime = Date.now()
    const duration = endTime - startTime
    
    // Calculate Mbps
    const mbps = (bytesReceived * 8) / (duration * 1000)

    return NextResponse.json({
      bytesReceived,
      duration,
      mbps: parseFloat(mbps.toFixed(2)),
    })
  } catch (error) {
    console.error('[Upload API] Error:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json(
      { error: 'Failed to process upload' },
      { status: 500 }
    )
  }
}
