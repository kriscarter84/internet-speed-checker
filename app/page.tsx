'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Server,
  measureLatency,
  measureDownloadSpeed,
  measureUploadSpeed,
  selectBestServer,
  getOptimalConnections,
  getChunkSize,
  ProgressInfo,
} from '@/lib/speedtest-engine'
import { getNetworkInfo, getNetworkTypeDisplay, getNetworkIcon, NetworkInfo } from '@/lib/networkDetection'
import { calculateConnectionQuality, QualityRating } from '@/lib/qualityRating'
import { analyzeConnection, ConnectionCapabilities } from '@/lib/speedRecommendations'

type TestPhase = 'idle' | 'selecting' | 'ping' | 'download' | 'upload' | 'complete' | 'error'

interface TestState {
  phase: TestPhase
  server: Server | null
  ping: number
  jitter: number
  downloadSpeed: number
  uploadSpeed: number
  progress: number
  error: string | null
  networkInfo: NetworkInfo | null
  qualityRating: QualityRating | null
  progressInfo: ProgressInfo | null
}

interface HistoricalTest {
  id: string
  timestamp: number
  ping: number
  jitter: number
  download_mbps: number
  upload_mbps: number
  server_id: string
}

interface IPInfo {
  ip: string
  isp: string
  org: string
  city: string | null
  region: string | null
  country: string | null
}

