import clsx from 'clsx'
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import {
    Calendar,
    ChevronDown,
    Clock,
    CreditCard,
    Download,
    Filter,
    History,
    ParkingCircle
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { sessionsApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { ParkingSession } from '../types'

export default function DriverHistory() {
  const { user } = useAuthStore()
  const [sessions, setSessions] = useState<ParkingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    loadSessions()
  }, [selectedMonth])

  const loadSessions = async () => {
    setLoading(true)
    try {
      const start = startOfMonth(selectedMonth)
      const end = endOfMonth(selectedMonth)
      
      const res = await sessionsApi.getAll({
        user_id: user?.user_id,
        start_time_from: start.toISOString(),
        start_time_to: end.toISOString(),
        limit: 100
      })
      setSessions(res.data)
    } catch (err) {
      console.error('Failed to load sessions:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredSessions = sessions.filter(
    s => statusFilter === 'all' || s.status === statusFilter
  )

  const totalSpent = filteredSessions.reduce(
    (sum, s) => sum + (s.amount_due || 0), 0
  )

  const totalHours = filteredSessions.reduce((sum, s) => {
    if (!s.end_time) return sum
    const start = new Date(s.start_time)
    const end = new Date(s.end_time)
    return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60)
  }, 0)

  const months = Array.from({ length: 12 }, (_, i) => subMonths(new Date(), i))

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parking History</h1>
          <p className="text-gray-500">View your past parking sessions</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative">
          <select
            value={format(selectedMonth, 'yyyy-MM')}
            onChange={(e) => setSelectedMonth(new Date(e.target.value + '-01'))}
            className="appearance-none pl-10 pr-8 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {months.map((month) => (
              <option key={month.toISOString()} value={format(month, 'yyyy-MM')}>
                {format(month, 'MMMM yyyy')}
              </option>
            ))}
          </select>
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        </div>

        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none pl-10 pr-8 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="overstay">Overstay</option>
          </select>
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <ParkingCircle className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Sessions</p>
              <p className="text-xl font-bold text-gray-900">{filteredSessions.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CreditCard className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Spent</p>
              <p className="text-xl font-bold text-gray-900">€{totalSpent.toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Time</p>
              <p className="text-xl font-bold text-gray-900">{totalHours.toFixed(1)}h</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sessions List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : filteredSessions.length > 0 ? (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date & Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vehicle
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredSessions.map((session) => {
                const start = new Date(session.start_time)
                const end = session.end_time ? new Date(session.end_time) : null
                const durationMins = end
                  ? Math.round((end.getTime() - start.getTime()) / (1000 * 60))
                  : null

                return (
                  <tr key={session.session_id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {format(start, 'MMM d, yyyy')}
                      </div>
                      <div className="text-sm text-gray-500">
                        {format(start, 'HH:mm')}
                        {end && ` - ${format(end, 'HH:mm')}`}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">Bay {session.bay_id}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {session.vehicle?.license_plate || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {durationMins !== null ? (
                          `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`
                        ) : (
                          '-'
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={clsx(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                        session.status === 'completed' && 'bg-green-100 text-green-800',
                        session.status === 'cancelled' && 'bg-gray-100 text-gray-800',
                        session.status === 'overstay' && 'bg-red-100 text-red-800',
                        session.status === 'active' && 'bg-blue-100 text-blue-800'
                      )}>
                        {session.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-medium text-gray-900">
                        €{session.amount_due?.toFixed(2) || '0.00'}
                      </div>
                      {session.payment_status && (
                        <div className={clsx(
                          'text-xs',
                          session.payment_status === 'paid' ? 'text-green-600' : 'text-amber-600'
                        )}>
                          {session.payment_status}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-2xl p-12 text-center">
          <History className="h-16 w-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700">No sessions found</h3>
          <p className="text-gray-500 mt-1">
            No parking sessions for {format(selectedMonth, 'MMMM yyyy')}
          </p>
        </div>
      )}
    </div>
  )
}
