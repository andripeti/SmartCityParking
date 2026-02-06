import clsx from 'clsx'
import { Accessibility, BarChart3, Beaker, MapPin } from 'lucide-react'
import { useState } from 'react'
import { analysisApi } from '../lib/api'

type AnalysisTab = 'heatmap' | 'hotspots' | 'accessibility' | 'scenario'

export default function Analysis() {
  const [activeTab, setActiveTab] = useState<AnalysisTab>('heatmap')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<unknown>(null)
  
  // Accessibility form state
  const [destLat, setDestLat] = useState('52.370')
  const [destLng, setDestLng] = useState('4.895')
  const [radius, setRadius] = useState('500')

  const tabs = [
    { id: 'heatmap', name: 'Occupancy Heatmap', icon: BarChart3 },
    { id: 'hotspots', name: 'Violation Hotspots', icon: MapPin },
    { id: 'accessibility', name: 'Accessibility', icon: Accessibility },
    { id: 'scenario', name: 'Scenario Testing', icon: Beaker },
  ]

  const runHeatmapAnalysis = async () => {
    setLoading(true)
    try {
      const response = await analysisApi.getOccupancyHeatmap()
      setResults(response.data)
    } catch (err) {
      console.error('Analysis failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const runHotspotsAnalysis = async () => {
    setLoading(true)
    try {
      const response = await analysisApi.getViolationHotspots()
      setResults(response.data)
    } catch (err) {
      console.error('Analysis failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const runAccessibilityAnalysis = async () => {
    setLoading(true)
    try {
      const response = await analysisApi.getAccessibility(
        parseFloat(destLat),
        parseFloat(destLng),
        parseFloat(radius)
      )
      setResults(response.data)
    } catch (err) {
      console.error('Analysis failed:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Analysis Tools</h1>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as AnalysisTab); setResults(null) }}
              className={clsx(
                'group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm',
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              <tab.icon className={clsx(
                'mr-2 h-5 w-5',
                activeTab === tab.id ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'
              )} />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        {activeTab === 'heatmap' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Occupancy Heatmap</h2>
              <p className="text-sm text-gray-500 mt-1">
                Visualize current parking occupancy across all zones
              </p>
            </div>
            <button
              onClick={runHeatmapAnalysis}
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Generate Heatmap'}
            </button>
            {results && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-2">Results</h3>
                <pre className="text-xs overflow-auto max-h-64">
                  {JSON.stringify(results, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {activeTab === 'hotspots' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Violation Hotspots</h2>
              <p className="text-sm text-gray-500 mt-1">
                Identify areas with high violation density
              </p>
            </div>
            <button
              onClick={runHotspotsAnalysis}
              disabled={loading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Find Hotspots'}
            </button>
            {results && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-2">Results</h3>
                <pre className="text-xs overflow-auto max-h-64">
                  {JSON.stringify(results, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {activeTab === 'accessibility' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Accessibility Analysis</h2>
              <p className="text-sm text-gray-500 mt-1">
                Analyze parking accessibility from a destination point
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 max-w-lg">
              <div>
                <label className="block text-sm font-medium text-gray-700">Latitude</label>
                <input
                  type="number"
                  step="0.001"
                  value={destLat}
                  onChange={(e) => setDestLat(e.target.value)}
                  className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Longitude</label>
                <input
                  type="number"
                  step="0.001"
                  value={destLng}
                  onChange={(e) => setDestLng(e.target.value)}
                  className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Radius (m)</label>
                <input
                  type="number"
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                  className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                />
              </div>
            </div>
            <button
              onClick={runAccessibilityAnalysis}
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Analyze Accessibility'}
            </button>
            {results && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-2">Results</h3>
                <pre className="text-xs overflow-auto max-h-64">
                  {JSON.stringify(results, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {activeTab === 'scenario' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Scenario Testing</h2>
              <p className="text-sm text-gray-500 mt-1">
                Test what-if scenarios for adding or removing parking bays
              </p>
            </div>
            <p className="text-gray-500">
              Scenario testing allows you to simulate changes to parking capacity and see projected impacts on occupancy.
            </p>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700">
                This feature requires selecting a zone and bay modifications. Use the Map view for visual scenario building.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