export default function SpeedTest() {
  const [state, setState] = useState<TestState>({
    phase: 'idle',
    server: null,
    ping: 0,
    jitter: 0,
    downloadSpeed: 0,
    uploadSpeed: 0,
    progress: 0,
    error: null,
    networkInfo: null,
    qualityRating: null,
    progressInfo: null,
  })

  const [history, setHistory] = useState<HistoricalTest[]>([])
  const [capabilities, setCapabilities] = useState<ConnectionCapabilities | null>(null)
  const [ipInfo, setIpInfo] = useState<IPInfo | null>(null)
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [isLoadingIPInfo, setIsLoadingIPInfo] = useState(true)

  // Detect network type on mount
  useEffect(() => {
    try {
      const networkInfo = getNetworkInfo()
      setState(prev => ({ ...prev, networkInfo }))
      
      // Fetch test history
      fetchHistory()
      
      // Fetch IP and ISP info
      fetchIPInfo()
    } catch (error) {
      console.error('[Client] Error initializing:', error)
      // Continue anyway - these are non-critical
    }
    
    // Add keyboard shortcuts (with safety check)
    const handleKeyPress = (e: KeyboardEvent) => {
      try {
        // Space or Enter to start test (only when idle)
        if ((e.code === 'Space' || e.code === 'Enter') && state.phase === 'idle') {
          e.preventDefault()
          startTest()
        }
        // Escape to cancel test
        if (e.code === 'Escape' && (state.phase === 'selecting' || state.phase === 'ping' || state.phase === 'download' || state.phase === 'upload')) {
          e.preventDefault()
          cancelTest()
        }
        // ? to show keyboard shortcuts
        if (e.key === '?' && state.phase === 'idle') {
          e.preventDefault()
          setShowKeyboardHelp(true)
        }
        // Escape to close help modal
        if (e.key === 'Escape' && showKeyboardHelp) {
          e.preventDefault()
          setShowKeyboardHelp(false)
        }
      } catch (error) {
        console.error('[Client] Keyboard handler error:', error)
      }
    }
    
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyPress)
      return () => window.removeEventListener('keydown', handleKeyPress)
    }
  }, [state.phase, showKeyboardHelp])

  const fetchIPInfo = async () => {
    setIsLoadingIPInfo(true)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
      
      const response = await fetch('/api/ip-info', {
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      // Validate response data to prevent XSS
      if (data && typeof data === 'object') {
        setIpInfo(data)
      }
    } catch (error) {
      console.error('[Client] Failed to fetch IP info:', error instanceof Error ? error.message : 'Unknown error')
      // Don't set error state, IP info is not critical
    } finally {
      setIsLoadingIPInfo(false)
    }
  }

  const fetchHistory = async () => {
    setIsLoadingHistory(true)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      const response = await fetch('/api/results?limit=5', {
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      // Validate response structure
      if (data && Array.isArray(data.results)) {
        setHistory(data.results)
      }
    } catch (error) {
      console.error('[Client] Failed to fetch history:', error instanceof Error ? error.message : 'Unknown error')
      // Set empty array on error so UI doesn't break
      setHistory([])
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const abortControllerRef = useRef<AbortController | null>(null)

  const startTest = async () => {
    abortControllerRef.current = new AbortController()

    try {
      // Phase 1: Select best server
      setState(prev => ({ ...prev, phase: 'selecting', progress: 0 }))
      
      const serversResponse = await fetch('/api/servers')
      const { servers } = await serversResponse.json()
      
      const bestServer = await selectBestServer(servers)
      setState(prev => ({ ...prev, server: bestServer, progress: 10 }))

      // Phase 2: Measure latency
      setState(prev => ({ ...prev, phase: 'ping', progress: 20 }))
      
      const latencyResult = await measureLatency(bestServer.endpoints.ping, 20)
      setState(prev => ({
        ...prev,
        ping: latencyResult.ping,
        jitter: latencyResult.jitter,
        progress: 30,
      }))

      // Phase 3: Download test (with pre-test)
      setState(prev => ({ ...prev, phase: 'download', progress: 35 }))
      
      // Pre-test with multiple connections for better accuracy on high-speed connections
      const preTest = await measureDownloadSpeed(
        bestServer.endpoints.download,
        { connections: 4, chunkSize: 2 * 1024 * 1024, duration: 3 },
        undefined,
        abortControllerRef.current.signal
      )

      console.log('Pre-test result:', preTest.mbps, 'Mbps')

      // Main download test with optimal connections
      // Use at least 8 connections for any reasonable speed
      const connections = Math.max(8, getOptimalConnections(preTest.mbps))
      const chunkSize = getChunkSize(preTest.mbps, 'download')
      
      console.log('Using', connections, 'connections with', (chunkSize / 1024 / 1024).toFixed(1), 'MB chunks')
      
      const downloadResult = await measureDownloadSpeed(
        bestServer.endpoints.download,
        { connections, chunkSize, duration: 10 },
        (info) => {
          setState(prev => ({
            ...prev,
            downloadSpeed: info.mbps,
            progressInfo: info,
            progress: 35 + (info.mbps / 1000) * 25, // Progress based on speed
          }))
        },
        abortControllerRef.current.signal
      )

      setState(prev => ({
        ...prev,
        downloadSpeed: downloadResult.mbps,
        progress: 60,
      }))

      // Phase 4: Upload test
      setState(prev => ({ ...prev, phase: 'upload', progress: 65 }))
      
      const uploadChunkSize = getChunkSize(downloadResult.mbps, 'upload')
      
      const uploadResult = await measureUploadSpeed(
        bestServer.endpoints.upload,
        { connections, chunkSize: uploadChunkSize, duration: 10 },
        (info) => {
          setState(prev => ({
            ...prev,
            uploadSpeed: info.mbps,
            progressInfo: info,
            progress: 65 + (info.mbps / 1000) * 30,
          }))
        },
        abortControllerRef.current.signal
      )

      setState(prev => ({
        ...prev,
        uploadSpeed: uploadResult.mbps,
        progress: 95,
      }))

      // Save results (don't fail the test if save fails)
      try {
        const saveResponse = await fetch('/api/results', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            serverId: bestServer.id,
            ping: Math.round(latencyResult.ping * 100) / 100, // Round to 2 decimal places
            jitter: Math.round(latencyResult.jitter * 100) / 100,
            downloadMbps: Math.round(downloadResult.mbps * 100) / 100,
            uploadMbps: Math.round(uploadResult.mbps * 100) / 100,
            userAgent: navigator.userAgent.substring(0, 500), // Limit length
            connectionType: (navigator as any).connection?.effectiveType || 'unknown',
          }),
        })
        
        if (!saveResponse.ok) {
          console.warn('[Client] Failed to save test results:', saveResponse.status)
        }
      } catch (saveError) {
        // Log but don't fail the test
        console.error('[Client] Error saving test results:', saveError instanceof Error ? saveError.message : 'Unknown error')
      }

      // Calculate quality rating
      const qualityRating = calculateConnectionQuality(
        downloadResult.mbps,
        uploadResult.mbps,
        latencyResult.ping,
        latencyResult.jitter
      )

      // Analyze connection capabilities
      const connectionCapabilities = analyzeConnection(
        downloadResult.mbps,
        uploadResult.mbps,
        latencyResult.ping
      )

      setState(prev => ({ ...prev, phase: 'complete', progress: 100, qualityRating }))
      setCapabilities(connectionCapabilities)
      
      // Refresh history after test
      fetchHistory()
    } catch (error: any) {
      // Log error for debugging (won't expose to users)
      console.error('[SpeedTest] Test error:', error)
      
      if (error.name === 'AbortError') {
        setState(prev => ({ ...prev, phase: 'idle', progress: 0 }))
      } else {
        // Better error messages - don't expose technical details
        let errorMessage = 'Test failed. Please try again.'
        
        if (error.message?.includes('fetch') || error.message?.includes('network') || error.message?.includes('Failed to fetch')) {
          errorMessage = 'Network connection error. Please check your internet and try again.'
        } else if (error.message?.includes('timeout') || error.message?.includes('aborted')) {
          errorMessage = 'Test timed out. Your connection may be unstable.'
        } else if (error.message?.includes('server') || error.status >= 500) {
          errorMessage = 'Server error. Please try again later.'
        } else if (error.status === 429) {
          errorMessage = 'Too many requests. Please wait a moment and try again.'
        } else if (error.status === 413) {
          errorMessage = 'Request too large. Please try again.'
        }
        
        setState(prev => ({
          ...prev,
          phase: 'error',
          error: errorMessage,
        }))
      }
    } finally {
      abortControllerRef.current = null
    }
  }

  const cancelTest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setState(prev => ({ ...prev, phase: 'idle', progress: 0 }))
  }

  const resetTest = () => {
    const networkInfo = getNetworkInfo()
    setState({
      phase: 'idle',
      server: null,
      ping: 0,
      jitter: 0,
      downloadSpeed: 0,
      uploadSpeed: 0,
      progress: 0,
      error: null,
      networkInfo,
      qualityRating: null,
      progressInfo: null,
    })
    fetchHistory()
  }

  const downloadResultsImage = async () => {
    if (!state.qualityRating) return

    // Create a canvas with the results
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 800
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 800)
    gradient.addColorStop(0, '#1e293b')
    gradient.addColorStop(1, '#0f172a')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 1200, 800)

    // Title
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 48px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('🚀 Speed Test Results', 600, 80)

    // Main metrics
    ctx.font = 'bold 72px sans-serif'
    ctx.fillStyle = '#06b6d4'
    ctx.fillText(state.downloadSpeed.toFixed(1), 300, 250)
    ctx.fillStyle = '#8b5cf6'
    ctx.fillText(state.uploadSpeed.toFixed(1), 900, 250)

    ctx.font = '24px sans-serif'
    ctx.fillStyle = '#94a3b8'
    ctx.fillText('Download', 300, 290)
    ctx.fillText('Upload', 900, 290)
    ctx.fillText('Mbps', 300, 320)
    ctx.fillText('Mbps', 900, 320)

    // Ping & Jitter
    ctx.font = 'bold 36px sans-serif'
    ctx.fillStyle = '#fbbf24'
    ctx.fillText(`${state.ping.toFixed(0)} ms`, 400, 420)
    ctx.fillStyle = '#f97316'
    ctx.fillText(`${state.jitter.toFixed(0)} ms`, 800, 420)

    ctx.font = '20px sans-serif'
    ctx.fillStyle = '#94a3b8'
    ctx.fillText('Ping', 400, 450)
    ctx.fillText('Jitter', 800, 450)

    // Grade
    ctx.font = 'bold 96px sans-serif'
    ctx.fillStyle = getGradeColor(state.qualityRating.grade)
    ctx.fillText(state.qualityRating.grade, 600, 580)

    ctx.font = '24px sans-serif'
    ctx.fillStyle = '#cbd5e1'
    ctx.fillText(state.qualityRating.description, 600, 620)

    // Server info
    ctx.font = '20px sans-serif'
    ctx.fillStyle = '#94a3b8'
    ctx.fillText(`Server: ${state.server?.location}`, 600, 680)
    ctx.fillText(`Tested: ${new Date().toLocaleString()}`, 600, 720)

    // Convert to blob and download
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `speedtest-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A+': case 'A': return '#10b981'
      case 'B': return '#06b6d4'
      case 'C': return '#fbbf24'
      case 'D': return '#f97316'
      case 'F': return '#ef4444'
      default: return '#94a3b8'
    }
  }

  const shareResults = async () => {
    if (!state.qualityRating) return

    const resultsText = `🚀 Internet Speed Test Results

