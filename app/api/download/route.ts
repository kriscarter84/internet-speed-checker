import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const sizeParam = searchParams.get('size') || '1048576'
  const nonce = searchParams.get('nonce') || Date.now().toString()
  
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

  // Generate random data
  const buffer = Buffer.allocUnsafe(limitedSize)
  
  // Fill with pseudo-random data (faster than crypto.randomBytes for testing purposes)
  for (let i = 0; i < limitedSize; i++) {
    buffer[i] = Math.floor(Math.random() * 256)
  }

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
}
