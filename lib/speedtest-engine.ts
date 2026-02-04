// Speed Test Engine - Client-side measurement logic

// Cache for pre-generated random data
const uploadDataCache = new Map<number, Uint8Array>()

export interface Server {
  id: string
  name: string
  location: string
  endpoints: {
    ping: string
    download: string
    upload: string
  }
}

export interface LatencyResult {
  ping: number
  jitter: number
  samples: number[]
}

export interface SpeedResult {
  mbps: number
  samples: number[]
  duration: number
  bytesTransferred?: number
}

export interface ProgressInfo {
  mbps: number
  bytesTransferred: number
  connections: number
  timeElapsed: number
  timeRemaining: number
}

// Measure latency to a server
export async function measureLatency(
  pingUrl: string,
  count: number = 20
): Promise<LatencyResult> {
  const samples: number[] = []

  for (let i = 0; i < count; i++) {
    const start = performance.now()
    
    try {
      await fetch(pingUrl, {
        method: 'GET',
        cache: 'no-cache',
      })
      
      const end = performance.now()
      samples.push(end - start)
    } catch (error) {
      console.error('Ping failed:', error)
    }

    // Small delay between pings
    if (i < count - 1) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }

  // Calculate median ping
  const sorted = [...samples].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]

  // Calculate jitter (standard deviation)
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  const variance = samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / samples.length
  const jitter = Math.sqrt(variance)

  return {
    ping: parseFloat(median.toFixed(2)),
    jitter: parseFloat(jitter.toFixed(2)),
    samples,
  }
}

// Select best server based on latency
export async function selectBestServer(servers: Server[]): Promise<Server> {
  // Filter out local server for best server selection
  const remoteServers = servers.filter(s => s.id !== 'local-server')
  
  // If no remote servers available, use all servers
  const serversToTest = remoteServers.length > 0 ? remoteServers : servers
  
  const latencies = await Promise.all(
    serversToTest.map(async (server) => {
      try {
        const result = await measureLatency(server.endpoints.ping, 5)
        return { server, latency: result.ping }
      } catch {
        return { server, latency: 9999 }
      }
    })
  )

  latencies.sort((a, b) => a.latency - b.latency)
  return latencies[0].server
}

// Download speed test with multiple connections
export async function measureDownloadSpeed(
  downloadUrl: string,
  config: {
    connections: number
    chunkSize: number
    duration: number
  },
  onProgress?: (info: ProgressInfo) => void,
  abortSignal?: AbortSignal
): Promise<SpeedResult> {
  const { connections, chunkSize, duration } = config
  const samples: number[] = []
  let totalBytes = 0
  const startTime = performance.now()
  let lastUpdate = startTime

  const downloadChunk = async () => {
    while (true) {
      if (abortSignal?.aborted) break
      
      const elapsed = performance.now() - startTime
      if (elapsed >= duration * 1000) break

      const nonce = Date.now() + Math.random()
      // Support both local format (?size=) and Cloudflare format (?bytes=)
      const isCloudflare = downloadUrl.includes('cloudflare.com')
      const paramName = isCloudflare ? 'bytes' : 'size'
      const url = `${downloadUrl}?${paramName}=${chunkSize}&nonce=${nonce}`

      try {
        const chunkStart = performance.now()
        const response = await fetch(url, {
          cache: 'no-cache',
          signal: abortSignal,
        })

        const data = await response.arrayBuffer()
        const chunkEnd = performance.now()
        const chunkDuration = chunkEnd - chunkStart

        totalBytes += data.byteLength

        // Calculate current Mbps (chunkDuration is in ms, so divide by 1000 to get seconds)
        const currentMbps = (data.byteLength * 8) / ((chunkDuration / 1000) * 1000000)
        samples.push(currentMbps)

        // Report progress every 100ms
        if (chunkEnd - lastUpdate >= 100 && onProgress) {
          const avgMbps = (totalBytes * 8) / (((chunkEnd - startTime) / 1000) * 1000000)
          const timeElapsed = chunkEnd - startTime
          const estimatedTotal = Math.max(20000, duration)
          const timeRemaining = Math.max(0, estimatedTotal - timeElapsed)
          
          onProgress({
            mbps: avgMbps,
            bytesTransferred: totalBytes,
            connections: 1,
            timeElapsed,
            timeRemaining,
          })
          lastUpdate = chunkEnd
        }
      } catch (error) {
        if (abortSignal?.aborted) break
        console.error('Download chunk failed:', error)
      }
    }
  }

  // Start multiple parallel connections
  const promises = Array.from({ length: connections }, () => downloadChunk())
  await Promise.all(promises)

  const endTime = performance.now()
  const totalDuration = (endTime - startTime) / 1000 // Convert ms to seconds

  // Calculate final Mbps based on total bytes transferred and total duration
  // This gives the true aggregate throughput across all connections
  // Formula: (bytes * 8 bits/byte) / seconds / 1,000,000 = Mbps
  const totalMbps = (totalBytes * 8) / totalDuration / 1000000

  console.log('Download test complete:', {
    totalBytes: (totalBytes / 1024 / 1024).toFixed(2) + ' MB',
    totalDuration: totalDuration.toFixed(2) + ' seconds',
    totalMbps: totalMbps.toFixed(2) + ' Mbps',
    samples: samples.length
  })

  return {
    mbps: parseFloat(totalMbps.toFixed(2)),
    samples: samples,
    duration: totalDuration,
    bytesTransferred: totalBytes,
  }
}

