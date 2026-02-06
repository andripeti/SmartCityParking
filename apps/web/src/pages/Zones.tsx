import clsx from 'clsx'
import { BarChart3, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import ZoneForm from '../components/ZoneForm'
import { zonesApi } from '../lib/api'
import { ParkingZone, ZoneOccupancy } from '../types'

export default function Zones() {
  const [zones, setZones] = useState<ParkingZone[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedZone, setSelectedZone] = useState<ParkingZone | null>(null)
  const [occupancy, setOccupancy] = useState<ZoneOccupancy | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingZone, setEditingZone] = useState<ParkingZone | null>(null)

  useEffect(() => {
    loadZones()
  }, [])

  const loadZones = async () => {
    try {
      setLoading(true)
      const response = await zonesApi.getAll()
      setZones(response.data)
    } catch (err) {
      console.error('Failed to load zones:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadOccupancy = async (zoneId: number) => {
    try {
      const response = await zonesApi.getOccupancy(zoneId)
      setOccupancy(response.data)
    } catch (err) {
      console.error('Failed to load occupancy:', err)
    }
  }

  const handleSelectZone = (zone: ParkingZone) => {
    setSelectedZone(zone)
    loadOccupancy(zone.zone_id)
  }

  const handleEdit = (e: React.MouseEvent, zone: ParkingZone) => {
    e.stopPropagation()
    setEditingZone(zone)
    setShowForm(true)
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingZone(null)
    loadZones()
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditingZone(null)
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {showForm && (
        <ZoneForm
          zone={editingZone || undefined}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Parking Zones</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500"
        >
          <Plus className="h-4 w-4" />
          Add Zone
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Zones List */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Zone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Max Duration
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {zones.map((zone) => (
                <tr
                  key={zone.zone_id}
                  className={clsx(
                    'cursor-pointer hover:bg-gray-50',
                    selectedZone?.zone_id === zone.zone_id && 'bg-primary-50'
                  )}
                  onClick={() => handleSelectZone(zone)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <MapPin className="h-5 w-5 text-primary-500 mr-2" />
                      <span className="font-medium text-gray-900">{zone.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                    {zone.zone_type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-900">
                    {zone.max_duration_minutes ? `${zone.max_duration_minutes} min` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={clsx(
                      'px-2 py-1 rounded-full text-xs font-medium',
                      zone.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    )}>
                      {zone.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={(e) => handleEdit(e, zone)}
                      className="p-1 text-gray-400 hover:text-primary-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="p-1 text-gray-400 hover:text-red-600 ml-2">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {/* Zone Details */}
        <div className="space-y-4">
          {selectedZone && (
            <>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="font-semibold text-gray-900 mb-4">Zone Details</h2>
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Name</dt>
                    <dd className="text-sm font-medium">{selectedZone.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Type</dt>
                    <dd className="text-sm font-medium capitalize">{selectedZone.zone_type}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Max Duration</dt>
                    <dd className="text-sm font-medium">
                      {selectedZone.max_duration_minutes ? `${selectedZone.max_duration_minutes} min` : 'Unlimited'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Created</dt>
                    <dd className="text-sm font-medium">
                      {new Date(selectedZone.created_at).toLocaleDateString()}
                    </dd>
                  </div>
                </dl>
              </div>

              {occupancy && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="h-5 w-5 text-primary-500" />
                    <h2 className="font-semibold text-gray-900">Occupancy</h2>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Total Bays</span>
                      <span className="text-lg font-semibold">{occupancy.total_bays}</span>
                    </div>
                    <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={clsx(
                          'h-full rounded-full',
                          occupancy.occupancy_percent > 85 ? 'bg-red-500' :
                          occupancy.occupancy_percent > 60 ? 'bg-amber-500' :
                          'bg-green-500'
                        )}
                        style={{ width: `${occupancy.occupancy_percent}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-green-50 p-2 rounded-lg">
                        <span className="text-green-700 font-medium">{occupancy.available_bays}</span>
                        <span className="text-green-600 ml-1">Available</span>
                      </div>
                      <div className="bg-red-50 p-2 rounded-lg">
                        <span className="text-red-700 font-medium">{occupancy.occupied_bays}</span>
                        <span className="text-red-600 ml-1">Occupied</span>
                      </div>
                      <div className="bg-amber-50 p-2 rounded-lg">
                        <span className="text-amber-700 font-medium">{occupancy.reserved_bays}</span>
                        <span className="text-amber-600 ml-1">Reserved</span>
                      </div>
                      <div className="bg-gray-50 p-2 rounded-lg">
                        <span className="text-gray-700 font-medium">{occupancy.closed_bays}</span>
                        <span className="text-gray-600 ml-1">Closed</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
