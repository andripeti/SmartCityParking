import clsx from 'clsx'
import {
    CreditCard,
    Layers,
    Locate,
    MapPin,
    ParkingSquare,
    Radio,
    Search,
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
  
  const { user } = useAuthStore()
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