// Upload speed test with multiple connections
export async function measureUploadSpeed(
  uploadUrl: string,
  config: {
    connections: number
    chunkSize: number
    duration: number
  },
  onProgress?: (info: ProgressInfo) => void,
  abortSignal?: AbortSignal
): Promise<SpeedResult> {
  const { connections, chunkSize, duration } = config
  const samples: number[] = []
  let totalBytes = 0
  const startTime = performance.now()
  let lastUpdate = startTime

  // Use cached data or generate new
  let data = uploadDataCache.get(chunkSize)
  if (!data) {
    data = new Uint8Array(chunkSize)
    const maxCryptoBytes = 65536
    
    for (let i = 0; i < chunkSize; i += maxCryptoBytes) {
      const chunk = data.subarray(i, Math.min(i + maxCryptoBytes, chunkSize))
      crypto.getRandomValues(chunk)
    }
    
    // Cache for future use (limit cache size)
    if (uploadDataCache.size < 5) {
      uploadDataCache.set(chunkSize, data)
    }
  }

  const uploadChunk = async () => {
    while (true) {
      if (abortSignal?.aborted) break
      
      const elapsed = performance.now() - startTime
      if (elapsed >= duration * 1000) break

      try {
        const chunkStart = performance.now()
        const response = await fetch(uploadUrl, {
          method: 'POST',
          body: data as unknown as BodyInit,
          cache: 'no-cache',
          signal: abortSignal,
        })

        // Handle both Cloudflare (returns text) and local server (returns JSON)
        const isCloudflare = uploadUrl.includes('cloudflare.com')
        let bytesReceived = chunkSize
        
        if (!isCloudflare) {
          const result = await response.json()
          bytesReceived = result.bytesReceived
        } else {
          // Cloudflare doesn't return JSON, just consume the response
          await response.text()
        }
        
        const chunkEnd = performance.now()
        const chunkDuration = chunkEnd - chunkStart

        totalBytes += bytesReceived

        // Calculate current Mbps (chunkDuration is in ms, so divide by 1000 to get seconds)
        const currentMbps = (bytesReceived * 8) / ((chunkDuration / 1000) * 1000000)
        samples.push(currentMbps)

        // Report progress every 100ms
        if (chunkEnd - lastUpdate >= 100 && onProgress) {
          const avgMbps = (totalBytes * 8) / (((chunkEnd - startTime) / 1000) * 1000000)
          const timeElapsed = (chunkEnd - startTime) / 1000
          const timeRemaining = Math.max(0, duration - timeElapsed)
          
          onProgress({
            mbps: avgMbps,
            bytesTransferred: totalBytes,
            connections: connections,
            timeElapsed,
            timeRemaining
          })
          lastUpdate = chunkEnd
        }
      } catch (error) {
        if (abortSignal?.aborted) break
        console.error('Upload chunk failed:', error)
      }
    }
  }

  // Start multiple parallel connections
  const promises = Array.from({ length: connections }, () => uploadChunk())
  await Promise.all(promises)

  const endTime = performance.now()
  const totalDuration = (endTime - startTime) / 1000 // Convert ms to seconds

  // Calculate final Mbps based on total bytes transferred and total duration
  // This gives the true aggregate throughput across all connections
  // Formula: (bytes * 8 bits/byte) / seconds / 1,000,000 = Mbps
  const totalMbps = (totalBytes * 8) / totalDuration / 1000000

  console.log('Upload test complete:', {
    totalBytes: (totalBytes / 1024 / 1024).toFixed(2) + ' MB',
    totalDuration: totalDuration.toFixed(2) + ' seconds',
    totalMbps: totalMbps.toFixed(2) + ' Mbps',
    samples: samples.length
  })

  return {
    mbps: parseFloat(totalMbps.toFixed(2)),
    samples: samples,
    duration: totalDuration,
    bytesTransferred: totalBytes,
  }
}

// Determine optimal connection count based on speed
export function getOptimalConnections(estimatedMbps: number): number {
  if (estimatedMbps < 10) return 4
  if (estimatedMbps < 50) return 6
  if (estimatedMbps < 100) return 10
  if (estimatedMbps < 250) return 14
  return 18 // For high speed connections
}

// Get chunk size based on connection speed
// Use moderate chunk sizes to maintain continuous data flow
export function getChunkSize(estimatedMbps: number, type: 'download' | 'upload'): number {
  if (type === 'download') {
    if (estimatedMbps < 10) return 1 * 1024 * 1024 // 1MB
    if (estimatedMbps < 50) return 2 * 1024 * 1024 // 2MB
    if (estimatedMbps < 100) return 3 * 1024 * 1024 // 3MB
    return 5 * 1024 * 1024 // 5MB - keeps data flowing without long gaps
  } else {
    // Upload chunks should be smaller than download
    if (estimatedMbps < 10) return 512 * 1024 // 512KB
    if (estimatedMbps < 50) return 1 * 1024 * 1024 // 1MB
    if (estimatedMbps < 100) return 1.5 * 1024 * 1024 // 1.5MB
    return 2 * 1024 * 1024 // 2MB
  }
}
