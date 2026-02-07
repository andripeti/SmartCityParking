import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { baysApi, zonesApi } from '../lib/api'
import { ParkingBay, ParkingZone } from '../types'

interface BayFormProps {
  bay?: ParkingBay
  onClose: () => void
  onSuccess: () => void
}

export default function BayForm({ bay, onClose, onSuccess }: BayFormProps) {
  const [zones, setZones] = useState<ParkingZone[]>([])
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    bay_number: bay?.bay_number || '',
    zone_id: bay?.zone_id || '',
    is_disabled_only: bay?.is_disabled_only || false,
    is_electric: bay?.is_electric || false,
    status: bay?.status || 'available',
    geom: bay?.geom || null,
  })
  const [error, setError] = useState<string | null>(null)

  const getZoneById = (zoneId: number) => zones.find((z) => z.zone_id === zoneId)

  const getPolygonCenter = (geom: any): [number, number] | null => {
    if (!geom || geom.type !== 'Polygon' || !geom.coordinates?.[0]) return null
    const ring = geom.coordinates[0]
    if (!Array.isArray(ring) || ring.length === 0) return null
    let sumLng = 0
    let sumLat = 0
    for (const coord of ring) {
      if (Array.isArray(coord) && coord.length >= 2) {
        sumLng += coord[0]
        sumLat += coord[1]
      }
    }
    return [sumLng / ring.length, sumLat / ring.length]
  }

  const createSquarePolygon = (center: [number, number], sizeMeters = 6) => {
    const [lng, lat] = center
    const half = sizeMeters / 2
    const dLat = half / 111000
    const dLng = half / (111000 * Math.cos((lat * Math.PI) / 180))
    const ring = [
      [lng - dLng, lat - dLat],
      [lng + dLng, lat - dLat],
      [lng + dLng, lat + dLat],
      [lng - dLng, lat + dLat],
      [lng - dLng, lat - dLat]
    ]
    return { type: 'Polygon', coordinates: [ring] }
  }

  useEffect(() => {
    loadZones()
  }, [])

  useEffect(() => {
    if (bay) return
    const zoneId = Number(formData.zone_id)
    if (!zoneId) return
    const zone = getZoneById(zoneId)
    if (!zone?.geom) return
    const center = getPolygonCenter(zone.geom)
    if (!center) return
    setFormData((prev) => ({
      ...prev,
      geom: createSquarePolygon(center)
    }))
  }, [bay, formData.zone_id, zones])

  const loadZones = async () => {
    try {
      const response = await zonesApi.getAll()
      setZones(response.data)
    } catch (err) {
      console.error('Failed to load zones:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (bay) {
        // Update existing bay
        await baysApi.update(bay.bay_id, formData)
      } else {
        // Create new bay
        let geom = formData.geom
        if (!geom) {
          const zoneId = Number(formData.zone_id)
          const zone = zoneId ? getZoneById(zoneId) : undefined
          const center = zone?.geom ? getPolygonCenter(zone.geom) : null
          if (center) {
            geom = createSquarePolygon(center)
          } else {
            setError('Geometry is required. Please select a zone and the system will auto-generate the geometry.')
            setLoading(false)
            return
          }
        }
        await baysApi.create({ ...formData, geom })
      }
      onSuccess()
    } catch (err: any) {
      console.error('Failed to save bay:', err)
      setError(err?.response?.data?.detail || 'Failed to save parking bay')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {bay ? 'Edit Parking Bay' : 'Add New Parking Bay'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bay Number *
            </label>
            <input
              type="text"
              name="bay_number"
              value={formData.bay_number}
              onChange={handleChange}
              required
              placeholder="e.g., BAY-001"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Zone *
            </label>
            <select
              name="zone_id"
              value={formData.zone_id}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Select a zone</option>
              {zones.map(zone => (
                <option key={zone.zone_id} value={zone.zone_id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
              <option value="reserved">Reserved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                name="is_disabled_only"
                checked={formData.is_disabled_only}
                onChange={handleChange}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">
                Disabled parking only ♿
              </span>
            </label>

            <label className="flex items-center">
              <input
                type="checkbox"
                name="is_electric"
                checked={formData.is_electric}
                onChange={handleChange}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">
                EV charging available ⚡
              </span>
            </label>
          </div>

          {!bay && (
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> The bay geometry will be automatically generated 
                inside the selected zone. For precise placement, use the map interface.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 disabled:opacity-50"
            >
              {loading ? 'Saving...' : bay ? 'Update Bay' : 'Create Bay'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
