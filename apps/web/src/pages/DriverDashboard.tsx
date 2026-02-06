import clsx from 'clsx'
import { differenceInMinutes, format, formatDistanceToNow } from 'date-fns'
import {
    AlertTriangle,
    Car,
    ChevronRight,
    DollarSign,
    History,
    MapPin,
    Navigation2,
    ParkingCircle,
    Plus,
    Timer
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sessionsApi, vehiclesApi, violationsApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { ParkingSession, Vehicle, Violation } from '../types'

export default function DriverDashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [activeSessions, setActiveSessions] = useState<ParkingSession[]>([])
  const [recentSessions, setRecentSessions] = useState<ParkingSession[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [violations, setViolations] = useState<Violation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [sessionsRes, vehiclesRes, violationsRes] = await Promise.all([
        sessionsApi.getAll({ user_id: user?.user_id, limit: 20 }),
        vehiclesApi.getByUser(user?.user_id!),
        violationsApi.getMy()
      ])

      const sessions = sessionsRes.data
      setActiveSessions(sessions.filter((s: ParkingSession) => s.status === 'active'))
      setRecentSessions(sessions.filter((s: ParkingSession) => s.status !== 'active').slice(0, 5))
      setVehicles(vehiclesRes.data)
      setViolations(violationsRes.data)
      console.log('Violations loaded:', violationsRes.data)
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleEndSession = async (sessionId: number) => {
    if (!confirm('Are you sure you want to end this parking session?')) return
    
    try {
      await sessionsApi.end(sessionId)
      loadData()
    } catch (err) {
      console.error('Failed to end session:', err)
      alert('Failed to end session')
    }
  }

  const handlePayViolation = async (violationId: number) => {
    if (!confirm('Pay this violation?')) return
    
    try {
      await violationsApi.delete(violationId)
      loadData()
    } catch (err) {
      console.error('Failed to pay violation:', err)
      alert('Failed to pay violation')
    }
  }

  const getSessionDuration = (session: ParkingSession) => {
    const start = new Date(session.start_time)
    const end = session.end_time ? new Date(session.end_time) : new Date()
    return differenceInMinutes(end, start)
  }

  const getEstimatedCost = (session: ParkingSession) => {
    const minutes = getSessionDuration(session)
    const hours = minutes / 60
    const rate = 2.50 // Default rate - would come from zone in real app
    return (hours * rate).toFixed(2)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.full_name?.split(' ')[0]}!
        </h1>
        <p className="text-gray-500 mt-1">Manage your parking sessions and vehicles</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Link
          to="/find-parking"
          className="flex items-center gap-4 p-6 bg-primary-600 text-white rounded-2xl hover:bg-primary-700 transition-colors group"
        >
          <div className="p-3 bg-white/20 rounded-xl group-hover:bg-white/30 transition-colors">
            <Navigation2 className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-lg">Find Parking</p>
            <p className="text-primary-100 text-sm">Search for available spots near you</p>
          </div>
          <ChevronRight className="h-5 w-5 ml-auto opacity-70" />
        </Link>

        <Link
          to="/driver/vehicles"
          className="flex items-center gap-4 p-6 bg-white border rounded-2xl hover:border-primary-300 hover:shadow-md transition-all group"
        >
          <div className="p-3 bg-primary-50 rounded-xl group-hover:bg-primary-100 transition-colors">
            <Car className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <p className="font-semibold text-lg text-gray-900">My Vehicles</p>
            <p className="text-gray-500 text-sm">{vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} registered</p>
          </div>
          <ChevronRight className="h-5 w-5 ml-auto text-gray-400" />
        </Link>
      </div>

      {/* Active Sessions */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Timer className="h-5 w-5 text-primary-600" />
            Active Sessions
          </h2>
        </div>

        {activeSessions.length > 0 ? (
          <div className="space-y-4">
            {activeSessions.map((session) => (
              <div
                key={session.session_id}
                className="bg-white border-2 border-primary-200 rounded-2xl p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-green-100 rounded-xl">
                      <ParkingCircle className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        Bay {session.bay_id}
                      </p>
                      <p className="text-sm text-gray-500">
                        {session.vehicle?.license_plate || 'Vehicle'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
                      <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
                      Active
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Started</p>
                    <p className="font-medium text-gray-900">
                      {format(new Date(session.start_time), 'HH:mm')}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatDistanceToNow(new Date(session.start_time), { addSuffix: true })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Duration</p>
                    <p className="font-medium text-gray-900">
                      {Math.floor(getSessionDuration(session) / 60)}h {getSessionDuration(session) % 60}m
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Est. Cost</p>
                    <p className="font-medium text-gray-900">€{getEstimatedCost(session)}</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => handleEndSession(session.session_id)}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
                  >
                    End Session
                  </button>
                  <button
                    onClick={() => {
                      // Would navigate to bay location
                      window.open(
                        `https://www.google.com/maps/search/?api=1&query=parking+bay`,
                        '_blank'
                      )
                    }}
                    className="px-4 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <MapPin className="h-5 w-5 text-gray-600" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-8 text-center">
            <ParkingCircle className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-600 font-medium">No active parking sessions</p>
            <p className="text-sm text-gray-500 mt-1">Find parking to start a new session</p>
            <Link
              to="/find-parking"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" />
              Find Parking
            </Link>
          </div>
        )}
      </div>

      {/* Violations */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Outstanding Violations
          </h2>
          <span className="text-sm text-red-600 font-medium">
            {violations.length} violation{violations.length !== 1 ? 's' : ''}
          </span>
        </div>

        {violations.length > 0 ? (
          <div className="space-y-3">
            {violations.map((violation) => (
              <div
                key={violation.violation_id}
                className="bg-white border-2 border-red-200 rounded-2xl p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-xl">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 capitalize">
                        {violation.violation_type.replace('_', ' ')}
                      </p>
                      <p className="text-sm text-gray-500">
                        Bay {violation.bay_number} • {format(new Date(violation.issued_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-red-600">
                      €{violation.fine_amount.toFixed(2)}
                    </p>
                  </div>
                </div>

                {violation.notes && (
                  <p className="text-sm text-gray-600 mb-3 pl-11">{violation.notes}</p>
                )}

                <div className="flex gap-2 pl-11">
                  <button
                    onClick={() => handlePayViolation(violation.violation_id)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                  >
                    <DollarSign className="h-4 w-4" />
                    Pay Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-6 text-center">
            <AlertTriangle className="h-10 w-10 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-500">No outstanding violations</p>
          </div>
        )}
      </div>

      {/* Recent Sessions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <History className="h-5 w-5 text-gray-400" />
            Recent Sessions
          </h2>
          <Link
            to="/driver/history"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            View All →
          </Link>
        </div>

        {recentSessions.length > 0 ? (
          <div className="bg-white rounded-2xl border divide-y">
            {recentSessions.map((session) => (
              <div key={session.session_id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    'p-2 rounded-lg',
                    session.status === 'completed' ? 'bg-gray-100' : 'bg-red-100'
                  )}>
                    <ParkingCircle className={clsx(
                      'h-5 w-5',
                      session.status === 'completed' ? 'text-gray-500' : 'text-red-500'
                    )} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Bay {session.bay_id}</p>
                    <p className="text-sm text-gray-500">
                      {format(new Date(session.start_time), 'MMM d, yyyy • HH:mm')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900">
                    €{session.amount_due?.toFixed(2) || '0.00'}
                  </p>
                  <p className={clsx(
                    'text-xs capitalize',
                    session.status === 'completed' ? 'text-gray-500' : 'text-red-500'
                  )}>
                    {session.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-6 text-center">
            <History className="h-10 w-10 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-500">No recent sessions</p>
          </div>
        )}
      </div>

      {/* Registered Vehicles */}
      {vehicles.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Car className="h-5 w-5 text-gray-400" />
              My Vehicles
            </h2>
            <Link
              to="/driver/vehicles"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Manage →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {vehicles.slice(0, 4).map((vehicle) => (
              <div
                key={vehicle.vehicle_id}
                className="bg-white rounded-xl border p-4 flex items-center gap-3"
              >
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Car className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{vehicle.license_plate}</p>
                  <p className="text-sm text-gray-500 capitalize">{vehicle.type}</p>
                </div>
                {vehicle.is_default && (
                  <span className="ml-auto text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded-full">
                    Default
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
