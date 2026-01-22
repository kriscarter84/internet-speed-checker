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
      const url = `${downloadUrl}?size=${chunkSize}&nonce=${nonce}`

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

        // Calculate current Mbps
        const currentMbps = (data.byteLength * 8) / (chunkDuration * 1000)
        samples.push(currentMbps)

        // Report progress every 100ms
        if (chunkEnd - lastUpdate >= 100 && onProgress) {
          const avgMbps = (totalBytes * 8) / ((chunkEnd - startTime) * 1000)
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
  const totalDuration = (endTime - startTime) / 1000

  // Filter out warm-up samples (first 2 seconds)
  const filteredSamples = samples.slice(Math.floor(samples.length * 0.1))

  // Calculate final Mbps (average of filtered samples)
  const avgMbps = filteredSamples.reduce((a, b) => a + b, 0) / filteredSamples.length

  return {
    mbps: parseFloat(avgMbps.toFixed(2)),
    samples: filteredSamples,
    duration: totalDuration,
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

        const result = await response.json()
        const chunkEnd = performance.now()
        const chunkDuration = chunkEnd - chunkStart

        totalBytes += result.bytesReceived

        // Calculate current Mbps
        const currentMbps = (result.bytesReceived * 8) / (chunkDuration * 1000)
        samples.push(currentMbps)

        // Report progress every 100ms
        if (chunkEnd - lastUpdate >= 100 && onProgress) {
          const avgMbps = (totalBytes * 8) / ((chunkEnd - startTime) * 1000)
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
  const totalDuration = (endTime - startTime) / 1000

  // Filter out warm-up samples (first 2 seconds)
  const filteredSamples = samples.slice(Math.floor(samples.length * 0.1))

  // Calculate final Mbps (average of filtered samples)
  const avgMbps = filteredSamples.reduce((a, b) => a + b, 0) / filteredSamples.length

  return {
    mbps: parseFloat(avgMbps.toFixed(2)),
    samples: filteredSamples,
    duration: totalDuration,
  }
}

// Determine optimal connection count based on speed
export function getOptimalConnections(estimatedMbps: number): number {
  if (estimatedMbps < 10) return 2
  if (estimatedMbps < 50) return 4
  if (estimatedMbps < 200) return 6
  return 8
}

// Get chunk size based on connection speed
export function getChunkSize(estimatedMbps: number, type: 'download' | 'upload'): number {
  if (type === 'download') {
    if (estimatedMbps < 10) return 512 * 1024 // 512KB
    if (estimatedMbps < 50) return 1024 * 1024 // 1MB
    if (estimatedMbps < 200) return 5 * 1024 * 1024 // 5MB
    return 10 * 1024 * 1024 // 10MB
  } else {
    // Upload chunks are smaller
    if (estimatedMbps < 10) return 256 * 1024 // 256KB
    if (estimatedMbps < 50) return 512 * 1024 // 512KB
    if (estimatedMbps < 200) return 2 * 1024 * 1024 // 2MB
    return 5 * 1024 * 1024 // 5MB
  }
}
