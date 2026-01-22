import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Get client IP from headers
    const forwarded = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')
    let clientIp = forwarded?.split(',')[0] || realIp || 'unknown'
    
    // Check if it's localhost/private IP
    const isLocalhost = clientIp === 'unknown' || 
                        clientIp === '::1' || 
                        clientIp === '127.0.0.1' || 
                        clientIp.startsWith('127.') || 
                        clientIp.startsWith('192.168.') || 
                        clientIp.startsWith('10.') ||
                        clientIp.startsWith('172.16.') ||
                        clientIp.startsWith('172.17.') ||
                        clientIp.startsWith('172.18.') ||
                        clientIp.startsWith('172.19.') ||
                        clientIp.startsWith('172.20.') ||
                        clientIp.startsWith('172.21.') ||
                        clientIp.startsWith('172.22.') ||
                        clientIp.startsWith('172.23.') ||
                        clientIp.startsWith('172.24.') ||
                        clientIp.startsWith('172.25.') ||
                        clientIp.startsWith('172.26.') ||
                        clientIp.startsWith('172.27.') ||
                        clientIp.startsWith('172.28.') ||
                        clientIp.startsWith('172.29.') ||
                        clientIp.startsWith('172.30.') ||
                        clientIp.startsWith('172.31.')
    
    // If localhost, try to get real public IP from external service
    if (isLocalhost) {
      try {
        // Try ipify first (simple and fast)
        const ipResponse = await fetch('https://api.ipify.org?format=json', {
          signal: AbortSignal.timeout(3000),
        })
        if (ipResponse.ok) {
          const ipData = await ipResponse.json()
          clientIp = ipData.ip
        }
      } catch (error) {
        console.error('Failed to fetch public IP:', error)
      }
    }
    
    // Try to get ISP info from ip-api.com
    let ispInfo = null
    
    if (clientIp && clientIp !== 'unknown' && !clientIp.startsWith('127.') && !clientIp.startsWith('192.168.') && !clientIp.startsWith('10.') && clientIp !== '::1') {
      try {
        const response = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,country,countryCode,region,regionName,city,isp,org,as,query`, {
          signal: AbortSignal.timeout(3000),
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.status === 'success') {
            ispInfo = {
              ip: data.query,
              isp: data.isp,
              org: data.org,
              as: data.as,
              city: data.city,
              region: data.regionName,
              country: data.country,
              countryCode: data.countryCode,
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch ISP info:', error)
      }
    }
    
    // If ISP lookup failed, return basic info with the IP we found
    if (!ispInfo) {
      ispInfo = {
        ip: clientIp,
        isp: isLocalhost ? 'Local Development' : 'Unknown',
        org: isLocalhost ? 'localhost' : 'Unknown',
        as: null,
        city: null,
        region: null,
        country: null,
        countryCode: null,
      }
    }
    
    return NextResponse.json(ispInfo)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get IP info' },
      { status: 500 }
    )
  }
}
