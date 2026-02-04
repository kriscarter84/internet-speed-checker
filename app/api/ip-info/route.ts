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
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 3000)
        
        const ipResponse = await fetch('https://api.ipify.org?format=json', {
          signal: controller.signal,
        })
        clearTimeout(timeout)
        
        if (ipResponse.ok) {
          const ipData = await ipResponse.json()
          // Validate IP format
          if (typeof ipData.ip === 'string' && /^[\d.:a-fA-F]+$/.test(ipData.ip)) {
            clientIp = ipData.ip
          }
        }
      } catch (error) {
        console.error('[IP Info] Failed to fetch public IP:', error instanceof Error ? error.message : 'Unknown error')
      }
    }
    
    // Try to get ISP info from ip-api.com
    let ispInfo = null
    
    if (clientIp && clientIp !== 'unknown' && !clientIp.startsWith('127.') && !clientIp.startsWith('192.168.') && !clientIp.startsWith('10.') && clientIp !== '::1') {
      try {
        // Validate IP format to prevent SSRF attacks
        if (!/^[\d.:a-fA-F]+$/.test(clientIp)) {
          throw new Error('Invalid IP format')
        }
        
        console.log('[IP Info] Fetching ISP info for IP:', clientIp)
        
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000) // Increased to 5 seconds
        
        const response = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,country,countryCode,region,regionName,city,isp,org,as,query`, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'SpeedTestApp/1.0'
          }
        })
        clearTimeout(timeout)
        
        console.log('[IP Info] API response status:', response.status)
        
        if (response.ok) {
          const data = await response.json()
          console.log('[IP Info] API response data:', data)
          
          if (data.status === 'success') {
            ispInfo = {
              ip: data.query || clientIp,
              isp: data.isp || 'Unknown ISP',
              org: data.org || data.isp || 'Unknown',
              as: data.as || null,
              city: data.city || null,
              region: data.regionName || null,
              country: data.country || null,
              countryCode: data.countryCode || null,
            }
          } else {
            console.error('[IP Info] API returned error status:', data)
          }
        }
      } catch (error) {
        console.error('[IP Info] Failed to fetch ISP info from ip-api.com:', error instanceof Error ? error.message : 'Unknown error')
        
        // Try alternative API: ipapi.co as fallback
        try {
          console.log('[IP Info] Trying fallback API: ipapi.co')
          const controller2 = new AbortController()
          const timeout2 = setTimeout(() => controller2.abort(), 5000)
          
          const fallbackResponse = await fetch(`https://ipapi.co/${clientIp}/json/`, {
            signal: controller2.signal,
            headers: {
              'User-Agent': 'SpeedTestApp/1.0'
            }
          })
          clearTimeout(timeout2)
          
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json()
            console.log('[IP Info] Fallback API response:', fallbackData)
            
            if (!fallbackData.error) {
              ispInfo = {
                ip: fallbackData.ip || clientIp,
                isp: fallbackData.org || 'Unknown ISP',
                org: fallbackData.org || 'Unknown',
                as: fallbackData.asn || null,
                city: fallbackData.city || null,
                region: fallbackData.region || null,
                country: fallbackData.country_name || null,
                countryCode: fallbackData.country_code || null,
              }
            }
          }
        } catch (fallbackError) {
          console.error('[IP Info] Fallback API also failed:', fallbackError instanceof Error ? fallbackError.message : 'Unknown error')
        }
      }
    } else {
      console.log('[IP Info] Skipping ISP lookup - IP is:', clientIp)
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
    
    return NextResponse.json(ispInfo, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      }
    })
  } catch (error) {
    console.error('[IP Info] Unexpected error:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json(
      { error: 'Failed to get IP info' },
      { status: 500 }
    )
  }
}
