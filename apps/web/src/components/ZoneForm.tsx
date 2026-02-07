import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { zonesApi } from '../lib/api'
import { ParkingZone } from '../types'

interface ZoneFormProps {
  zone?: ParkingZone
  onClose: () => void
  onSuccess: () => void
}

const zoneTypes = [
  { value: 'on_street', label: 'On Street' },
  { value: 'off_street', label: 'Off Street' },
  { value: 'garage', label: 'Garage' },
  { value: 'lot', label: 'Lot' },
]

export default function ZoneForm({ zone, onClose, onSuccess }: ZoneFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    zone_type: 'on_street',
    max_duration_minutes: '',
    is_active: true,
    coordinates: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (zone) {
      setFormData({
        name: zone.name,
        zone_type: zone.zone_type,
        max_duration_minutes: zone.max_duration_minutes?.toString() || '',
        is_active: zone.is_active,
        coordinates: '', // Geometry can't be edited easily through form
      })
    }
  }, [zone])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.name) {
      setError('Zone name is required')
      return
    }

    if (!zone && !formData.coordinates) {
      setError('Coordinates are required for new zones')
      return
    }

    try {
      setLoading(true)
      const data: any = {
        name: formData.name,
        zone_type: formData.zone_type,
        max_duration_minutes: formData.max_duration_minutes
          ? parseInt(formData.max_duration_minutes)
          : null,
        is_active: formData.is_active,
      }

      if (!zone && formData.coordinates) {
        // Parse coordinates as GeoJSON polygon
        try {
          const geojson = JSON.parse(formData.coordinates)
          data.geom = geojson
        } catch {
          setError('Invalid GeoJSON format')
          setLoading(false)
          return
        }
      }

      if (zone) {
        await zonesApi.update(zone.zone_id, data)
      } else {
        await zonesApi.create(data)
      }
      onSuccess()
    } catch (err: any) {
      let errorMsg = `Failed to ${zone ? 'update' : 'create'} zone`
      if (err.response?.data) {
        const data = err.response.data
        if (data.detail) {
          errorMsg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
        } else if (Array.isArray(data)) {
          // Pydantic validation error array
          errorMsg = data.map((e: any) => `${e.loc?.join('.')}: ${e.msg}`).join('; ')
        }
      }
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {zone ? 'Edit Zone' : 'Add Zone'}
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
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Zone Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Zone Type *
            </label>
            <select
              value={formData.zone_type}
              onChange={(e) => setFormData({ ...formData, zone_type: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            >
              {zoneTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Duration (minutes)
            </label>
            <input
              type="number"
              value={formData.max_duration_minutes}
              onChange={(e) => setFormData({ ...formData, max_duration_minutes: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Leave empty for unlimited"
            />
          </div>

          {!zone && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Coordinates (GeoJSON Polygon) *
              </label>
              <textarea
                value={formData.coordinates}
                onChange={(e) => setFormData({ ...formData, coordinates: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-xs"
                rows={4}
                placeholder='{"type":"Polygon","coordinates":[[[16.37,48.21],[16.38,48.21],[16.38,48.20],[16.37,48.20],[16.37,48.21]]]}'
                required
              />
            </div>
          )}

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="is_active" className="ml-2 block text-sm text-gray-700">
              Active
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? (zone ? 'Updating...' : 'Creating...') : zone ? 'Update Zone' : 'Create Zone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
