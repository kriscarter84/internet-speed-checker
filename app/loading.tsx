export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block">
          <div className="w-16 h-16 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4"></div>
        </div>
        <p className="text-white text-lg font-semibold">Loading Speed Test...</p>
      </div>
    </div>
  )
}
