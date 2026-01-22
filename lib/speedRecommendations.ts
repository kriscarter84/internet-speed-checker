export interface SpeedRecommendation {
  activity: string
  requiredSpeed: number // Mbps
  description: string
  icon: string
}

export interface ConnectionCapabilities {
  canSupport: SpeedRecommendation[]
  cannotSupport: SpeedRecommendation[]
  streamCount: {
    hd: number // 720p streams
    fullHd: number // 1080p streams
    fourK: number // 4K streams
  }
}

const ACTIVITIES: SpeedRecommendation[] = [
  { activity: 'Web Browsing', requiredSpeed: 1, description: 'Basic websites and email', icon: '🌐' },
  { activity: 'Social Media', requiredSpeed: 3, description: 'Scrolling feeds and viewing photos', icon: '📱' },
  { activity: 'Music Streaming', requiredSpeed: 2, description: 'High quality audio playback', icon: '🎵' },
  { activity: 'SD Video (480p)', requiredSpeed: 3, description: 'Standard definition streaming', icon: '📺' },
  { activity: 'HD Video (720p)', requiredSpeed: 5, description: 'High definition streaming', icon: '🎬' },
  { activity: 'Full HD (1080p)', requiredSpeed: 8, description: 'Full high definition streaming', icon: '📹' },
  { activity: '4K Streaming', requiredSpeed: 25, description: 'Ultra high definition content', icon: '🎞️' },
  { activity: 'Video Calls (1:1)', requiredSpeed: 2, description: 'Standard video conferencing', icon: '💬' },
  { activity: 'Video Calls (Group)', requiredSpeed: 4, description: 'Multi-person video meetings', icon: '👥' },
  { activity: 'Online Gaming', requiredSpeed: 10, description: 'Multiplayer gaming with low latency', icon: '🎮' },
  { activity: 'Game Downloads', requiredSpeed: 50, description: 'Fast downloads of large games', icon: '💾' },
  { activity: 'Large File Transfers', requiredSpeed: 30, description: 'Cloud backups and file sharing', icon: '☁️' },
  { activity: 'Remote Work', requiredSpeed: 10, description: 'VPN, file sharing, video calls', icon: '💼' },
  { activity: 'Smart Home Devices', requiredSpeed: 5, description: 'Multiple IoT devices connected', icon: '🏠' },
]

export function analyzeConnection(downloadSpeed: number, uploadSpeed: number, ping: number): ConnectionCapabilities {
  // Determine what activities are supported
  const canSupport: SpeedRecommendation[] = []
  const cannotSupport: SpeedRecommendation[] = []

  for (const activity of ACTIVITIES) {
    if (downloadSpeed >= activity.requiredSpeed) {
      canSupport.push(activity)
    } else {
      cannotSupport.push(activity)
    }
  }

  // Calculate simultaneous streaming capacity
  const streamCount = {
    hd: Math.floor(downloadSpeed / 5), // 720p requires ~5 Mbps
    fullHd: Math.floor(downloadSpeed / 8), // 1080p requires ~8 Mbps
    fourK: Math.floor(downloadSpeed / 25), // 4K requires ~25 Mbps
  }

  return {
    canSupport,
    cannotSupport,
    streamCount,
  }
}

export function getSpeedCategory(downloadSpeed: number): {
  category: string
  description: string
  color: string
  icon: string
} {
  if (downloadSpeed >= 1000) {
    return {
      category: 'Ultra-Fast',
      description: 'Gigabit speeds - Professional grade',
      color: '#a855f7',
      icon: '🚀',
    }
  } else if (downloadSpeed >= 500) {
    return {
      category: 'Very Fast',
      description: 'Excellent for power users',
      color: '#8b5cf6',
      icon: '⚡',
    }
  } else if (downloadSpeed >= 100) {
    return {
      category: 'Fast',
      description: 'Great for households and work',
      color: '#06b6d4',
      icon: '💨',
    }
  } else if (downloadSpeed >= 50) {
    return {
      category: 'Good',
      description: 'Suitable for most activities',
      color: '#10b981',
      icon: '✅',
    }
  } else if (downloadSpeed >= 25) {
    return {
      category: 'Moderate',
      description: 'Basic streaming and browsing',
      color: '#f59e0b',
      icon: '📊',
    }
  } else if (downloadSpeed >= 10) {
    return {
      category: 'Slow',
      description: 'Limited to light usage',
      color: '#ef4444',
      icon: '🐌',
    }
  } else {
    return {
      category: 'Very Slow',
      description: 'Struggles with modern content',
      color: '#dc2626',
      icon: '⚠️',
    }
  }
}

export function compareToISP(actualSpeed: number, advertisedSpeed: number): {
  percentage: number
  verdict: string
  color: string
} {
  const percentage = (actualSpeed / advertisedSpeed) * 100

  if (percentage >= 90) {
    return {
      percentage,
      verdict: 'Excellent - Getting advertised speeds',
      color: '#10b981',
    }
  } else if (percentage >= 70) {
    return {
      percentage,
      verdict: 'Good - Close to advertised speeds',
      color: '#06b6d4',
    }
  } else if (percentage >= 50) {
    return {
      percentage,
      verdict: 'Fair - Below advertised speeds',
      color: '#f59e0b',
    }
  } else {
    return {
      percentage,
      verdict: 'Poor - Significantly below advertised',
      color: '#ef4444',
    }
  }
}
