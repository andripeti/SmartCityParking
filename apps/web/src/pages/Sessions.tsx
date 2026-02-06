import clsx from 'clsx'
import { format, formatDistanceToNow } from 'date-fns'
import { AlertTriangle, Clock, Filter, Play, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { sessionsApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { ParkingSession } from '../types'

export default function Sessions() {
  const { user } = useAuthStore()
  const [sessions, setSessions] = useState<ParkingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [endingSession, setEndingSession] = useState<number | null>(null)

  useEffect(() => {
    loadSessions()
  }, [filterStatus])

  const handleEndSession = async (sessionId: number) => {
    if (!confirm('Are you sure you want to end this parking session?')) return
    
    setEndingSession(sessionId)
    try {
      await sessionsApi.end(sessionId)
      await loadSessions()
      alert('Parking session ended successfully')
    } catch (err: any) {
      console.error('Failed to end session:', err)
      alert(err?.response?.data?.detail || 'Failed to end parking session')
    } finally {
      setEndingSession(null)
    }
  }

  const loadSessions = async () => {
    try {
      setLoading(true)
      const response = await sessionsApi.getAll({
        status: filterStatus || undefined,
      })
      setSessions(response.data)
    } catch (err) {
      console.error('Failed to load sessions:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Play className="h-4 w-4 text-green-500" />
      case 'completed':
        return <Square className="h-4 w-4 text-gray-500" />
      case 'overstay':
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const statusCounts = {
    active: sessions.filter(s => s.status === 'active').length,
    completed: sessions.filter(s => s.status === 'completed').length,
    overstay: sessions.filter(s => s.status === 'overstay').length,
    cancelled: sessions.filter(s => s.status === 'cancelled').length,
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Parking Sessions</h1>
        {user?.role === 'driver' && (
          <button className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500">
            <Play className="h-4 w-4" />
            Start Session
          </button>
        )}
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-green-700 font-medium">Active</span>
            <span className="text-2xl font-bold text-green-700">{statusCounts.active}</span>
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-700 font-medium">Completed</span>
            <span className="text-2xl font-bold text-gray-700">{statusCounts.completed}</span>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-red-700 font-medium">Overstay</span>
            <span className="text-2xl font-bold text-red-700">{statusCounts.overstay}</span>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-amber-700 font-medium">Cancelled</span>
            <span className="text-2xl font-bold text-amber-700">{statusCounts.cancelled}</span>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filter:</span>
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="overstay">Overstay</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Session
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Bay
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Start Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Duration
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sessions.map((session) => (
                <tr key={session.session_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-medium text-gray-900">#{session.session_id}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    Bay {session.bay_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-2">
                      {getStatusIcon(session.status)}
                      <span className={clsx(
                        'px-2 py-1 rounded-full text-xs font-medium capitalize',
                        session.status === 'active' && 'bg-green-100 text-green-700',
                        session.status === 'completed' && 'bg-gray-100 text-gray-700',
                        session.status === 'overstay' && 'bg-red-100 text-red-700',
                        session.status === 'cancelled' && 'bg-amber-100 text-amber-700',
                      )}>
                        {session.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(session.start_time), 'MMM d, HH:mm')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {session.end_time
                      ? formatDistanceToNow(new Date(session.start_time))
                      : formatDistanceToNow(new Date(session.start_time), { addSuffix: false })
                    }
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                    €{session.amount_paid.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    {session.status === 'active' && (
                      <button 
                        onClick={() => handleEndSession(session.session_id)}
                        disabled={endingSession === session.session_id}
                        className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                      >
                        {endingSession === session.session_id ? 'Ending...' : 'End Session'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sessions.length === 0 && (
          <div className="text-center py-12">
            <Clock className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">No sessions found</p>
          </div>
        )}
      </div>
    </div>
  )
}