📥 Download: ${state.downloadSpeed.toFixed(1)} Mbps
📤 Upload: ${state.uploadSpeed.toFixed(1)} Mbps
📶 Ping: ${state.ping.toFixed(0)} ms
⚡ Jitter: ${state.jitter.toFixed(0)} ms

🏆 Grade: ${state.qualityRating.grade} (${state.qualityRating.score}/100)
💬 ${state.qualityRating.description}

📍 Server: ${state.server?.location}
${state.networkInfo ? `🔌 Connection: ${getNetworkTypeDisplay(state.networkInfo)}` : ''}

✅ Suitable for: ${state.qualityRating.suitableFor.join(', ')}

Tested at ${new Date().toLocaleString()}`

    try {
      // Check if clipboard API is available
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(resultsText)
        
        // Show a brief toast notification
        const toast = document.createElement('div')
        toast.className = 'fixed top-4 right-4 bg-emerald-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 font-bold'
        toast.textContent = '✓ Results copied to clipboard!'
        document.body.appendChild(toast)
        
        setTimeout(() => {
          toast.remove()
        }, 3000)
      } else {
        // Fallback for browsers without clipboard API
        throw new Error('Clipboard API not available')
      }
    } catch (error) {
      console.error('Failed to copy results:', error)
      // Fallback: Show results in an alert
      alert(resultsText)
    }
  }

  const clearHistory = async () => {
    if (!confirm('Are you sure you want to clear all test history?')) return

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      const response = await fetch('/api/results', {
        method: 'DELETE',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (response.ok) {
        setHistory([])
        
        // Show success toast
        const toast = document.createElement('div')
        toast.className = 'fixed top-4 right-4 bg-emerald-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 font-bold'
        toast.textContent = '✓ History cleared!'
        document.body.appendChild(toast)
        
        setTimeout(() => {
          toast.remove()
        }, 3000)
      } else if (response.status === 429) {
        // Show rate limit error
        const toast = document.createElement('div')
        toast.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 font-bold'
        toast.textContent = '⚠ Too many requests. Please wait.'
        document.body.appendChild(toast)
        
        setTimeout(() => {
          toast.remove()
        }, 3000)
      } else {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
    } catch (error) {
      console.error('[Client] Failed to clear history:', error instanceof Error ? error.message : 'Unknown error')
      
      // Show error toast
      const toast = document.createElement('div')
      toast.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 font-bold'
      toast.textContent = '✗ Failed to clear history'
      document.body.appendChild(toast)
      
      setTimeout(() => {
        toast.remove()
      }, 3000)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900">
      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <header className="text-center mb-8 sm:mb-16">
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-3 tracking-tight">
            Speed Test
          </h1>
          <p className="text-gray-400 text-base sm:text-lg">
            Measure your internet connection speed
          </p>
          
          {/* IP and ISP Info */}
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2 text-xs sm:text-sm">
            {ipInfo ? (
              <>
              <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-full border border-slate-700">
                <span className="text-lg">🌐</span>
                <span className="text-gray-300">{ipInfo.ip}</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-full border border-slate-700">
                <span className="text-lg">📡</span>
                <span className="text-gray-300">{ipInfo.isp}</span>
              </div>
              {ipInfo.city && (
                <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-full border border-slate-700">
                  <span className="text-lg">📍</span>
                  <span className="text-gray-300">{ipInfo.city}, {ipInfo.country}</span>
                </div>
              )}
              </>
            ) : (
              <>
                {/* Loading skeleton */}
                {isLoadingIPInfo ? (
                  <>
                    <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-full border border-slate-700">
                      <span className="text-lg">🌐</span>
                      <div className="skeleton w-24 h-4 rounded"></div>
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-full border border-slate-700">
                      <span className="text-lg">📡</span>
                      <div className="skeleton w-32 h-4 rounded"></div>
                    </div>
                  </>
                ) : (
                  <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-full border border-slate-700">
                    <span className="text-lg">⚠️</span>
                    <span className="text-gray-500 text-xs">Unable to load IP info</span>
                  </div>
                )}
              </>
            )}
          </div>
          
          {/* Keyboard shortcut hint */}
          <button
            onClick={() => setShowKeyboardHelp(true)}
            className="mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1 mx-auto"
            aria-label="Show keyboard shortcuts"
          >
            <span>⌨️</span>
            <span>Keyboard shortcuts</span>
          </button>
          
          {/* Network Info */}
          {state.networkInfo && (
            <div className="mt-2 inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-full border border-slate-700">
              <span className="text-xl sm:text-2xl">{getNetworkIcon(state.networkInfo)}</span>
              <span className="text-xs sm:text-sm text-gray-300">
                {getNetworkTypeDisplay(state.networkInfo)}
              </span>
              {state.networkInfo.downlink && (
                <span className="text-xs text-gray-500">
                  ({state.networkInfo.downlink} Mbps)
                </span>
              )}
            </div>
          )}
        </header>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto">
          {/* Idle State - GO Button */}
          {state.phase === 'idle' && (
            <div className="flex flex-col items-center justify-center py-12 sm:py-20 animate-fade-in">
              <button
                onClick={startTest}
                className="relative group mb-8 sm:mb-12 animate-scale-in"
              >
                {/* Glow effect */}
                <div className="absolute inset-0 rounded-full bg-cyan-500/30 blur-3xl group-hover:bg-cyan-500/50 transition-all duration-500 animate-pulse" />
                
                {/* Button */}
                <div className="relative w-64 h-64 sm:w-80 sm:h-80 rounded-full border-8 sm:border-[12px] border-cyan-400 flex items-center justify-center group-hover:border-cyan-300 group-hover:scale-105 transition-all duration-300 bg-slate-800/50 backdrop-blur-sm">
                  <div className="absolute inset-8 sm:inset-12 rounded-full border-3 sm:border-4 border-cyan-400/30" />
                  <span className="text-7xl sm:text-9xl font-black text-white tracking-wider">
                    GO
                  </span>
                </div>
              </button>

              <p className="text-gray-400 text-xs sm:text-sm">
                Click to start or press <kbd className="px-2 py-1 bg-slate-700 rounded text-cyan-400 font-mono">Space</kbd>
              </p>
            </div>
          )}

          {/* Testing States */}
          {(state.phase === 'selecting' || state.phase === 'ping' || state.phase === 'download' || state.phase === 'upload') && (
            <div className="space-y-8 sm:space-y-12 animate-fade-in">
              {/* Status Label and Progress */}
              <div className="flex items-center justify-between max-w-[500px] mx-auto px-4 gap-4">
                <div className="text-sm sm:text-base md:text-lg text-gray-400 uppercase tracking-wider flex-shrink-0">
                  {state.phase === 'selecting' && 'Selecting Server...'}
                  {state.phase === 'ping' && 'Testing Latency...'}
                  {state.phase === 'download' && 'Testing Download'}
                  {state.phase === 'upload' && 'Testing Upload'}
                </div>
                <div className="text-xl sm:text-2xl font-bold text-cyan-400 flex-shrink-0">
                  {state.progress.toFixed(0)}%
                </div>
              </div>

              {/* Speedometer Gauge */}
              <div className="relative w-full max-w-[500px] mx-auto px-4" style={{ aspectRatio: '5/3' }}>
                <svg className="w-full h-full" viewBox="0 0 500 300" preserveAspectRatio="xMidYMid meet">
                  {/* Background arc */}
                  <path
                    d="M 50 250 A 200 200 0 0 1 450 250"
                    fill="none"
                    stroke="rgba(100, 116, 139, 0.2)"
                    strokeWidth="30"
                    strokeLinecap="round"
                  />
                  
                  {/* Speed gradient arc */}
                  <defs>
                    <linearGradient id="speedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="50%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                  </defs>
                  
                  {/* Active speed arc */}
                  <path
                    d="M 50 250 A 200 200 0 0 1 450 250"
                    fill="none"
                    stroke="url(#speedGradient)"
                    strokeWidth="30"
                    strokeLinecap="round"
                    strokeDasharray="628"
                    strokeDashoffset={628 - ((() => {
                      const speed = state.phase === 'upload' ? state.uploadSpeed : state.downloadSpeed;
                      // Dynamic scale calculation
                      const maxSpeed = speed <= 50 ? 50 : 
                                      speed <= 100 ? 100 : 
                                      speed <= 200 ? 200 : 
                                      speed <= 500 ? 500 : 1000;
                      const percentage = Math.min(speed / maxSpeed, 1);
                      return percentage * 628;
                    })())}
                    className="transition-all duration-500 ease-out"
                  />
                  
                  {/* Speed markers and tick marks */}
                  {(() => {
                    const speed = state.phase === 'upload' ? state.uploadSpeed : state.downloadSpeed;
                    const maxSpeed = speed <= 50 ? 50 : 
                                    speed <= 100 ? 100 : 
                                    speed <= 200 ? 200 : 
                                    speed <= 500 ? 500 : 1000;
                    const markers = [0, maxSpeed * 0.2, maxSpeed * 0.4, maxSpeed * 0.6, maxSpeed * 0.8, maxSpeed];
                    
                    return markers.map((markerSpeed, i) => {
                      const angle = -180 + (i * 36); // Distribute across 180 degrees
                      const rad = (angle * Math.PI) / 180;
                      
                      // Tick mark positions (on the arc)
                      const tickStartX = 250 + Math.cos(rad) * 185;
                      const tickStartY = 250 + Math.sin(rad) * 185;
                      const tickEndX = 250 + Math.cos(rad) * 215;
                      const tickEndY = 250 + Math.sin(rad) * 215;
                      
                      // Text positions (further out from gauge)
                      const textX = 250 + Math.cos(rad) * 235;
                      const textY = 250 + Math.sin(rad) * 235;
                      
                      return (
                        <g key={i}>
                          {/* Tick mark */}
                          <line
                            x1={tickStartX}
                            y1={tickStartY}
                            x2={tickEndX}
                            y2={tickEndY}
                            stroke="rgba(156, 163, 175, 0.4)"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                          {/* Speed label */}
                          <text
                            x={textX}
                            y={textY}
                            fill="rgba(156, 163, 175, 0.6)"
                            fontSize="13"
                            fontWeight="600"
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            {Math.round(markerSpeed)}
                          </text>
                        </g>
                      );
                    });
                  })()}
                  
                  {/* Needle */}
                  <line
                    x1="250"
                    y1="250"
                    x2={250 + Math.cos(((() => {
                      const speed = state.phase === 'upload' ? state.uploadSpeed : state.downloadSpeed;
                      const maxSpeed = speed <= 50 ? 50 : 
                                      speed <= 100 ? 100 : 
                                      speed <= 200 ? 200 : 
                                      speed <= 500 ? 500 : 1000;
                      const percentage = Math.min(speed / maxSpeed, 1);
                      return -180 + (percentage * 180);
                    })() * Math.PI) / 180) * 150}
                    y2={250 + Math.sin(((() => {
                      const speed = state.phase === 'upload' ? state.uploadSpeed : state.downloadSpeed;
                      const maxSpeed = speed <= 50 ? 50 : 
                                      speed <= 100 ? 100 : 
                                      speed <= 200 ? 200 : 
                                      speed <= 500 ? 500 : 1000;
                      const percentage = Math.min(speed / maxSpeed, 1);
                      return -180 + (percentage * 180);
                    })() * Math.PI) / 180) * 150}
                    stroke="rgba(255, 255, 255, 0.7)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    className="transition-all duration-500 ease-out drop-shadow-lg"
                  />
                  
                  {/* Center dot */}
                  <circle cx="250" cy="250" r="12" fill="rgba(255, 255, 255, 0.9)" />
                  <circle cx="250" cy="250" r="6" fill="#06b6d4" />
                </svg>
                
                {/* Speed display */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center">
                  <div className="bg-slate-900/80 backdrop-blur-sm px-4 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl border border-slate-700/50">
                    <div className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tight">
                      {(state.phase === 'upload' ? state.uploadSpeed : state.downloadSpeed).toFixed(1)}
                    </div>
                    <div className="text-base sm:text-lg md:text-xl text-gray-400 mt-1">Mbps</div>
                  </div>
                </div>
              </div>

              {/* Real-time Progress Info */}
              {state.progressInfo && (state.phase === 'download' || state.phase === 'upload') && (
                <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 md:gap-8 text-xs sm:text-sm text-gray-400 px-4">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="whitespace-nowrap">{state.progressInfo.connections} connections</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                    <span className="whitespace-nowrap">{(state.progressInfo.bytesTransferred / 1024 / 1024).toFixed(1)} MB transferred</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="whitespace-nowrap">{state.progressInfo.timeRemaining.toFixed(1)}s remaining</span>
                  </div>
                </div>
              )}

              {/* Ping & Jitter */}
              {state.ping > 0 && (
                <div className="flex items-center justify-center gap-8 sm:gap-16 px-4">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <div className="w-2 sm:w-3 h-2 sm:h-3 rounded-full bg-yellow-400" />
                      <span className="text-xs text-gray-400 uppercase">Ping</span>
                    </div>
                    <div className="text-3xl sm:text-4xl font-bold text-white">{state.ping.toFixed(0)}</div>
                    <div className="text-xs text-gray-500 mt-1">ms</div>
                  </div>

                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <div className="w-2 sm:w-3 h-2 sm:h-3 rounded-full bg-orange-400" />
                      <span className="text-xs text-gray-400 uppercase">Jitter</span>
                    </div>
                    <div className="text-3xl sm:text-4xl font-bold text-white">{state.jitter.toFixed(0)}</div>
                    <div className="text-xs text-gray-500 mt-1">ms</div>
                  </div>
                </div>
              )}

              <div className="text-center">
                <button
                  onClick={cancelTest}
                  className="text-xs sm:text-sm text-gray-500 hover:text-gray-300 transition-colors uppercase tracking-wider"
                >
                  Cancel Test
                </button>
              </div>
            </div>
          )}
          {/* Results State */}
          {state.phase === 'complete' && (
            <div className="space-y-6 py-4 animate-slide-up">
              {/* Quality Rating Banner */}
              {state.qualityRating && (
                <div 
                  className="rounded-2xl px-4 sm:px-8 py-4 sm:py-5 backdrop-blur-sm border-2 text-center mx-4"
                  style={{ 
                    backgroundColor: `${state.qualityRating.color}20`,
                    borderColor: state.qualityRating.color 
                  }}
                >
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-2">
                    <div 
                      className="text-4xl sm:text-5xl font-black tracking-tight"
                      style={{ color: state.qualityRating.color }}
                    >
                      {state.qualityRating.grade}
                    </div>
                    <div className="text-center sm:text-left">
                      <div className="text-lg sm:text-xl font-bold text-white mb-1">
                        {state.qualityRating.description}
                      </div>
                      <div className="text-xs text-gray-400">
                        Score: {state.qualityRating.score}/100
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-300">
                    Perfect for: {state.qualityRating.suitableFor.slice(0, 3).join(' • ')}
                  </div>
                </div>
              )}

              {/* Main Results */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 lg:gap-20 px-4">
                <div className="text-center">
                  <div className="mb-1 sm:mb-2">
                    <span className="text-sm sm:text-base text-gray-400 uppercase tracking-widest font-bold">Download</span>
                  </div>
                  <div className="text-5xl sm:text-6xl font-black text-white tracking-tight">
                    {state.downloadSpeed.toFixed(2)}
                  </div>
                  <div className="text-lg sm:text-xl text-gray-500 mt-1 sm:mt-2">Mbps</div>
                </div>

                <div className="text-center">
                  <div className="mb-1 sm:mb-2">
                    <span className="text-sm sm:text-base text-gray-400 uppercase tracking-widest font-bold">Upload</span>
                  </div>
                  <div className="text-5xl sm:text-6xl font-black text-white tracking-tight">
                    {state.uploadSpeed.toFixed(2)}
                  </div>
                  <div className="text-lg sm:text-xl text-gray-500 mt-1 sm:mt-2">Mbps</div>
                </div>
              </div>

              {/* Secondary Metrics */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl px-4 sm:px-8 py-4 sm:py-6 mx-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-4">
                  <div className="text-center w-full sm:w-auto">
                    <div className="flex items-center justify-center gap-2 mb-1 sm:mb-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <span className="text-xs text-gray-400 uppercase tracking-wider font-bold">Ping</span>
                    </div>
                    <div className="text-3xl sm:text-4xl font-black text-white">{state.ping.toFixed(0)}</div>
                    <div className="text-xs text-gray-500 mt-1">ms</div>
                  </div>

                  <div className="text-center w-full sm:w-auto">
                    <div className="flex items-center justify-center gap-2 mb-1 sm:mb-2">
                      <div className="w-3 h-3 rounded-full bg-orange-400" />
                      <span className="text-xs text-gray-400 uppercase tracking-wider font-bold">Jitter</span>
                    </div>
                    <div className="text-3xl sm:text-4xl font-black text-white">{state.jitter.toFixed(0)}</div>
                    <div className="text-xs text-gray-500 mt-1">ms</div>
                  </div>

                  <div className="text-center w-full sm:w-auto">
                    <div className="flex items-center justify-center gap-2 mb-1 sm:mb-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-400" />
                      <span className="text-xs text-gray-400 uppercase tracking-wider font-bold">Server</span>
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-white">{state.server?.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{state.server?.location}</div>
                  </div>
                </div>
              </div>

              {/* Connection Capabilities */}
              {capabilities && (
                <div className="mx-4 space-y-6">
                  {/* Bandwidth Recommendation */}
                  <div className="bg-gradient-to-br from-indigo-900/30 to-purple-900/30 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-indigo-500/30 animate-fade-in">
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <span>💡</span> Bandwidth Recommendation
                    </h3>
                    {(() => {
                      const download = state.downloadSpeed
                      let recommendation = ''
                      let icon = ''
                      let usageType = ''
                      
                      if (download < 10) {
                        recommendation = 'Consider upgrading for better performance'
                        usageType = 'Light browsing & email'
                        icon = '📱'
                      } else if (download < 25) {
                        recommendation = 'Good for 1-2 people with moderate usage'
                        usageType = 'HD streaming & video calls'
                        icon = '👨‍💻'
                      } else if (download < 50) {
                        recommendation = 'Great for 2-4 people with heavy usage'
                        usageType = 'Multiple HD streams & gaming'
                        icon = '👨‍👩‍👧'
                      } else if (download < 100) {
                        recommendation = 'Excellent for large households'
                        usageType = '4K streaming & fast downloads'
                        icon = '👨‍👩‍👧‍👦'
                      } else {
                        recommendation = 'Premium speed - perfect for power users'
                        usageType = 'Multiple 4K streams & large file transfers'
                        icon = '🚀'
                      }
                      
                      return (
                        <div className="flex items-start gap-4">
                          <div className="text-4xl">{icon}</div>
                          <div className="flex-1">
                            <div className="text-base sm:text-lg font-bold text-white mb-2">{recommendation}</div>
                            <div className="text-sm text-gray-300">
                              Your <span className="text-cyan-400 font-bold">{download.toFixed(1)} Mbps</span> is ideal for: <span className="text-purple-400">{usageType}</span>
                            </div>
                            {download < 25 && (
                              <div className="mt-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                                <div className="text-sm text-orange-300">
                                  ⚠️ Recommended minimum: <strong>25 Mbps</strong> for smooth 4K streaming and modern usage
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                  
                  <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-slate-700 animate-fade-in">
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-4 text-center">
                      What Your Connection Can Do
                    </h3>
                  
                  {/* Streaming Capacity */}
                  <div className="mb-6 p-3 sm:p-4 bg-slate-700/30 rounded-xl">
                    <h4 className="text-sm sm:text-base font-bold text-cyan-400 mb-3">📺 Streaming Capacity</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="text-center p-2 bg-slate-800/50 rounded-lg">
                        <div className="text-2xl sm:text-3xl font-black text-white">{capabilities.streamCount.hd}</div>
                        <div className="text-xs sm:text-sm text-gray-400 mt-1">HD (720p) Streams</div>
                      </div>
                      <div className="text-center p-3 bg-slate-800/50 rounded-lg">
                        <div className="text-3xl sm:text-4xl font-black text-white">{capabilities.streamCount.fullHd}</div>
                        <div className="text-xs sm:text-sm text-gray-400 mt-1">Full HD (1080p) Streams</div>
                      </div>
                      <div className="text-center p-3 bg-slate-800/50 rounded-lg">
                        <div className="text-3xl sm:text-4xl font-black text-white">{capabilities.streamCount.fourK}</div>
                        <div className="text-xs sm:text-sm text-gray-400 mt-1">4K Ultra HD Streams</div>
                      </div>
                    </div>
                  </div>

                  {/* Supported Activities */}
                  <div>
                    <h4 className="text-base sm:text-lg font-bold text-emerald-400 mb-4">✅ You Can Easily:</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {capabilities.canSupport.slice(0, 9).map((activity, index) => (
                        <div 
                          key={index}
                          className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg"
                        >
                          <span className="text-2xl">{activity.icon}</span>
                          <div>
                            <div className="text-sm font-bold text-white">{activity.activity}</div>
                            <div className="text-xs text-gray-400">{activity.requiredSpeed} Mbps</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Unsupported Activities (if any) */}
                  {capabilities.cannotSupport.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-base sm:text-lg font-bold text-orange-400 mb-4">⚠️ May Struggle With:</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {capabilities.cannotSupport.slice(0, 4).map((activity, index) => (
                          <div 
                            key={index}
                            className="flex items-center gap-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg"
                          >
                            <span className="text-2xl">{activity.icon}</span>
                            <div>
                              <div className="text-sm font-bold text-white">{activity.activity}</div>
                              <div className="text-xs text-gray-400">Needs {activity.requiredSpeed} Mbps</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 px-4">
                <button
                  onClick={resetTest}
                  className="w-full sm:w-auto px-8 sm:px-12 py-4 sm:py-5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-full font-black text-lg sm:text-xl transition-all duration-200 hover:scale-105 shadow-lg shadow-cyan-500/30 uppercase tracking-wider"
                >
                  Test Again
                </button>
                <button
                  onClick={shareResults}
                  className="w-full sm:w-auto px-6 sm:px-8 py-4 sm:py-5 bg-slate-700 hover:bg-slate-600 text-white rounded-full font-bold text-base sm:text-lg transition-all duration-200 hover:scale-105 uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  <span>📋</span>
                  Copy Results
                </button>
                <button
                  onClick={downloadResultsImage}
                  className="w-full sm:w-auto px-6 sm:px-8 py-4 sm:py-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold text-base sm:text-lg transition-all duration-200 hover:scale-105 uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  <span>📸</span>
                  Download Image
                </button>
              </div>
            </div>
          )}

          {/* Error State */}
          {state.phase === 'error' && (
            <div className="text-center py-20">
              <div className="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
                <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-2xl text-gray-300 mb-8">{state.error}</p>
              <button
                onClick={resetTest}
                className="px-10 py-4 bg-cyan-500 hover:bg-cyan-600 text-white rounded-full font-bold text-lg transition-all duration-200"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Analytics & Speed Trends */}
        {history.length >= 2 && (
          <div className="max-w-6xl mx-auto mt-12 sm:mt-16 px-4">
            <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-6">📊 Speed Analytics</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Speed Trend Chart */}
              <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-6 border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-4">Speed Trends</h3>
                <div className="relative h-48">
                  <svg className="w-full h-full" viewBox="0 0 400 150">
                    {/* Grid lines */}
                    {[0, 1, 2, 3, 4].map(i => (
                      <line
                        key={i}
                        x1="40"
                        y1={30 + i * 30}
                        x2="390"
                        y2={30 + i * 30}
                        stroke="#334155"
                        strokeWidth="1"
                        strokeDasharray="2,2"
                      />
                    ))}
                    
                    {/* Speed lines */}
                    {(() => {
                      const recentTests = history.slice(0, 10).reverse()
                      const maxSpeed = Math.max(...recentTests.map(t => Math.max(t.download_mbps, t.upload_mbps)))
                      const scale = 120 / (maxSpeed * 1.2)
                      const xStep = 350 / (recentTests.length - 1)
                      
                      // Download line
                      const downloadPoints = recentTests.map((t, i) => 
                        `${40 + i * xStep},${150 - t.download_mbps * scale}`
                      ).join(' ')
                      
                      // Upload line
                      const uploadPoints = recentTests.map((t, i) => 
                        `${40 + i * xStep},${150 - t.upload_mbps * scale}`
                      ).join(' ')
                      
                      return (
                        <>
                          {/* Download line */}
                          <polyline
                            points={downloadPoints}
                            fill="none"
                            stroke="#06b6d4"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {/* Upload line */}
                          <polyline
                            points={uploadPoints}
                            fill="none"
                            stroke="#8b5cf6"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {/* Data points */}
                          {recentTests.map((t, i) => (
                            <g key={i}>
                              <circle
                                cx={40 + i * xStep}
                                cy={150 - t.download_mbps * scale}
                                r="4"
                                fill="#06b6d4"
                              />
                              <circle
                                cx={40 + i * xStep}
                                cy={150 - t.upload_mbps * scale}
                                r="4"
                                fill="#8b5cf6"
                              />
                            </g>
                          ))}
                        </>
                      )
                    })()}
                    
                    {/* Axis labels */}
                    <text x="5" y="155" fill="#94a3b8" fontSize="10">0</text>
                    <text x="5" y="35" fill="#94a3b8" fontSize="10">
                      {Math.max(...history.slice(0, 10).map(t => Math.max(t.download_mbps, t.upload_mbps))).toFixed(0)}
                    </text>
                  </svg>
                </div>
                <div className="flex items-center justify-center gap-6 mt-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-cyan-400"></div>
                    <span className="text-gray-400">Download</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                    <span className="text-gray-400">Upload</span>
                  </div>
                </div>
              </div>
              
              {/* Statistics Card */}
              <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-6 border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-4">Statistics</h3>
                {(() => {
                  const downloads = history.map(t => t.download_mbps)
                  const uploads = history.map(t => t.upload_mbps)
                  const avgDownload = downloads.reduce((a, b) => a + b, 0) / downloads.length
                  const avgUpload = uploads.reduce((a, b) => a + b, 0) / uploads.length
                  const maxDownload = Math.max(...downloads)
                  const maxUpload = Math.max(...uploads)
                  const minDownload = Math.min(...downloads)
                  const minUpload = Math.min(...uploads)
                  
                  return (
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs text-gray-400 mb-2">Average Speed</div>
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-2xl font-bold text-cyan-400">{avgDownload.toFixed(1)}</span>
                            <span className="text-xs text-gray-500 ml-1">Mbps ↓</span>
                          </div>
                          <div>
                            <span className="text-2xl font-bold text-purple-500">{avgUpload.toFixed(1)}</span>
                            <span className="text-xs text-gray-500 ml-1">Mbps ↑</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="border-t border-slate-700 pt-4">
                        <div className="text-xs text-gray-400 mb-2">Peak Performance</div>
                        <div className="flex justify-between items-center text-sm">
                          <div>
                            <span className="text-emerald-400 font-bold">{maxDownload.toFixed(1)}</span>
                            <span className="text-xs text-gray-500 ml-1">Mbps</span>
                          </div>
                          <div>
                            <span className="text-emerald-400 font-bold">{maxUpload.toFixed(1)}</span>
                            <span className="text-xs text-gray-500 ml-1">Mbps</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="border-t border-slate-700 pt-4">
                        <div className="text-xs text-gray-400 mb-2">Lowest Speed</div>
                        <div className="flex justify-between items-center text-sm">
                          <div>
                            <span className="text-orange-400 font-bold">{minDownload.toFixed(1)}</span>
                            <span className="text-xs text-gray-500 ml-1">Mbps</span>
                          </div>
                          <div>
                            <span className="text-orange-400 font-bold">{minUpload.toFixed(1)}</span>
                            <span className="text-xs text-gray-500 ml-1">Mbps</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="border-t border-slate-700 pt-4">
                        <div className="text-xs text-gray-400 mb-2">Consistency Score</div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const variance = downloads.reduce((sum, val) => sum + Math.pow(val - avgDownload, 2), 0) / downloads.length
                            const consistency = Math.max(0, 100 - (Math.sqrt(variance) / avgDownload * 100))
                            return (
                              <>
                                <div className="flex-1 bg-slate-700 rounded-full h-2">
                                  <div 
                                    className="bg-gradient-to-r from-cyan-400 to-emerald-400 h-2 rounded-full"
                                    style={{ width: `${consistency}%` }}
                                  ></div>
                                </div>
                                <span className="text-white font-bold">{consistency.toFixed(0)}%</span>
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Test History */}
        {history.length > 0 && (
          <div className="max-w-4xl mx-auto mt-12 sm:mt-16 px-4">
            <div className="flex items-center justify-center gap-4 mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-white text-center">Recent Tests</h2>
              <button
                onClick={clearHistory}
                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 border border-red-500/50 rounded-lg text-xs sm:text-sm font-bold transition-all duration-200 hover:scale-105 uppercase tracking-wider"
                title="Clear all test history"
              >
                🗑️ Clear
              </button>
            </div>
            
            {/* Desktop Table View */}
            <div className="hidden sm:block bg-slate-800/30 backdrop-blur-sm rounded-2xl overflow-hidden border border-slate-700">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="px-4 lg:px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                      <th className="px-4 lg:px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">Download</th>
                      <th className="px-4 lg:px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">Upload</th>
                      <th className="px-4 lg:px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">Ping</th>
                      <th className="px-4 lg:px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">Jitter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((test) => (
                      <tr key={test.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 lg:px-6 py-4 text-xs sm:text-sm text-gray-300">
                          {new Date(test.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 lg:px-6 py-4 text-center">
                          <div className="text-base lg:text-lg font-bold text-cyan-400">{test.download_mbps.toFixed(1)}</div>
                          <div className="text-xs text-gray-500">Mbps</div>
                        </td>
                        <td className="px-4 lg:px-6 py-4 text-center">
                          <div className="text-base lg:text-lg font-bold text-purple-400">{test.upload_mbps.toFixed(1)}</div>
                          <div className="text-xs text-gray-500">Mbps</div>
                        </td>
                        <td className="px-4 lg:px-6 py-4 text-center">
                          <div className="text-base lg:text-lg font-bold text-yellow-400">{test.ping.toFixed(0)}</div>
                          <div className="text-xs text-gray-500">ms</div>
                        </td>
                        <td className="px-4 lg:px-6 py-4 text-center">
                          <div className="text-base lg:text-lg font-bold text-orange-400">{test.jitter.toFixed(0)}</div>
                          <div className="text-xs text-gray-500">ms</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden space-y-4">
              {history.map((test) => (
                <div key={test.id} className="bg-slate-800/30 backdrop-blur-sm rounded-xl p-4 border border-slate-700">
                  <div className="text-xs text-gray-400 mb-3">
                    {new Date(test.timestamp).toLocaleString()}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="text-xs text-gray-400 uppercase mb-1">Download</div>
                      <div className="text-2xl font-bold text-cyan-400">{test.download_mbps.toFixed(1)}</div>
                      <div className="text-xs text-gray-500">Mbps</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-400 uppercase mb-1">Upload</div>
                      <div className="text-2xl font-bold text-purple-400">{test.upload_mbps.toFixed(1)}</div>
                      <div className="text-xs text-gray-500">Mbps</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-400 uppercase mb-1">Ping</div>
                      <div className="text-lg font-bold text-yellow-400">{test.ping.toFixed(0)}</div>
                      <div className="text-xs text-gray-500">ms</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-400 uppercase mb-1">Jitter</div>
                      <div className="text-lg font-bold text-orange-400">{test.jitter.toFixed(0)}</div>
                      <div className="text-xs text-gray-500">ms</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-24 text-center text-gray-500 text-sm">
          <p>
            Independent implementation based on public web speed testing methodologies.
          </p>
        </footer>
      </div>

      {/* Keyboard Shortcuts Modal */}
      {showKeyboardHelp && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowKeyboardHelp(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="keyboard-shortcuts-title"
        >
          <div 
            className="bg-slate-800 rounded-2xl p-6 sm:p-8 max-w-md w-full border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 id="keyboard-shortcuts-title" className="text-2xl font-bold text-white flex items-center gap-2">
                <span>⌨️</span>
                <span>Keyboard Shortcuts</span>
              </h2>
              <button
                onClick={() => setShowKeyboardHelp(false)}
                className="text-gray-400 hover:text-white transition-colors"
                aria-label="Close keyboard shortcuts"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Start test</span>
                <div className="flex gap-2">
                  <kbd className="px-3 py-1.5 bg-slate-700 rounded text-cyan-400 font-mono text-sm border border-slate-600">Space</kbd>
                  <span className="text-gray-500">or</span>
                  <kbd className="px-3 py-1.5 bg-slate-700 rounded text-cyan-400 font-mono text-sm border border-slate-600">Enter</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-300">Cancel test</span>
                <kbd className="px-3 py-1.5 bg-slate-700 rounded text-cyan-400 font-mono text-sm border border-slate-600">Esc</kbd>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-300">Show shortcuts</span>
                <kbd className="px-3 py-1.5 bg-slate-700 rounded text-cyan-400 font-mono text-sm border border-slate-600">?</kbd>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-300">Close modal</span>
                <kbd className="px-3 py-1.5 bg-slate-700 rounded text-cyan-400 font-mono text-sm border border-slate-600">Esc</kbd>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-700">
              <p className="text-xs text-gray-400 text-center">
                Press <kbd className="px-2 py-0.5 bg-slate-700 rounded text-cyan-400 font-mono">?</kbd> anytime to see these shortcuts
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
