import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  return NextResponse.json({
    timestamp: Date.now(),
    server: 'server-1',
  })
}
