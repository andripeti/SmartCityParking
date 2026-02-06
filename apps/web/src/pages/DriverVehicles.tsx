import {
    Car,
    Check,
    Edit2,
    Loader2,
    Plus,
    Trash2,
    X
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { vehiclesApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Vehicle } from '../types'

interface VehicleForm {
  license_plate: string
  vehicle_type: string
  color?: string
}

const VEHICLE_TYPES = ['car', 'motorcycle', 'van', 'truck', 'bus']

export default function DriverVehicles() {
  const { user } = useAuthStore()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<VehicleForm>({
    license_plate: '',
    vehicle_type: 'car',
    color: undefined
  })

  useEffect(() => {
    loadVehicles()
  }, [])

  const loadVehicles = async () => {
    try {
      const res = await vehiclesApi.getByUser(user?.user_id!)
      setVehicles(res.data)
    } catch (err) {
      console.error('Failed to load vehicles:', err)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setForm({
      license_plate: '',
      vehicle_type: 'car',
      color: undefined
    })
    setShowForm(false)
    setEditingId(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      if (editingId) {
        await vehiclesApi.update(editingId, form)
      } else {
        await vehiclesApi.create({
          ...form,
          user_id: user?.user_id!
        })
      }
      await loadVehicles()
      resetForm()
    } catch (err) {
      console.error('Failed to save vehicle:', err)
      alert('Failed to save vehicle')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (vehicle: Vehicle) => {
    setForm({
      license_plate: vehicle.license_plate,
      vehicle_type: vehicle.vehicle_type,
      color: vehicle.color
    })
    setEditingId(vehicle.vehicle_id)
    setShowForm(true)
  }

  const handleDelete = async (vehicleId: number) => {
    if (!confirm('Are you sure you want to remove this vehicle?')) return

    try {
      await vehiclesApi.delete(vehicleId)
      await loadVehicles()
    } catch (err) {
      console.error('Failed to delete vehicle:', err)
      alert('Failed to delete vehicle')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="p-6 max-w-2xl mx-auto w-full flex-shrink-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Vehicles</h1>
            <p className="text-gray-500">Manage your registered vehicles</p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" />
              Add Vehicle
            </button>
          )}
        </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {editingId ? 'Edit Vehicle' : 'Add New Vehicle'}
            </h2>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                License Plate
              </label>
              <input
                type="text"
                required
                value={form.license_plate}
                onChange={(e) => setForm({ ...form, license_plate: e.target.value.toUpperCase() })}
                placeholder="e.g., AB-123-CD"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vehicle Type
              </label>
              <select
                value={form.vehicle_type}
                onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {VEHICLE_TYPES.map((type) => (
                  <option key={type} value={type} className="capitalize">
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Color (Optional)
              </label>
              <input
                type="text"
                value={form.color || ''}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                placeholder="e.g., Red, Blue, Black"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    {editingId ? 'Update' : 'Add'} Vehicle
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2.5 border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      </div>

      {/* Vehicles List - Scrollable */}
      <div className="flex-1 overflow-y-auto px-6 max-w-2xl mx-auto w-full pb-6">
        {vehicles.length > 0 ? (
          <div className="space-y-3">
            {vehicles.map((vehicle) => (
              <div
                key={vehicle.vehicle_id}
                className="bg-white rounded-xl border p-4 flex items-center gap-4"
              >
              <div className="p-3 rounded-xl bg-gray-100">
                <Car className="h-6 w-6 text-gray-500" />
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">{vehicle.license_plate}</p>
                </div>
                <p className="text-sm text-gray-500 capitalize">{vehicle.vehicle_type}</p>
                {vehicle.color && (
                  <p className="text-xs text-gray-400">{vehicle.color}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEdit(vehicle)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                  title="Edit"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(vehicle.vehicle_id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-12 text-center">
            <Car className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-700">No vehicles registered</h3>
            <p className="text-gray-500 mt-1">Add your first vehicle to start parking</p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" />
              Add Vehicle
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
