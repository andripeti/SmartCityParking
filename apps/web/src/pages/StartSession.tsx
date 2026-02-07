import clsx from 'clsx'
import { addHours, format } from 'date-fns'
import {
    Accessibility,
    AlertCircle,
    ArrowLeft,
    Car,
    Check,
    Clock,
    CreditCard,
    Loader2,
    MapPin,
    Plus,
    Zap
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { baysApi, sessionsApi, vehiclesApi, zonesApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Bay, Vehicle, Zone } from '../types'

export default function StartSession() {
  const { bayId } = useParams<{ bayId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  
  const [bay, setBay] = useState<Bay | null>(null)
  const [zone, setZone] = useState<Zone | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<number | null>(null)
  const [duration, setDuration] = useState(2) // hours
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [bayId])

  const loadData = async () => {
    try {
      const [bayRes, vehiclesRes, zonesRes] = await Promise.all([
        baysApi.getById(Number(bayId)),
        vehiclesApi.getByUser(user?.user_id!),
        zonesApi.getAll()
      ])

      setBay(bayRes.data)
      setVehicles(vehiclesRes.data)
      
      // Find zone for this bay
      const bayZone = zonesRes.data.find((z: Zone) => z.zone_id === bayRes.data.zone_id)
      setZone(bayZone || null)

      // Auto-select default vehicle
      const defaultVehicle = vehiclesRes.data.find((v: Vehicle) => v.is_default)
      if (defaultVehicle) {
        setSelectedVehicle(defaultVehicle.vehicle_id)
      } else if (vehiclesRes.data.length > 0) {
        setSelectedVehicle(vehiclesRes.data[0].vehicle_id)
      }
    } catch (err) {
      console.error('Failed to load data:', err)
      setError('Failed to load bay information')
    } finally {
      setLoading(false)
    }
  }

  const calculateCost = () => {
    if (!zone?.tariff) {
      // Default rate if no tariff assigned
      return 2.0 * duration
    }
    return zone.tariff.hourly_rate * duration
  }

  const handleStartSession = async () => {
    if (!selectedVehicle) {
      setError('Please select a vehicle')
      return
    }

    setStarting(true)
    setError(null)

    try {
      await sessionsApi.start({
        bay_id: Number(bayId),
        vehicle_id: selectedVehicle,
        payment_method: 'mobile_app'
      })
      
      navigate('/driver', { 
        state: { message: 'Parking session started successfully!' }
      })
    } catch (err: any) {
      console.error('Failed to start session:', err)
      let errorMsg = 'Failed to start parking session'
      if (err.response?.data) {
        const data = err.response.data
        if (data.detail) {
          errorMsg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
        } else if (Array.isArray(data)) {
          errorMsg = data.map((e: any) => `${e.loc?.join('.')}: ${e.msg}`).join('; ')
        }
      }
      setError(errorMsg)
    } finally {
      setStarting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!bay) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="bg-red-50 rounded-xl p-6 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-3" />
          <h2 className="text-lg font-medium text-red-800">Bay not found</h2>
          <p className="text-red-600 mt-1">The requested parking bay does not exist.</p>
          <Link
            to="/find-parking"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-red-600 text-white rounded-lg"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Search
          </Link>
        </div>
      </div>
    )
  }

  if (bay.status !== 'available') {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="bg-amber-50 rounded-xl p-6 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-amber-500 mb-3" />
          <h2 className="text-lg font-medium text-amber-800">Bay unavailable</h2>
          <p className="text-amber-600 mt-1">
            This parking bay is currently {bay.status}.
          </p>
          <Link
            to="/find-parking"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg"
          >
            <ArrowLeft className="h-4 w-4" />
            Find Another Bay
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Start Parking Session</h1>
          <p className="text-gray-500">Bay {bay.bay_number}</p>
        </div>
      </div>

      {/* Bay Info Card */}
      <div className="bg-white rounded-xl border p-4 mb-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-primary-100 rounded-xl">
            <MapPin className="h-6 w-6 text-primary-600" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900">{zone?.name || 'Parking Zone'}</h2>
            <p className="text-sm text-gray-500">Bay {bay.bay_number}</p>
            <div className="flex items-center gap-3 mt-2">
              {bay.is_electric && (
                <span className="inline-flex items-center gap-1 text-xs text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
                  <Zap className="h-3 w-3" /> EV Charging
                </span>
              )}
              {bay.is_disabled_only && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                  <Accessibility className="h-3 w-3" /> Accessible
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Vehicle Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Vehicle
        </label>
        {vehicles.length > 0 ? (
          <div className="space-y-2">
            {vehicles.map((vehicle) => (
              <button
                key={vehicle.vehicle_id}
                onClick={() => setSelectedVehicle(vehicle.vehicle_id)}
                className={clsx(
                  'w-full flex items-center gap-3 p-3 rounded-xl border transition-colors',
                  selectedVehicle === vehicle.vehicle_id
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <div className={clsx(
                  'p-2 rounded-lg',
                  selectedVehicle === vehicle.vehicle_id
                    ? 'bg-primary-100'
                    : 'bg-gray-100'
                )}>
                  <Car className={clsx(
                    'h-5 w-5',
                    selectedVehicle === vehicle.vehicle_id
                      ? 'text-primary-600'
                      : 'text-gray-500'
                  )} />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-gray-900">{vehicle.license_plate}</p>
                  <p className="text-sm text-gray-500 capitalize">{vehicle.type}</p>
                </div>
                {selectedVehicle === vehicle.vehicle_id && (
                  <Check className="h-5 w-5 text-primary-600" />
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <Car className="h-8 w-8 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-600">No vehicles registered</p>
            <Link
              to="/driver/vehicles"
              className="inline-flex items-center gap-1 mt-2 text-sm text-primary-600 font-medium"
            >
              <Plus className="h-4 w-4" /> Add a vehicle
            </Link>
          </div>
        )}
      </div>

      {/* Duration Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Parking Duration
        </label>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 4, 8].map((hours) => (
            <button
              key={hours}
              onClick={() => setDuration(hours)}
              className={clsx(
                'py-3 rounded-xl border font-medium transition-colors',
                duration === hours
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 hover:border-gray-300'
              )}
            >
              {hours}h
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
          <Clock className="h-4 w-4" />
          Until {format(addHours(new Date(), duration), 'HH:mm')}
        </p>
      </div>

      {/* Cost Summary */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-gray-400" />
            <span className="text-gray-700">Estimated Cost</span>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">€{calculateCost().toFixed(2)}</p>
            <p className="text-sm text-gray-500">
              €{zone?.tariff ? zone.tariff.hourly_rate : '2.00'}/hour × {duration}h
            </p>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Start Button */}
      <button
        onClick={handleStartSession}
        disabled={starting || !selectedVehicle}
        className="w-full py-4 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {starting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Starting Session...
          </>
        ) : (
          'Start Parking Session'
        )}
      </button>

      <p className="text-center text-sm text-gray-500 mt-4">
        You can end your session early at any time. You'll only be charged for the actual time parked.
      </p>
    </div>
  )
}
