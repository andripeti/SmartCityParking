import {
    Car,
    ChevronRight,
    Clock,
    CreditCard,
    Info,
    Loader2,
    LogIn,
    MapPin,
    Navigation2,
    ParkingSquare,
    Search,
    X
} from 'lucide-react'
import maplibregl from 'maplibre-gl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { baysApi, sessionsApi, vehiclesApi, zonesApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { ParkingBay, Vehicle, Zone } from '../types'

// OpenStreetMap raster tile style
const OSM_STYLE = {
  version: 8 as const,
  glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
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

const ZONE_TYPE_COLORS: Record<string, string> = {
  lot: '#3b82f6',
  garage: '#8b5cf6',
  on_street: '#22c55e',
  off_street: '#f59e0b',
}

// Helper to get center coordinates from a polygon geometry
function getPolygonCenter(geom: any): [number, number] | null {
  if (!geom || geom.type !== 'Polygon' || !geom.coordinates?.[0]) return null
  
  const ring = geom.coordinates[0]
  let sumLng = 0, sumLat = 0
  
  for (const coord of ring) {
    if (Array.isArray(coord) && coord.length >= 2) {
      sumLng += coord[0]
      sumLat += coord[1]
    }
  }
  
  const count = ring.length
  if (count > 0) {
    return [sumLng / count, sumLat / count]
  }
  return null
}

// Calculate approximate area of a polygon in square meters
function getPolygonAreaSqM(geom: any): number {
  if (!geom || geom.type !== 'Polygon' || !geom.coordinates?.[0]) return 0
  
  const ring = geom.coordinates[0]
  if (ring.length < 3) return 0
  
  // Simple approximation using shoelace formula with lat/lng to meter conversion
  let area = 0
  const n = ring.length
  
  for (let i = 0; i < n - 1; i++) {
    const [lng1, lat1] = ring[i]
    const [lng2, lat2] = ring[i + 1]
    area += (lng1 * lat2 - lng2 * lat1)
  }
  
  area = Math.abs(area) / 2
  // Convert from degrees² to m² (rough approximation at mid-latitudes)
  // 1 degree ≈ 111km at equator, latitude adjustment
  const avgLat = ring.reduce((sum: number, c: number[]) => sum + c[1], 0) / n
  const latFactor = Math.cos(avgLat * Math.PI / 180)
  const metersPerDegree = 111000
  
  return area * metersPerDegree * metersPerDegree * latFactor
}

// Calculate distance between two points in meters
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Generate bay counts based on zone area
function generateBayCounts(areaSqM: number): { total: number; occupied: number; available: number } {
  // Estimate: ~15 sq meters per parking spot
  let total: number
  if (areaSqM > 100) {
    total = Math.min(Math.max(Math.floor(areaSqM / 15), 3), 50)
  } else {
    // Small zones or calculation failed - use random 3-8
    total = Math.floor(Math.random() * 6) + 3
  }
  
  // Random occupancy between 20% and 80%
  const occupancyRate = 0.2 + Math.random() * 0.6
  const occupied = Math.floor(total * occupancyRate)
  const available = total - occupied
  
  return { total, occupied, available }
}

// Zone with computed bay info
interface ZoneWithBays extends Zone {
  distance_meters: number
  bay_counts: { total: number; occupied: number; available: number }
  center: [number, number]
}

export default function FindParking() {
  const { isAuthenticated, user } = useAuthStore()
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const searchMarkerRef = useRef<maplibregl.Marker | null>(null)
  
  const [searchPoint, setSearchPoint] = useState<{ lat: number; lng: number } | null>(null)
  const [nearbyZones, setNearbyZones] = useState<ZoneWithBays[]>([])
  const [selectedZone, setSelectedZone] = useState<ZoneWithBays | null>(null)
  const [selectedZoneBays, setSelectedZoneBays] = useState<ParkingBay[]>([])
  const [showBayList, setShowBayList] = useState(false)
  const [allZones, setAllZones] = useState<Zone[]>([])
  const [allBays, setAllBays] = useState<ParkingBay[]>([])
  const [loading, setLoading] = useState(false)
  const [searchRadius, setSearchRadius] = useState(500)
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [bookingBay, setBookingBay] = useState<ParkingBay | null>(null)
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null)
  const [bookingLoading, setBookingLoading] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [bookingSuccess, setBookingSuccess] = useState(false)

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: OSM_STYLE,
      center: [16.3738, 48.2082], // Vienna Stephansplatz
      zoom: 14,
    })

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')
    
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true
    })
    map.current.addControl(geolocate, 'top-right')
    
    map.current.addControl(
      new maplibregl.AttributionControl({
        compact: false,
        customAttribution: 'Parking data © OpenStreetMap contributors'
      }),
      'bottom-right'
    )

    map.current.on('load', () => {
      // Add parking zones source - starts empty until search
      map.current!.addSource('parking-zones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      })
      
      // Add parking bays source - starts empty until search
      map.current!.addSource('parking-bays', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      })
      
      // Zone fill layer - HIDDEN until search
      map.current!.addLayer({
        id: 'parking-zones-fill',
        type: 'fill',
        source: 'parking-zones',
        layout: { 'visibility': 'none' },
        paint: {
          'fill-color': [
            'match', ['get', 'zone_type'],
            'lot', ZONE_TYPE_COLORS.lot,
            'garage', ZONE_TYPE_COLORS.garage,
            'on_street', ZONE_TYPE_COLORS.on_street,
            'off_street', ZONE_TYPE_COLORS.off_street,
            '#6b7280'
          ],
          'fill-opacity': 0.4
        }
      })
      
      // Zone outline layer - HIDDEN until search
      map.current!.addLayer({
        id: 'parking-zones-outline',
        type: 'line',
        source: 'parking-zones',
        layout: { 'visibility': 'none' },
        paint: {
          'line-color': [
            'match', ['get', 'zone_type'],
            'lot', '#2563eb',
            'garage', '#7c3aed',
            'on_street', '#16a34a',
            'off_street', '#d97706',
            '#4b5563'
          ],
          'line-width': 2,
          'line-opacity': 0.9
        }
      })
      
      // Zone labels - HIDDEN until search
      map.current!.addLayer({
        id: 'parking-zones-labels',
        type: 'symbol',
        source: 'parking-zones',
        minzoom: 15,
        layout: {
          'visibility': 'none',
          'text-field': ['concat', ['get', 'available'], '/', ['get', 'total'], ' free'],
          'text-size': 11,
          'text-anchor': 'center',
          'text-max-width': 10,
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular']
        },
        paint: {
          'text-color': '#1f2937',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2
        }
      })
      
      // Bay markers (for point geometries) - HIDDEN until search
      map.current!.addLayer({
        id: 'parking-bays-points',
        type: 'circle',
        source: 'parking-bays',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: { 'visibility': 'none' },
        paint: {
          'circle-radius': 5,
          'circle-color': [
            'match', ['get', 'status'],
            'available', '#22c55e',
            'occupied', '#ef4444',
            'reserved', '#f59e0b',
            'closed', '#6b7280',
            '#6b7280'
          ],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff'
        }
      })
      
      // Bay polygons (for polygon geometries) - HIDDEN until search
      map.current!.addLayer({
        id: 'parking-bays-polygons',
        type: 'fill',
        source: 'parking-bays',
        filter: ['==', ['geometry-type'], 'Polygon'],
        layout: { 'visibility': 'none' },
        paint: {
          'fill-color': [
            'match', ['get', 'status'],
            'available', '#22c55e',
            'occupied', '#ef4444',
            'reserved', '#f59e0b',
            'closed', '#6b7280',
            '#6b7280'
          ],
          'fill-opacity': 0.6
        }
      })
      
      // Bay polygon outlines - HIDDEN until search
      map.current!.addLayer({
        id: 'parking-bays-polygons-outline',
        type: 'line',
        source: 'parking-bays',
        filter: ['==', ['geometry-type'], 'Polygon'],
        layout: { 'visibility': 'none' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 1
        }
      })
      
      // Add search radius circle source
      map.current!.addSource('search-radius', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      })
      
      map.current!.addLayer({
        id: 'search-radius-fill',
        type: 'fill',
        source: 'search-radius',
        layout: { 'visibility': 'none' },
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.08
        }
      })
      
      map.current!.addLayer({
        id: 'search-radius-outline',
        type: 'line',
        source: 'search-radius',
        layout: { 'visibility': 'none' },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 2,
          'line-dasharray': [3, 3],
          'line-opacity': 0.6
        }
      })
      
      // Zone hover/click handlers
      map.current!.on('mouseenter', 'parking-zones-fill', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer'
      })
      
      map.current!.on('mouseleave', 'parking-zones-fill', () => {
        if (map.current) map.current.getCanvas().style.cursor = ''
      })
    })

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  // Load all zones and bays once for filtering
  useEffect(() => {
    const loadData = async () => {
      try {
        const [zonesRes, baysRes] = await Promise.all([
          zonesApi.getAll(),
          baysApi.getAll({ limit: 20000 })
        ])
        setAllZones(zonesRes.data)
        setAllBays(baysRes.data)
      } catch (err) {
        console.error('Error loading data:', err)
      }
    }
    loadData()
  }, [])

  // Create circle GeoJSON for search radius visualization
  const createCircleGeoJSON = useCallback((lat: number, lng: number, radiusMeters: number) => {
    const points = 64
    const coords: number[][] = []
    
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * 2 * Math.PI
      const dx = radiusMeters * Math.cos(angle)
      const dy = radiusMeters * Math.sin(angle)
      
      // Convert meters to degrees (approximate)
      const latOffset = dy / 111000
      const lngOffset = dx / (111000 * Math.cos(lat * Math.PI / 180))
      
      coords.push([lng + lngOffset, lat + latOffset])
    }
    
    return {
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [coords]
      },
      properties: {}
    }
  }, [])

  // Clear markers
  const clearMarkers = useCallback(() => {
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove()
      searchMarkerRef.current = null
    }
  }, [])

  // Search for zones at a specific point
  const searchAtPoint = useCallback(async (lat: number, lng: number) => {
    setLoading(true)
    clearMarkers()
    setSelectedZone(null)
    setSearchPoint({ lat, lng })
    
    try {
      // Filter zones within radius
      const zonesInRadius: ZoneWithBays[] = []
      
      for (const zone of allZones) {
        if (!zone.geom) continue
        if (zone.geom.type !== 'Polygon') continue
        
        const center = getPolygonCenter(zone.geom)
        if (!center) continue
        
        const distance = haversineDistance(lat, lng, center[1], center[0])
        
        if (distance <= searchRadius) {
          // Get actual bays for this zone
          const zoneBays = allBays.filter((bay: ParkingBay) => bay.zone_id === zone.zone_id)
          const availableBays = zoneBays.filter((bay: ParkingBay) => bay.status === 'available').length
          const occupiedBays = zoneBays.filter((bay: ParkingBay) => bay.status === 'occupied').length
          const totalBays = zoneBays.length
          
          // Use actual bay counts if available, otherwise generate
          const bay_counts = totalBays > 0 
            ? { total: totalBays, available: availableBays, occupied: occupiedBays }
            : generateBayCounts(getPolygonAreaSqM(zone.geom))
          
          zonesInRadius.push({
            ...zone,
            distance_meters: distance,
            bay_counts,
            center
          })
        }
      }
      
      // Sort by distance
      zonesInRadius.sort((a, b) => a.distance_meters - b.distance_meters)
      
      // Filter by availability if enabled
      const filteredZones = showOnlyAvailable 
        ? zonesInRadius.filter(z => z.bay_counts.available > 0)
        : zonesInRadius
      
      setNearbyZones(filteredZones)
      
      // Update map
      if (map.current) {
        // Make all layers visible now that we have search results
        const layersToShow = [
          'parking-zones-fill', 'parking-zones-outline', 'parking-zones-labels',
          'parking-bays-points', 'parking-bays-polygons', 'parking-bays-polygons-outline',
          'search-radius-fill', 'search-radius-outline'
        ]
        for (const layerId of layersToShow) {
          if (map.current.getLayer(layerId)) {
            map.current.setLayoutProperty(layerId, 'visibility', 'visible')
          }
        }
        
        // Add search marker
        const markerEl = document.createElement('div')
        markerEl.innerHTML = `
          <div class="relative">
            <div class="absolute -inset-4 bg-blue-500/20 rounded-full animate-ping"></div>
            <div class="w-6 h-6 bg-blue-600 rounded-full border-3 border-white shadow-lg flex items-center justify-center">
              <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
              </svg>
            </div>
          </div>
        `
        searchMarkerRef.current = new maplibregl.Marker(markerEl)
          .setLngLat([lng, lat])
          .addTo(map.current)
        
        // Update search radius circle
        const radiusSource = map.current.getSource('search-radius') as maplibregl.GeoJSONSource
        if (radiusSource) {
          radiusSource.setData({
            type: 'FeatureCollection',
            features: [createCircleGeoJSON(lat, lng, searchRadius)]
          })
        }
        
        // Update zones on map
        const zoneSource = map.current.getSource('parking-zones') as maplibregl.GeoJSONSource
        if (zoneSource) {
          const features = filteredZones.map(z => ({
            type: 'Feature' as const,
            geometry: z.geom,
            properties: {
              zone_id: z.zone_id,
              name: z.name,
              zone_type: z.zone_type,
              total: z.bay_counts.total,
              available: z.bay_counts.available,
              occupied: z.bay_counts.occupied
            }
          }))
          zoneSource.setData({ type: 'FeatureCollection', features })
        }
        
        // Update bays on map for zones in radius
        const baySource = map.current.getSource('parking-bays') as maplibregl.GeoJSONSource
        if (baySource) {
          const zoneIds = filteredZones.map(z => z.zone_id)
          const baysInZones = allBays.filter((bay: ParkingBay) => zoneIds.includes(bay.zone_id))
          
          const bayFeatures = baysInZones.map((bay: ParkingBay) => ({
            type: 'Feature' as const,
            geometry: bay.geom,
            properties: {
              bay_id: bay.bay_id,
              bay_number: bay.bay_number,
              zone_id: bay.zone_id,
              status: bay.status,
              is_electric: bay.is_electric,
              is_disabled_only: bay.is_disabled_only
            }
          }))
          baySource.setData({ type: 'FeatureCollection', features: bayFeatures })
        }
        
        // Fit to search area
        map.current.flyTo({ 
          center: [lng, lat], 
          zoom: searchRadius <= 500 ? 16 : searchRadius <= 1000 ? 15 : 14 
        })
      }
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setLoading(false)
    }
  }, [allZones, allBays, searchRadius, showOnlyAvailable, clearMarkers, createCircleGeoJSON])

  // Handle starting session - navigate to zone details and show bays
  const handleSelectZone = useCallback((zone: ZoneWithBays) => {
    const zoneBays = allBays.filter((bay: ParkingBay) => bay.zone_id === zone.zone_id)
    setSelectedZone(zone)
    setShowBayList(false)
    setBookingBay(null)
    setBookingSuccess(false)
    setBookingError(null)
    setSelectedZoneBays(zoneBays)
    if (map.current && zone.center) {
      map.current.flyTo({ center: zone.center, zoom: 17 })
    }
  }, [allBays])

  // Re-search when filters change (but not on initial mount)
  useEffect(() => {
    if (searchPoint) {
      searchAtPoint(searchPoint.lat, searchPoint.lng)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRadius, showOnlyAvailable])

  // Set up map click handler (separate from initialization to avoid stale closures)
  useEffect(() => {
    if (!map.current) return

    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      const zoneFeatures = map.current?.queryRenderedFeatures(e.point, { 
        layers: ['parking-zones-fill'] 
      })
      
      // If clicked on a zone, fly to it and show its details
      if (zoneFeatures && zoneFeatures.length > 0) {
        const props = zoneFeatures[0].properties
        const clickedZoneId = Number(props?.zone_id)
        const zone = nearbyZones.find((z: ZoneWithBays) => z.zone_id === clickedZoneId)
        if (zone) {
          handleSelectZone(zone)
          return
        }
      }
      
      const target = e.originalEvent.target as HTMLElement
      if (target.closest('.maplibregl-ctrl')) return
      
      searchAtPoint(e.lngLat.lat, e.lngLat.lng)
    }

    // @ts-ignore - MapLibre types issue
    map.current.on('click', handleMapClick)

    return () => {
      // @ts-ignore - MapLibre types issue
      map.current?.off('click', handleMapClick)
    }
  }, [nearbyZones, searchAtPoint, handleSelectZone])

  // Search at user's current location
  const searchAtMyLocation = useCallback(() => {
    if ('geolocation' in navigator) {
      setLoading(true)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          searchAtPoint(pos.coords.latitude, pos.coords.longitude)
        },
        (err) => {
          console.error('Geolocation error:', err)
          alert('Could not get your location. Please click on the map to search.')
          setLoading(false)
        },
        { enableHighAccuracy: true }
      )
    } else {
      alert('Geolocation not supported. Please click on the map to search.')
    }
  }, [searchAtPoint])

  // Handle zone selection for navigation
  const handleNavigateToZone = (zone: ZoneWithBays) => {
    if (zone.center) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${zone.center[1]},${zone.center[0]}`,
        '_blank'
      )
    }
  }

  // Load user's vehicles when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      vehiclesApi.getByUser(user.user_id).then((res: { data: Vehicle[] }) => {
        setVehicles(res.data)
        if (res.data.length > 0) {
          const defaultVehicle = res.data.find((v: Vehicle) => v.is_default) || res.data[0]
          setSelectedVehicleId(defaultVehicle.vehicle_id)
        }
      }).catch((err: unknown) => console.error('Error loading vehicles:', err))
    }
  }, [isAuthenticated, user])

  // Book a specific bay
  const handleBookBay = async (bay: ParkingBay) => {
    if (!selectedVehicleId) {
      setBookingError('Please select a vehicle first')
      return
    }
    setBookingLoading(true)
    setBookingError(null)
    try {
      await sessionsApi.start({
        bay_id: bay.bay_id,
        vehicle_id: selectedVehicleId,
        payment_method: 'card'
      })
      setBookingSuccess(true)
      setBookingBay(null)
      // Refresh bay data - mark the booked bay as occupied locally
      setSelectedZoneBays((prev: ParkingBay[]) => prev.map((b: ParkingBay) => 
        b.bay_id === bay.bay_id ? { ...b, status: 'occupied' as const } : b
      ))
      setAllBays((prev: ParkingBay[]) => prev.map((b: ParkingBay) => 
        b.bay_id === bay.bay_id ? { ...b, status: 'occupied' as const } : b
      ))
      // Update zone bay counts
      if (selectedZone) {
        setSelectedZone({
          ...selectedZone,
          bay_counts: {
            ...selectedZone.bay_counts,
            available: selectedZone.bay_counts.available - 1,
            occupied: selectedZone.bay_counts.occupied + 1
          }
        })
      }
    } catch (err: any) {
      setBookingError(err?.response?.data?.detail || 'Failed to start parking session')
    } finally {
      setBookingLoading(false)
    }
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <Car className="h-8 w-8 text-primary-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Find Parking</h1>
            <p className="text-xs text-gray-500">Smart City Parking System</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Link
              to="/"
              className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
            >
              <span className="hidden sm:inline">{user?.full_name}</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
            >
              <LogIn className="h-4 w-4" />
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Search Controls & Results */}
        <div className="w-80 h-full bg-white border-r flex flex-col overflow-hidden">
          {/* Search Controls */}
          <div className="flex-shrink-0 p-4 border-b space-y-4">
            <button
              onClick={searchAtMyLocation}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white rounded-lg px-4 py-3 font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Navigation2 className="h-5 w-5" />
                  Find Parking Near Me
                </>
              )}
            </button>

            <div className="text-xs text-gray-500 text-center">
              Or click anywhere on the map to search that location
            </div>

            {/* Filters */}
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Search Radius</label>
                <select
                  value={searchRadius}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSearchRadius(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                >
                  <option value={200}>200m</option>
                  <option value={500}>500m</option>
                  <option value={1000}>1km</option>
                  <option value={2000}>2km</option>
                </select>
              </div>

              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showOnlyAvailable}
                  onChange={(e) => setShowOnlyAvailable(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                Show only zones with available spots
              </label>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {searchPoint ? (
              <>
                <div className="px-4 py-2 bg-gray-50 border-b sticky top-0 z-10">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      {nearbyZones.length} parking zone{nearbyZones.length !== 1 ? 's' : ''} found
                    </span>
                    <span className="text-xs text-gray-500">
                      {allBays.filter(b => nearbyZones.some(z => z.zone_id === b.zone_id)).length} bays
                    </span>
                  </div>
                </div>
                <div className="divide-y">
                  {nearbyZones.map((zone) => (
                    <div
                      key={zone.zone_id}
                      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedZone?.zone_id === zone.zone_id ? 'bg-primary-50 border-l-4 border-primary-500' : ''
                      }`}
                      onClick={() => handleSelectZone(zone)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: ZONE_TYPE_COLORS[zone.zone_type] || '#6b7280' }}
                          >
                            <ParkingSquare className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{zone.name}</p>
                            <p className="text-xs text-gray-500 capitalize">{zone.zone_type?.replace('_', ' ')}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-gray-900 text-sm">
                            {Math.round(zone.distance_meters)}m
                          </p>
                          {zone.tariff && (
                            <p className="text-xs text-gray-500">
                              €{zone.tariff.hourly_rate}/hr
                            </p>
                          )}
                        </div>
                      </div>
                      
                      {/* Bay availability */}
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${(zone.bay_counts.available / zone.bay_counts.total) * 100}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-green-600 font-medium">{zone.bay_counts.available} free</span>
                          <span className="text-gray-400">|</span>
                          <span className="text-red-500">{zone.bay_counts.occupied} occupied</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {nearbyZones.length === 0 && (
                  <div className="p-8 text-center">
                    <MapPin className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">No parking zones found</p>
                    <p className="text-sm text-gray-400 mt-1">Try expanding your search radius</p>
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 text-center">
                <Search className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">Search for parking</p>
                <p className="text-sm text-gray-400 mt-1">
                  Click "Find Parking Near Me" or tap the map
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative overflow-hidden">
          <div ref={mapContainer} className="w-full h-full" />

          {/* Legend */}
          <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 z-10">
            <p className="text-xs font-medium text-gray-700 mb-2">Zone Types</p>
            <div className="space-y-1 mb-3">
              {Object.entries(ZONE_TYPE_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
                  <span className="text-xs text-gray-600 capitalize">{type.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
            {searchPoint && (
              <>
                <div className="border-t pt-2 mt-2">
                  <p className="text-xs font-medium text-gray-700 mb-2">Bay Status</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="text-xs text-gray-600">Available</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-xs text-gray-600">Occupied</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
                      <span className="text-xs text-gray-600">Reserved</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gray-500" />
                      <span className="text-xs text-gray-600">Closed</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Selected Zone Modal */}
      {selectedZone && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center sm:items-center">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl animate-slide-up max-h-[90vh] flex flex-col">
            <div className="p-6 overflow-y-auto flex-1">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div 
                    className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: ZONE_TYPE_COLORS[selectedZone.zone_type] || '#6b7280' }}
                  >
                    <ParkingSquare className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{selectedZone.name}</h3>
                    <p className="text-gray-500 capitalize">{selectedZone.zone_type?.replace('_', ' ')}</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setSelectedZone(null); setShowBayList(false); setBookingBay(null); setBookingSuccess(false); }}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="flex items-center gap-2 text-gray-600">
                  <MapPin className="h-4 w-4" />
                  <span>{Math.round(selectedZone.distance_meters)}m away</span>
                </div>
                {selectedZone.tariff && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <CreditCard className="h-4 w-4" />
                    <span>€{selectedZone.tariff.hourly_rate}/hr</span>
                  </div>
                )}
                {selectedZone.max_duration_minutes && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="h-4 w-4" />
                    <span>Max {selectedZone.max_duration_minutes} min</span>
                  </div>
                )}
              </div>

              {/* Availability Bar */}
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Availability</span>
                  <span className="text-sm text-gray-500">{selectedZone.bay_counts.total} total spots</span>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden mb-2">
                  <div 
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${(selectedZone.bay_counts.available / Math.max(selectedZone.bay_counts.total, 1)) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-gray-600">{selectedZone.bay_counts.available} Available</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-gray-600">{selectedZone.bay_counts.occupied} Occupied</span>
                  </div>
                </div>
              </div>

              {/* Booking Success */}
              {bookingSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Car className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-green-800">Parking session started!</p>
                    <p className="text-sm text-green-600 mt-1">Your session is active. Go to your dashboard to manage it.</p>
                    <Link to="/" className="text-sm text-green-700 underline mt-2 inline-block font-medium">Go to Dashboard</Link>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {!showBayList ? (
                <div className="space-y-3">
                  {selectedZone.bay_counts.available > 0 && selectedZoneBays.length > 0 && (
                    <button
                      onClick={() => setShowBayList(true)}
                      className="w-full py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <ParkingSquare className="h-5 w-5" />
                      View & Book Parking Bays
                    </button>
                  )}
                  <button
                    onClick={() => handleNavigateToZone(selectedZone)}
                    className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                  >
                    <Navigation2 className="h-5 w-5" />
                    Get Directions
                  </button>
                  {selectedZone.bay_counts.available === 0 && (
                    <div className="bg-red-50 rounded-xl p-4 flex items-start gap-3">
                      <Info className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-red-700">This zone is fully occupied</p>
                        <p className="text-sm text-red-600 mt-1">Please select another nearby parking zone.</p>
                      </div>
                    </div>
                  )}
                  {selectedZoneBays.length === 0 && selectedZone.bay_counts.total > 0 && (
                    <p className="text-xs text-center text-gray-400">Bay data not available for this zone</p>
                  )}
                </div>
              ) : (
                /* Bay List View */
                <div>
                  <button
                    onClick={() => { setShowBayList(false); setBookingBay(null); }}
                    className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 mb-3"
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" />
                    Back to zone overview
                  </button>
                  
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">
                    Parking Bays ({selectedZoneBays.length})
                  </h4>

                  {/* Booking Bay Form */}
                  {bookingBay && (
                    <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 mb-4">
                      <p className="text-sm font-medium text-primary-800 mb-2">
                        Book Bay #{bookingBay.bay_number}
                      </p>
                      {!isAuthenticated ? (
                        <div>
                          <p className="text-sm text-gray-600 mb-2">Sign in to book this bay</p>
                          <Link
                            to="/login"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
                          >
                            <LogIn className="h-4 w-4" />
                            Sign In
                          </Link>
                        </div>
                      ) : vehicles.length === 0 ? (
                        <div>
                          <p className="text-sm text-gray-600 mb-2">You need to add a vehicle first</p>
                          <Link
                            to="/"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
                          >
                            Go to Dashboard
                          </Link>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-medium text-gray-600">Select Vehicle</label>
                            <select
                              value={selectedVehicleId || ''}
                              onChange={(e) => setSelectedVehicleId(Number(e.target.value))}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                            >
                              {vehicles.map(v => (
                                <option key={v.vehicle_id} value={v.vehicle_id}>
                                  {v.license_plate} ({v.type})
                                </option>
                              ))}
                            </select>
                          </div>
                          {selectedZone.tariff && (
                            <p className="text-xs text-gray-500">
                              Rate: €{selectedZone.tariff.hourly_rate}/hr
                              {selectedZone.tariff.free_minutes ? ` • First ${selectedZone.tariff.free_minutes} min free` : ''}
                            </p>
                          )}
                          {bookingError && (
                            <p className="text-xs text-red-600">{bookingError}</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleBookBay(bookingBay)}
                              disabled={bookingLoading}
                              className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {bookingLoading ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Starting...
                                </>
                              ) : (
                                'Start Parking'
                              )}
                            </button>
                            <button
                              onClick={() => { setBookingBay(null); setBookingError(null); }}
                              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bay list */}
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {selectedZoneBays.map(bay => {
                      const statusColors: Record<string, string> = {
                        available: 'bg-green-100 text-green-800',
                        occupied: 'bg-red-100 text-red-800',
                        reserved: 'bg-amber-100 text-amber-800',
                        closed: 'bg-gray-100 text-gray-800',
                      }
                      const dotColors: Record<string, string> = {
                        available: 'bg-green-500',
                        occupied: 'bg-red-500',
                        reserved: 'bg-amber-500',
                        closed: 'bg-gray-500',
                      }
                      return (
                        <div
                          key={bay.bay_id}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            bookingBay?.bay_id === bay.bay_id ? 'border-primary-300 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${dotColors[bay.status] || 'bg-gray-400'}`} />
                            <div>
                              <p className="text-sm font-medium text-gray-900">Bay #{bay.bay_number}</p>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusColors[bay.status] || 'bg-gray-100 text-gray-600'}`}>
                                  {bay.status}
                                </span>
                                {bay.is_electric && <span className="text-yellow-600">⚡ EV</span>}
                                {bay.is_disabled_only && <span className="text-blue-600">♿</span>}
                              </div>
                            </div>
                          </div>
                          {bay.status === 'available' && !bookingSuccess && (
                            <button
                              onClick={() => { setBookingBay(bay); setBookingError(null); }}
                              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors"
                            >
                              Book
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
