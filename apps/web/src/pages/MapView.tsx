import clsx from 'clsx'
import {
    Check,
    CreditCard,
    Layers,
    Loader2,
    Locate,
    MapPin,
    ParkingSquare,
    PenTool,
    Radio,
    Search,
    Trash2,
    Undo2,
    X
} from 'lucide-react'
import maplibregl from 'maplibre-gl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { baysApi, sensorsApi, terminalsApi, zonesApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useMapStore } from '../store/mapStore'

// OpenStreetMap raster tile style with attribution
const OSM_STYLE = {
  version: 8 as const,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
    }
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster' as const,
      source: 'osm',
      minzoom: 0,
      maxzoom: 19
    }
  ]
}

const STATUS_COLORS = {
  available: '#22c55e',
  occupied: '#ef4444',
  reserved: '#f59e0b',
  closed: '#6b7280',
}

function getGeometryPoint(geom: any): [number, number] | null {
  if (!geom) return null
  if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
    const [lng, lat] = geom.coordinates
    if (typeof lng === 'number' && typeof lat === 'number') return [lng, lat]
  }
  if (geom.type === 'Polygon' && Array.isArray(geom.coordinates?.[0])) {
    const ring = geom.coordinates[0]
    let sumLng = 0
    let sumLat = 0
    for (const coord of ring) {
      if (Array.isArray(coord) && coord.length >= 2) {
        sumLng += coord[0]
        sumLat += coord[1]
      }
    }
    if (ring.length > 0) return [sumLng / ring.length, sumLat / ring.length]
  }
  if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates?.[0])) {
    return getGeometryPoint({ type: 'Polygon', coordinates: geom.coordinates[0] })
  }
  return null
}

function normalizeBayGeoJSON(data: any) {
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) return data
  const features = data.features
    .map((feature: any) => {
      const point = getGeometryPoint(feature?.geometry)
      if (!point) return null
      return {
        ...feature,
        geometry: { type: 'Point', coordinates: point }
      }
    })
    .filter(Boolean)
  return { ...data, features }
}

