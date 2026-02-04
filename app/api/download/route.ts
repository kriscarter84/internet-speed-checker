import { NextRequest, NextResponse } from 'next/server'

// Pre-generate a large buffer of random data to reuse (much faster than generating on each request)
const CACHE_SIZE = 50 * 1024 * 1024 // 50MB
const cachedBuffer = Buffer.allocUnsafe(CACHE_SIZE)

// Fill with pseudo-random data once at startup
for (let i = 0; i < CACHE_SIZE; i += 1024) {
  const end = Math.min(i + 1024, CACHE_SIZE)
  for (let j = i; j < end; j++) {
    cachedBuffer[j] = Math.floor(Math.random() * 256)
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const sizeParam = searchParams.get('size') || '1048576'
  const nonce = searchParams.get('nonce') || Date.now().toString()
  
  try {
    // Validate input is a number
    const size = parseInt(sizeParam, 10)
    if (isNaN(size) || size < 0) {
      return NextResponse.json(
        { error: 'Invalid size parameter' },
        { status: 400 }
      )
    }

  // Limit size to prevent abuse (max 50MB per request)
  const limitedSize = Math.min(size, 50 * 1024 * 1024)

  // Use cached buffer or slice of it - much faster than generating new random data
  const buffer = limitedSize <= CACHE_SIZE 
    ? cachedBuffer.subarray(0, limitedSize)
    : cachedBuffer

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': limitedSize.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Nonce': nonce,
      },
    })
  } catch (error) {
    console.error('[Download API] Error:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json(
      { error: 'Failed to generate download data' },
      { status: 500 }
    )
  }
}
