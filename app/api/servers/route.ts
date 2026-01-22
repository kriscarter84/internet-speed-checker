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
      // Always include local server for fastest testing
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
    ]
    
    // Add region-specific servers based on continent
    if (userContinent === 'OC' || userCountry === 'Australia') {
      // Oceania / Australia
      servers.push(
        {
          id: 'sydney-1',
          name: 'Sydney',
          location: 'Sydney, Australia',
          distance: 1,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        },
        {
          id: 'melbourne-1',
          name: 'Melbourne',
          location: 'Melbourne, Australia',
          distance: 2,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        },
        {
          id: 'singapore-1',
          name: 'Singapore',
          location: 'Singapore',
          distance: 3,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        }
      )
    } else if (userContinent === 'AS') {
      // Asia
      servers.push(
        {
          id: 'singapore-1',
          name: 'Singapore',
          location: 'Singapore',
          distance: 1,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        },
        {
          id: 'tokyo-1',
          name: 'Tokyo',
          location: 'Tokyo, Japan',
          distance: 2,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        },
        {
          id: 'mumbai-1',
          name: 'Mumbai',
          location: 'Mumbai, India',
          distance: 3,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        }
      )
    } else if (userContinent === 'EU') {
      // Europe
      servers.push(
        {
          id: 'london-1',
          name: 'London',
          location: 'London, UK',
          distance: 1,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        },
        {
          id: 'frankfurt-1',
          name: 'Frankfurt',
          location: 'Frankfurt, Germany',
          distance: 2,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        },
        {
          id: 'paris-1',
          name: 'Paris',
          location: 'Paris, France',
          distance: 3,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        }
      )
    } else if (userContinent === 'NA') {
      // North America
      servers.push(
        {
          id: 'new-york-1',
          name: 'New York',
          location: 'New York, USA',
          distance: 1,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        },
        {
          id: 'san-francisco-1',
          name: 'San Francisco',
          location: 'San Francisco, USA',
          distance: 2,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        },
        {
          id: 'toronto-1',
          name: 'Toronto',
          location: 'Toronto, Canada',
          distance: 3,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        }
      )
    } else {
      // Default global servers
      servers.push(
        {
          id: 'us-east-1',
          name: 'US East',
          location: 'Virginia, USA',
          distance: 2,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        },
        {
          id: 'europe-1',
          name: 'Europe',
          location: 'London, UK',
          distance: 3,
          endpoints: {
            ping: '/api/ping',
            download: '/api/download',
            upload: '/api/upload',
          },
        },
        {
          id: 'asia-1',
          name: 'Asia',
          location: 'Singapore',
          distance: 4,
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
