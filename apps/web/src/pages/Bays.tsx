import clsx from 'clsx'
import { Filter, ParkingSquare, Pencil, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import BayForm from '../components/BayForm'
import { baysApi, zonesApi } from '../lib/api'
import { ParkingBay, ParkingZone } from '../types'

export default function Bays() {
  const [bays, setBays] = useState<ParkingBay[]>([])
  const [zones, setZones] = useState<ParkingZone[]>([])
  const [loading, setLoading] = useState(true)
  const [filterZone, setFilterZone] = useState<number | ''>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [editingBay, setEditingBay] = useState<ParkingBay | null>(null)

  useEffect(() => {
    loadData()
  }, [filterZone, filterStatus])

  const loadData = async () => {
    try {
      setLoading(true)
      const [baysRes, zonesRes] = await Promise.all([
        baysApi.getAll({
          zone_id: filterZone || undefined,
          status: filterStatus || undefined,
        }),
        zonesApi.getAll(),
      ])
      setBays(baysRes.data)
      setZones(zonesRes.data)
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  const getZoneName = (zoneId: number) => {
    return zones.find(z => z.zone_id === zoneId)?.name || 'Unknown'
  }

  const handleStatusChange = async (bayId: number, newStatus: string) => {
    try {
      await baysApi.updateStatus(bayId, newStatus)
      loadData()
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }

  const handleEdit = (bay: ParkingBay) => {
    setEditingBay(bay)
    setShowForm(true)
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingBay(null)
    loadData()
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditingBay(null)
  }

  const statusCounts = {
    available: bays.filter(b => b.status === 'available').length,
    occupied: bays.filter(b => b.status === 'occupied').length,
    reserved: bays.filter(b => b.status === 'reserved').length,
    closed: bays.filter(b => b.status === 'closed').length,
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
        <BayForm
          bay={editingBay || undefined}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Parking Bays</h1>
        <button 
          onClick={() => setShowForm(true)} 
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500"
        >
          <Plus className="h-4 w-4" />
          Add Bay
        </button>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-green-700 font-medium">Available</span>
            <span className="text-2xl font-bold text-green-700">{statusCounts.available}</span>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-red-700 font-medium">Occupied</span>
            <span className="text-2xl font-bold text-red-700">{statusCounts.occupied}</span>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-amber-700 font-medium">Reserved</span>
            <span className="text-2xl font-bold text-amber-700">{statusCounts.reserved}</span>
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-700 font-medium">Closed</span>
            <span className="text-2xl font-bold text-gray-700">{statusCounts.closed}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>
          <select
            value={filterZone}
            onChange={(e) => setFilterZone(e.target.value ? Number(e.target.value) : '')}
            className="px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Zones</option>
            {zones.map(zone => (
              <option key={zone.zone_id} value={zone.zone_id}>{zone.name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Statuses</option>
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="reserved">Reserved</option>
            <option value="closed">Closed</option>
          </select>
          <button
            onClick={() => { setFilterZone(''); setFilterStatus(''); }}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Bays Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Bay
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Zone
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Features
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Last Update
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {bays.map((bay) => (
                <tr key={bay.bay_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <ParkingSquare className="h-5 w-5 text-gray-400 mr-2" />
                      <span className="font-medium text-gray-900">{bay.bay_number}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getZoneName(bay.zone_id)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <select
                      value={bay.status}
                      onChange={(e) => handleStatusChange(bay.bay_id, e.target.value)}
                      className={clsx(
                        'px-2 py-1 rounded-full text-xs font-medium border-0 focus:ring-2 focus:ring-primary-500',
                        bay.status === 'available' && 'bg-green-100 text-green-700',
                        bay.status === 'occupied' && 'bg-red-100 text-red-700',
                        bay.status === 'reserved' && 'bg-amber-100 text-amber-700',
                        bay.status === 'closed' && 'bg-gray-100 text-gray-700',
                      )}
                    >
                      <option value="available">Available</option>
                      <option value="occupied">Occupied</option>
                      <option value="reserved">Reserved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-2">
                      {bay.is_disabled_only && (
                        <span title="Disabled parking" className="text-lg">♿</span>
                      )}
                      {bay.is_electric && (
                        <span title="EV charging" className="text-lg">⚡</span>
                      )}
                      {!bay.is_disabled_only && !bay.is_electric && (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {bay.last_status_update
                      ? new Date(bay.last_status_update).toLocaleString()
                      : '-'
                    }
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button 
                      onClick={() => handleEdit(bay)}
                      className="p-1 text-gray-400 hover:text-primary-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {bays.length === 0 && (
          <div className="text-center py-12">
            <ParkingSquare className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">No bays found</p>
          </div>
        )}
      </div>
    </div>
  )
}
