// Network detection utilities

export interface NetworkInfo {
  type: 'wifi' | 'ethernet' | 'cellular' | '4g' | '3g' | '2g' | 'slow-2g' | 'unknown'
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | 'unknown'
  downlink?: number // Mbps
  rtt?: number // ms
  saveData: boolean
}

export function getNetworkInfo(): NetworkInfo {
  // Check if we're in a browser environment
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      type: 'unknown',
      effectiveType: 'unknown',
      saveData: false,
    }
  }

  // Check if Network Information API is available
  const connection = (navigator as any).connection || 
                    (navigator as any).mozConnection || 
                    (navigator as any).webkitConnection

  if (!connection) {
    return {
      type: 'unknown',
      effectiveType: 'unknown',
      saveData: false,
    }
  }

  // Get connection type
  let type: NetworkInfo['type'] = 'unknown'
  if (connection.type) {
    type = connection.type
  } else if (connection.effectiveType) {
    // Estimate type based on effective type
    switch (connection.effectiveType) {
      case 'slow-2g':
      case '2g':
      case '3g':
        type = 'cellular'
        break
      case '4g':
        type = connection.type === 'wifi' ? 'wifi' : '4g'
        break
      default:
        type = 'unknown'
    }
  }

  return {
    type,
    effectiveType: connection.effectiveType || 'unknown',
    downlink: connection.downlink,
    rtt: connection.rtt,
    saveData: connection.saveData || false,
  }
}

export function getNetworkTypeDisplay(networkInfo: NetworkInfo): string {
  switch (networkInfo.type) {
    case 'wifi':
      return 'WiFi'
    case 'ethernet':
      return 'Ethernet'
    case 'cellular':
    case '4g':
      return '4G/LTE'
    case '3g':
      return '3G'
    case '2g':
      return '2G'
    case 'slow-2g':
      return 'Slow 2G'
    default:
      return 'Unknown'
  }
}

export function getNetworkIcon(networkInfo: NetworkInfo): string {
  switch (networkInfo.type) {
    case 'wifi':
      return '📶'
    case 'ethernet':
      return '🔌'
    case 'cellular':
    case '4g':
    case '3g':
    case '2g':
    case 'slow-2g':
      return '📱'
    default:
      return '🌐'
  }
}
