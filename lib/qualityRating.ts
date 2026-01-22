// Connection quality rating system

export interface QualityRating {
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'
  score: number // 0-100
  description: string
  color: string
  suitableFor: string[]
}

export function calculateConnectionQuality(
  downloadMbps: number,
  uploadMbps: number,
  ping: number,
  jitter: number
): QualityRating {
  let score = 0

  // Download speed scoring (40 points max)
  if (downloadMbps >= 100) score += 40
  else if (downloadMbps >= 50) score += 35
  else if (downloadMbps >= 25) score += 30
  else if (downloadMbps >= 10) score += 20
  else if (downloadMbps >= 5) score += 10
  else score += (downloadMbps / 5) * 10

  // Upload speed scoring (30 points max)
  if (uploadMbps >= 50) score += 30
  else if (uploadMbps >= 20) score += 25
  else if (uploadMbps >= 10) score += 20
  else if (uploadMbps >= 5) score += 15
  else if (uploadMbps >= 2) score += 10
  else score += (uploadMbps / 2) * 10

  // Ping scoring (20 points max)
  if (ping <= 20) score += 20
  else if (ping <= 50) score += 15
  else if (ping <= 100) score += 10
  else if (ping <= 150) score += 5
  else score += Math.max(0, 5 - (ping - 150) / 50)

  // Jitter scoring (10 points max)
  if (jitter <= 5) score += 10
  else if (jitter <= 15) score += 7
  else if (jitter <= 30) score += 4
  else if (jitter <= 50) score += 2
  else score += Math.max(0, 2 - (jitter - 50) / 50)

  // Determine grade
  let grade: QualityRating['grade']
  let description: string
  let color: string
  let suitableFor: string[]

  if (score >= 90) {
    grade = 'A+'
    description = 'Excellent - Perfect for any online activity'
    color = '#10b981' // green
    suitableFor = [
      '8K streaming',
      'Large file transfers',
      'Professional gaming',
      'Video conferencing (50+ participants)',
      'VR/AR applications',
    ]
  } else if (score >= 80) {
    grade = 'A'
    description = 'Great - Excellent for demanding tasks'
    color = '#22c55e' // light green
    suitableFor = [
      '4K streaming on multiple devices',
      'Competitive gaming',
      'Video conferencing (20+ participants)',
      'Large downloads',
    ]
  } else if (score >= 70) {
    grade = 'B'
    description = 'Good - Suitable for most online activities'
    color = '#3b82f6' // blue
    suitableFor = [
      '4K streaming',
      'Online gaming',
      'Video conferencing (10 participants)',
      'Remote work',
      'Smart home devices',
    ]
  } else if (score >= 55) {
    grade = 'C'
    description = 'Fair - Adequate for basic tasks'
    color = '#f59e0b' // orange
    suitableFor = [
      'HD streaming',
      'Casual gaming',
      'Video calls (1-on-1)',
      'Web browsing',
      'Email',
    ]
  } else if (score >= 40) {
    grade = 'D'
    description = 'Below Average - May experience buffering'
    color = '#ef4444' // red
    suitableFor = [
      'SD streaming',
      'Light web browsing',
      'Email',
      'Social media',
    ]
  } else {
    grade = 'F'
    description = 'Poor - Limited functionality'
    color = '#991b1b' // dark red
    suitableFor = [
      'Text-based content',
      'Email (text only)',
      'Basic web browsing',
    ]
  }

  return {
    grade,
    score: Math.round(score),
    description,
    color,
    suitableFor,
  }
}

export function getSpeedCategory(mbps: number): string {
  if (mbps >= 100) return 'Ultra Fast'
  if (mbps >= 50) return 'Very Fast'
  if (mbps >= 25) return 'Fast'
  if (mbps >= 10) return 'Moderate'
  if (mbps >= 5) return 'Slow'
  return 'Very Slow'
}

export function getLatencyCategory(ping: number): string {
  if (ping <= 20) return 'Excellent'
  if (ping <= 50) return 'Good'
  if (ping <= 100) return 'Fair'
  if (ping <= 150) return 'Poor'
  return 'Very Poor'
}
