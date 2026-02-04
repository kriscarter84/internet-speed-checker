import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Get user's location from IP info
    const forwarded = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')
    let clientIp = forwarded?.split(',')[0] || realIp || 'unknown'
    
    // Check if localhost
    const isLocalhost = clientIp === 'unknown' || 
                        clientIp === '::1' || 
                        clientIp === '127.0.0.1' || 
                        clientIp.startsWith('127.') || 
                        clientIp.startsWith('192.168.') || 
                        clientIp.startsWith('10.')
    
    // Get real IP if localhost
    if (isLocalhost) {
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json', {
          signal: AbortSignal.timeout(2000),
        })
        if (ipResponse.ok) {
          const ipData = await ipResponse.json()
          clientIp = ipData.ip
        }
      } catch (error) {
        console.error('Failed to fetch public IP')
      }
    }
    
    // Get user's country/region
    let userCountry = 'Unknown'
    let userContinent = 'Unknown'
    
    if (clientIp && clientIp !== 'unknown') {
      try {
        const geoResponse = await fetch(`http://ip-api.com/json/${clientIp}?fields=country,continentCode,city`, {
          signal: AbortSignal.timeout(2000),
        })
        if (geoResponse.ok) {
          const geoData = await geoResponse.json()
          userCountry = geoData.country || 'Unknown'
          userContinent = geoData.continentCode || 'Unknown'
        }
      } catch (error) {
        console.error('Failed to fetch geo info')
      }
    }
    
    // Build dynamic server list based on user location
    const servers = [
      // Cloudflare (global CDN - always include)
      {
        id: 'cloudflare-global',
        name: 'Cloudflare Global',
        location: 'Global CDN',
        distance: 1,
        endpoints: {
          ping: 'https://speed.cloudflare.com/__down?bytes=1',
          download: 'https://speed.cloudflare.com/__down',
          upload: 'https://speed.cloudflare.com/__up',
        },
      },
    ]

    // Add region-specific servers based on continent
    if (userContinent === 'NA') {
      // North America - prioritize US servers
      servers.push(
        {
          id: 'fastly-us',
          name: 'Fastly US',
          location: 'United States',
          distance: 2,
          endpoints: {
            ping: 'https://www.fastly.com/favicon.ico',
            download: 'https://www.fastly.com',
            upload: '/api/upload',
          },
        },
        {
          id: 'local-server',
          name: 'Local Server',
          location: 'Your Location',
          distance: 0,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        }
      )
    } else if (userContinent === 'EU') {
      // Europe - prioritize EU servers
      servers.push(
        {
          id: 'fastly-eu',
          name: 'Fastly Europe',
          location: 'Europe',
          distance: 2,
          endpoints: {
            ping: 'https://www.fastly.com/favicon.ico',
            download: 'https://www.fastly.com',
            upload: '/api/upload',
          },
        },
        {
          id: 'local-server',
          name: 'Local Server',
          location: 'Your Location',
          distance: 0,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        }
      )
    } else if (userContinent === 'AS') {
      // Asia - prioritize Asia-Pacific servers
      servers.push(
        {
          id: 'fastly-asia',
          name: 'Fastly Asia',
          location: 'Asia Pacific',
          distance: 2,
          endpoints: {
            ping: 'https://www.fastly.com/favicon.ico',
            download: 'https://www.fastly.com',
            upload: '/api/upload',
          },
        },
        {
          id: 'local-server',
          name: 'Local Server',
          location: 'Your Location',
          distance: 0,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        }
      )
    } else if (userContinent === 'OC') {
      // Oceania - prioritize Australia/NZ servers
      servers.push(
        {
          id: 'cloudflare-oceania',
          name: 'Cloudflare Oceania',
          location: 'Australia/NZ',
          distance: 2,
          endpoints: {
            ping: 'https://speed.cloudflare.com/__down?bytes=1',
            download: 'https://speed.cloudflare.com/__down',
            upload: 'https://speed.cloudflare.com/__up',
          },
        },
        {
          id: 'local-server',
          name: 'Local Server',
          location: 'Your Location',
          distance: 0,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        }
      )
    } else if (userContinent === 'SA') {
      // South America
      servers.push(
        {
          id: 'cloudflare-sa',
          name: 'Cloudflare Americas',
          location: 'South America',
          distance: 2,
          endpoints: {
            ping: 'https://speed.cloudflare.com/__down?bytes=1',
            download: 'https://speed.cloudflare.com/__down',
            upload: 'https://speed.cloudflare.com/__up',
          },
        },
        {
          id: 'local-server',
          name: 'Local Server',
          location: 'Your Location',
          distance: 0,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        }
      )
    } else if (userContinent === 'AF') {
      // Africa
      servers.push(
        {
          id: 'cloudflare-africa',
          name: 'Cloudflare Africa',
          location: 'Africa',
          distance: 2,
          endpoints: {
            ping: 'https://speed.cloudflare.com/__down?bytes=1',
            download: 'https://speed.cloudflare.com/__down',
            upload: 'https://speed.cloudflare.com/__up',
          },
        },
        {
          id: 'local-server',
          name: 'Local Server',
          location: 'Your Location',
          distance: 0,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        }
      )
    } else {
      // Unknown location - provide global options
      servers.push(
        {
          id: 'local-server',
          name: 'Local Server',
          location: 'Your Location',
          distance: 0,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        }
      )
    }

    return NextResponse.json({
      servers,
      userLocation: {
        country: userCountry,
        continent: userContinent,
        ip: clientIp,
      },
    })
  } catch (error) {
    console.error('Error generating server list:', error)
    
    // Fallback to basic local server
    return NextResponse.json({
      servers: [
        {
          id: 'local-server',
          name: 'Local Server',
          location: 'Your Location',
          distance: 0,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        },
      ],
      userLocation: {
        country: 'Unknown',
        continent: 'Unknown',
        ip: 'unknown',
      },
    })
  }
}