interface BayFeature {
  bay_id: number
  bay_number: string
  zone_name: string
  status: string
  is_disabled_only: boolean
  is_electric: boolean
  distance_meters?: number
}

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [showLayers, setShowLayers] = useState(false)
  const [searchCoords, setSearchCoords] = useState('')
  const [selectedBay, setSelectedBay] = useState<BayFeature | null>(null)
  
  // Drawing zone state
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([])
  const drawMarkersRef = useRef<maplibregl.Marker[]>([])
  const [showZoneForm, setShowZoneForm] = useState(false)
  const [zoneFormData, setZoneFormData] = useState({ name: '', zone_type: 'on_street', max_duration_minutes: '' })
  const [zoneSaving, setZoneSaving] = useState(false)
  const [zoneError, setZoneError] = useState('')
  
  const { user } = useAuthStore()
  const canManageZones = user?.role === 'admin' || user?.role === 'operator'
  const { 
    center, 
    zoom, 
    showZones, 
    showBays, 
    showSensors, 
    showTerminals,
    setCenter,
    setZoom,
    toggleLayer 
  } = useMapStore()

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: OSM_STYLE,
      center: center,
      zoom: zoom,
    })

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.current.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right'
    )
    
    // Add attribution control (required for OSM)
    map.current.addControl(
      new maplibregl.AttributionControl({
        compact: false,
        customAttribution: 'Parking data © OpenStreetMap contributors'
      }),
      'bottom-right'
    )

    map.current.on('load', () => {
      setMapLoaded(true)
    })

    map.current.on('moveend', () => {
      if (map.current) {
        const c = map.current.getCenter()
        setCenter([c.lng, c.lat])
        setZoom(map.current.getZoom())
      }
    })

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  // Load layers
  const loadLayers = useCallback(async () => {
    if (!map.current || !mapLoaded) return

    try {
      // Load zones
      if (showZones) {
        const zonesData = await zonesApi.getGeoJSON()
        if (map.current.getSource('zones')) {
          (map.current.getSource('zones') as maplibregl.GeoJSONSource).setData(zonesData.data)
        } else {
          map.current.addSource('zones', {
            type: 'geojson',
            data: zonesData.data,
          })
          map.current.addLayer({
            id: 'zones-fill',
            type: 'fill',
            source: 'zones',
            paint: {
              'fill-color': '#3b82f6',
              'fill-opacity': 0.15,
            },
          })
          map.current.addLayer({
            id: 'zones-outline',
            type: 'line',
            source: 'zones',
            paint: {
              'line-color': '#2563eb',
              'line-width': 2,
            },
          })
          map.current.addLayer({
            id: 'zones-label',
            type: 'symbol',
            source: 'zones',
            layout: {
              'text-field': ['get', 'name'],
              'text-size': 12,
              'text-anchor': 'center',
            },
            paint: {
              'text-color': '#1e40af',
              'text-halo-color': '#fff',
              'text-halo-width': 1,
            },
          })
        }
      } else {
        if (map.current.getLayer('zones-fill')) map.current.removeLayer('zones-fill')
        if (map.current.getLayer('zones-outline')) map.current.removeLayer('zones-outline')
        if (map.current.getLayer('zones-label')) map.current.removeLayer('zones-label')
        if (map.current.getSource('zones')) map.current.removeSource('zones')
      }

      // Load bays
      if (showBays) {
        const baysData = await baysApi.getGeoJSON()
        const normalizedBays = normalizeBayGeoJSON(baysData.data)
        if (map.current.getSource('bays')) {
          (map.current.getSource('bays') as maplibregl.GeoJSONSource).setData(normalizedBays)
        } else {
          map.current.addSource('bays', {
            type: 'geojson',
            data: normalizedBays,
          })
          map.current.addLayer({
            id: 'bays-circle',
            type: 'circle',
            source: 'bays',
            paint: {
              'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                12, 3,
                16, 8,
                20, 12
              ],
              'circle-color': [
                'match', ['get', 'status'],
                'available', STATUS_COLORS.available,
                'occupied', STATUS_COLORS.occupied,
                'reserved', STATUS_COLORS.reserved,
                'closed', STATUS_COLORS.closed,
                '#6b7280'
              ],
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 1,
            },
          })

          // Click handler for bays
          map.current.on('click', 'bays-circle', (e) => {
            if (e.features && e.features[0]) {
              const props = e.features[0].properties as BayFeature
              setSelectedBay(props)
            }
          })

          map.current.on('mouseenter', 'bays-circle', () => {
            if (map.current) map.current.getCanvas().style.cursor = 'pointer'
          })

          map.current.on('mouseleave', 'bays-circle', () => {
            if (map.current) map.current.getCanvas().style.cursor = ''
          })
        }
      } else {
        if (map.current.getLayer('bays-circle')) map.current.removeLayer('bays-circle')
        if (map.current.getSource('bays')) map.current.removeSource('bays')
      }

      // Load sensors
      if (showSensors) {
        const sensorsData = await sensorsApi.getGeoJSON()
        if (map.current.getSource('sensors')) {
          (map.current.getSource('sensors') as maplibregl.GeoJSONSource).setData(sensorsData.data)
        } else {
          map.current.addSource('sensors', {
            type: 'geojson',
            data: sensorsData.data,
          })
          map.current.addLayer({
            id: 'sensors-circle',
            type: 'circle',
            source: 'sensors',
            paint: {
              'circle-radius': 5,
              'circle-color': [
                'case',
                ['get', 'is_active'],
                '#10b981',
                '#6b7280'
              ],
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 1,
            },
          })
        }
      } else {
        if (map.current.getLayer('sensors-circle')) map.current.removeLayer('sensors-circle')
        if (map.current.getSource('sensors')) map.current.removeSource('sensors')
      }

      // Load terminals
      if (showTerminals) {
        const terminalsData = await terminalsApi.getGeoJSON()
        if (map.current.getSource('terminals')) {
          (map.current.getSource('terminals') as maplibregl.GeoJSONSource).setData(terminalsData.data)
        } else {
          map.current.addSource('terminals', {
            type: 'geojson',
            data: terminalsData.data,
          })
          map.current.addLayer({
            id: 'terminals-circle',
            type: 'circle',
            source: 'terminals',
            paint: {
              'circle-radius': 6,
              'circle-color': '#8b5cf6',
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 2,
            },
          })
        }
      } else {
        if (map.current.getLayer('terminals-circle')) map.current.removeLayer('terminals-circle')
        if (map.current.getSource('terminals')) map.current.removeSource('terminals')
      }
    } catch (err) {
      console.error('Failed to load map layers:', err)
    }
  }, [mapLoaded, showZones, showBays, showSensors, showTerminals])

  useEffect(() => {
    loadLayers()
  }, [loadLayers])

  // Search nearby bays
  const handleSearch = async () => {
    if (!searchCoords || !map.current) return
    
    const [lat, lng] = searchCoords.split(',').map(s => parseFloat(s.trim()))
    if (isNaN(lat) || isNaN(lng)) return
    
    map.current.flyTo({ center: [lng, lat], zoom: 17 })
    
    // Add search marker
    new maplibregl.Marker({ color: '#ef4444' })
      .setLngLat([lng, lat])
      .addTo(map.current)
    
    // Search for nearby bays
    try {
      const response = await baysApi.getNear(lat, lng, 300, 'available')
      console.log('Nearby bays:', response.data)
    } catch (err) {
      console.error('Search failed:', err)
    }
  }

  // Use current location
  const useCurrentLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setSearchCoords(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`)
        if (map.current) {
          map.current.flyTo({ center: [longitude, latitude], zoom: 16 })
        }
      },
      (error) => {
        console.error('Geolocation error:', error)
        alert('Could not get your location')
      }
    )
  }

  // ── Drawing zone helpers ──────────────────────────────
  const updateDrawLayer = useCallback((pts: [number, number][]) => {
    if (!map.current) return
    const src = map.current.getSource('draw-polygon') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    if (pts.length < 2) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    const closed = [...pts, pts[0]]
    src.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [closed] },
        properties: {}
      }]
    })
  }, [])

  const clearDrawing = useCallback(() => {
    drawMarkersRef.current.forEach(m => m.remove())
    drawMarkersRef.current = []
    setDrawPoints([])
    updateDrawLayer([])
  }, [updateDrawLayer])

  const startDrawing = useCallback(() => {
    setIsDrawing(true)
    setShowZoneForm(false)
    setZoneError('')
    clearDrawing()
    if (map.current) map.current.getCanvas().style.cursor = 'crosshair'
  }, [clearDrawing])

  const cancelDrawing = useCallback(() => {
    setIsDrawing(false)
    setShowZoneForm(false)
    setZoneError('')
    clearDrawing()
    if (map.current) map.current.getCanvas().style.cursor = ''
  }, [clearDrawing])

  const undoLastPoint = useCallback(() => {
    setDrawPoints(prev => {
      const next = prev.slice(0, -1)
      // remove last marker
      const last = drawMarkersRef.current.pop()
      last?.remove()
      updateDrawLayer(next)
      return next
    })
  }, [updateDrawLayer])

  const finishDrawing = useCallback(() => {
    if (drawPoints.length < 3) return
    setIsDrawing(false)
    setShowZoneForm(true)
    setZoneFormData({ name: '', zone_type: 'on_street', max_duration_minutes: '' })
    if (map.current) map.current.getCanvas().style.cursor = ''
  }, [drawPoints])

  const saveZone = useCallback(async () => {
    if (!zoneFormData.name) { setZoneError('Name is required'); return }
    if (drawPoints.length < 3) { setZoneError('Draw at least 3 points'); return }
    setZoneSaving(true)
    setZoneError('')
    try {
      const closed = [...drawPoints, drawPoints[0]]
      await zonesApi.create({
        name: zoneFormData.name,
        zone_type: zoneFormData.zone_type,
        max_duration_minutes: zoneFormData.max_duration_minutes ? parseInt(zoneFormData.max_duration_minutes) : null,
        is_active: true,
        geom: { type: 'Polygon', coordinates: [closed] }
      })
      cancelDrawing()
      // Refresh zones layer
      loadLayers()
    } catch (err: any) {
      let msg = 'Failed to create zone'
      if (err.response?.data?.detail) {
        msg = typeof err.response.data.detail === 'string' ? err.response.data.detail : JSON.stringify(err.response.data.detail)
      }
      setZoneError(msg)
    } finally {
      setZoneSaving(false)
    }
  }, [drawPoints, zoneFormData, cancelDrawing, loadLayers])

  // Add draw source/layers once map is loaded
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (map.current.getSource('draw-polygon')) return
    map.current.addSource('draw-polygon', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.current.addLayer({ id: 'draw-fill', type: 'fill', source: 'draw-polygon', paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.25 } })
    map.current.addLayer({ id: 'draw-outline', type: 'line', source: 'draw-polygon', paint: { 'line-color': '#d97706', 'line-width': 2, 'line-dasharray': [3, 2] } })
  }, [mapLoaded])

  // Drawing click handler
  useEffect(() => {
    if (!map.current) return
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (!isDrawing) return
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      setDrawPoints(prev => {
        const next = [...prev, lngLat]
        updateDrawLayer(next)
        // Add marker
        const el = document.createElement('div')
        el.className = 'w-3 h-3 bg-amber-500 border-2 border-white rounded-full shadow'
        const marker = new maplibregl.Marker(el).setLngLat(lngLat).addTo(map.current!)
        drawMarkersRef.current.push(marker)
        return next
      })
    }
    map.current.on('click', handleClick)
    return () => { map.current?.off('click', handleClick) }
  }, [isDrawing, updateDrawLayer])

  return (
    <div className="h-[calc(100vh-4rem)] lg:h-screen relative">
      <div ref={mapContainer} className="absolute inset-0" />
      
      {/* Search Bar */}
      {user?.role === 'driver' && (
        <div className="absolute top-4 left-4 right-4 lg:left-auto lg:w-96 z-10">
          <div className="bg-white rounded-lg shadow-lg p-3">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={searchCoords}
                  onChange={(e) => setSearchCoords(e.target.value)}
                  placeholder="Enter coordinates (lat, lng)"
                  className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
              <button
                onClick={useCurrentLocation}
                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                title="Use current location"
              >
                <Locate className="h-5 w-5 text-gray-600" />
              </button>
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 text-sm font-medium"
              >
                Find Parking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Layer Control */}
      <div className="absolute bottom-4 left-4 z-10">
        <button
          onClick={() => setShowLayers(!showLayers)}
          className="bg-white p-3 rounded-lg shadow-lg hover:bg-gray-50"
        >
          <Layers className="h-5 w-5 text-gray-700" />
        </button>
        
        {showLayers && (
          <div className="absolute bottom-14 left-0 bg-white rounded-lg shadow-lg p-4 min-w-[200px]">
            <h3 className="font-medium text-gray-900 mb-3">Map Layers</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showZones}
                  onChange={() => toggleLayer('showZones')}
                  className="rounded text-primary-600 focus:ring-primary-500"
                />
                <MapPin className="h-4 w-4 text-blue-600" />
                <span className="text-sm">Zones</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBays}
                  onChange={() => toggleLayer('showBays')}
                  className="rounded text-primary-600 focus:ring-primary-500"
                />
                <ParkingSquare className="h-4 w-4 text-green-600" />
                <span className="text-sm">Bays</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSensors}
                  onChange={() => toggleLayer('showSensors')}
                  className="rounded text-primary-600 focus:ring-primary-500"
                />
                <Radio className="h-4 w-4 text-emerald-600" />
                <span className="text-sm">Sensors</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTerminals}
                  onChange={() => toggleLayer('showTerminals')}
                  className="rounded text-primary-600 focus:ring-primary-500"
                />
                <CreditCard className="h-4 w-4 text-purple-600" />
                <span className="text-sm">Terminals</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Draw Zone Controls */}
      {canManageZones && (
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
          {!isDrawing && !showZoneForm ? (
            <button
              onClick={startDrawing}
              className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2.5 rounded-lg shadow-lg hover:bg-amber-600 font-medium text-sm"
            >
              <PenTool className="h-4 w-4" />
              Draw Zone
            </button>
          ) : isDrawing ? (
            <div className="bg-white rounded-lg shadow-lg p-3 space-y-2 w-56">
              <p className="text-sm font-medium text-gray-800">Click map to add points</p>
              <p className="text-xs text-gray-500">{drawPoints.length} point{drawPoints.length !== 1 ? 's' : ''} placed</p>
              <div className="flex gap-2">
                <button onClick={undoLastPoint} disabled={drawPoints.length === 0} className="flex items-center gap-1 px-2 py-1.5 text-xs border rounded hover:bg-gray-50 disabled:opacity-40">
                  <Undo2 className="h-3 w-3" /> Undo
                </button>
                <button onClick={finishDrawing} disabled={drawPoints.length < 3} className="flex items-center gap-1 px-2 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40">
                  <Check className="h-3 w-3" /> Done ({drawPoints.length}/3+)
                </button>
                <button onClick={cancelDrawing} className="flex items-center gap-1 px-2 py-1.5 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Zone Creation Form */}
      {showZoneForm && (
        <div className="absolute top-4 left-4 z-20 bg-white rounded-lg shadow-xl p-5 w-80">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">New Zone</h3>
            <button onClick={cancelDrawing} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
          </div>
          {zoneError && <div className="mb-3 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">{zoneError}</div>}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zone Name *</label>
              <input
                type="text"
                value={zoneFormData.name}
                onChange={e => setZoneFormData(d => ({ ...d, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="e.g. Stephansplatz Lot A"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zone Type</label>
              <select
                value={zoneFormData.zone_type}
                onChange={e => setZoneFormData(d => ({ ...d, zone_type: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="on_street">On Street</option>
                <option value="off_street">Off Street</option>
                <option value="garage">Garage</option>
                <option value="lot">Lot</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Duration (min)</label>
              <input
                type="number"
                value={zoneFormData.max_duration_minutes}
                onChange={e => setZoneFormData(d => ({ ...d, max_duration_minutes: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Leave empty for unlimited"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={cancelDrawing}
                className="flex-1 px-3 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50"
                disabled={zoneSaving}
              >Cancel</button>
              <button
                onClick={saveZone}
                disabled={zoneSaving}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {zoneSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : 'Create Zone'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 right-4 z-10 bg-white rounded-lg shadow-lg p-3">
        <h4 className="text-xs font-medium text-gray-500 mb-2">Bay Status</h4>
        <div className="space-y-1">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs capitalize">{status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Bay Panel */}
      {selectedBay && (
        <div className="absolute top-4 right-4 z-10 bg-white rounded-lg shadow-lg p-4 w-72">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-900">Bay {selectedBay.bay_number}</h3>
            <button onClick={() => setSelectedBay(null)}>
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className={clsx(
                'px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                selectedBay.status === 'available' && 'bg-green-100 text-green-700',
                selectedBay.status === 'occupied' && 'bg-red-100 text-red-700',
                selectedBay.status === 'reserved' && 'bg-amber-100 text-amber-700',
                selectedBay.status === 'closed' && 'bg-gray-100 text-gray-700',
              )}>
                {selectedBay.status}
              </span>
            </div>
            {selectedBay.zone_name && (
              <div className="flex justify-between">
                <span className="text-gray-500">Zone</span>
                <span>{selectedBay.zone_name}</span>
              </div>
            )}
            {selectedBay.is_disabled_only && (
              <div className="flex items-center gap-1 text-blue-600">
                <span>♿</span>
                <span>Disabled parking only</span>
              </div>
            )}
            {selectedBay.is_electric && (
              <div className="flex items-center gap-1 text-green-600">
                <span>⚡</span>
                <span>Electric vehicle charging</span>
              </div>
            )}
            {selectedBay.distance_meters && (
              <div className="flex justify-between">
                <span className="text-gray-500">Distance</span>
                <span>{Math.round(selectedBay.distance_meters)}m</span>
              </div>
            )}
          </div>
          {user?.role === 'driver' && selectedBay.status === 'available' && (
            <button className="mt-4 w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 text-sm font-medium">
              Start Parking Session
            </button>
          )}
        </div>
      )}
    </div>
  )
}
