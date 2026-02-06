import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { sessionsApi, violationsApi } from '../lib/api'
import { ParkingSession } from '../types'

interface ViolationFormProps {
  onClose: () => void
  onSuccess: () => void
}

const violationTypes = [
  { value: 'no_payment', label: 'No Payment' },
  { value: 'overstay', label: 'Overstay' },
  { value: 'wrong_zone', label: 'Wrong Zone' },
]

export default function ViolationForm({ onClose, onSuccess }: ViolationFormProps) {
  const [allSessions, setAllSessions] = useState<ParkingSession[]>([])
  const [selectedSession, setSelectedSession] = useState<ParkingSession | null>(null)
  const [formData, setFormData] = useState({
    session_id: '',
    violation_type: 'no_payment',
    fine_amount: '50',
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      setLoadingSessions(true)
      // Load both active and recently completed sessions
      const [activeRes, completedRes] = await Promise.all([
        sessionsApi.getAll({ status: 'active' }),
        sessionsApi.getAll({ status: 'completed' })
      ])
      
      // Filter completed sessions to only last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const recentCompleted = completedRes.data.filter((session: ParkingSession) => {
        const endTime = session.end_time ? new Date(session.end_time) : null
        return endTime && endTime > twentyFourHoursAgo
      })
      
      // Combine and sort by start time (newest first)
      const combined = [...activeRes.data, ...recentCompleted].sort((a, b) => 
        new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
      )
      
      setAllSessions(combined)
    } catch (err) {
      console.error('Failed to load sessions:', err)
      setError('Failed to load sessions')
    } finally {
      setLoadingSessions(false)
    }
  }

  const handleSessionSelect = (sessionId: string) => {
    const session = allSessions.find(s => s.session_id === parseInt(sessionId))
    setSelectedSession(session || null)
    setFormData({ ...formData, session_id: sessionId })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.session_id || !formData.fine_amount) {
      setError('Please fill in all required fields')
      return
    }

    if (!selectedSession) {
      setError('Please select a valid session')
      return
    }

    try {
      setLoading(true)
      await violationsApi.create({
        session_id: parseInt(formData.session_id),
        bay_id: selectedSession.bay_id,
        violation_type: formData.violation_type,
        fine_amount: parseFloat(formData.fine_amount),
        notes: formData.notes || null,
      })
      onSuccess()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create violation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Issue Violation</h2>
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

          {loadingSessions ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-500">Loading sessions...</p>
            </div>
          ) : allSessions.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
              <p className="font-medium">No recent sessions found</p>
              <p className="mt-1">There are currently no active or recent parking sessions to issue violations for.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Parking Session *
                </label>
                <select
                  value={formData.session_id}
                  onChange={(e) => handleSessionSelect(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                >
                  <option value="">Select a session</option>
                  {allSessions.map((session) => {
                    const isActive = session.status === 'active'
                    const statusLabel = isActive ? '🟢 Active' : '⚪ Completed'
                    const timeInfo = isActive 
                      ? `Started: ${new Date(session.start_time).toLocaleString()}`
                      : `Ended: ${session.end_time ? new Date(session.end_time).toLocaleString() : 'Unknown'}`
                    
                    return (
                      <option key={session.session_id} value={session.session_id}>
                        {statusLabel} - Session #{session.session_id} - Bay #{session.bay_id} - Vehicle #{session.vehicle_id}
                      </option>
                    )
                  })}
                </select>
                {selectedSession && (
                  <div className="mt-2 text-xs text-gray-600 space-y-1">
                    <p>
                      <span className="font-medium">Status:</span>{' '}
                      <span className={selectedSession.status === 'active' ? 'text-green-600' : 'text-gray-600'}>
                        {selectedSession.status === 'active' ? 'Active' : 'Completed'}
                      </span>
                    </p>
                    <p>
                      <span className="font-medium">Started:</span> {new Date(selectedSession.start_time).toLocaleString()}
                    </p>
                    {selectedSession.end_time && (
                      <p>
                        <span className="font-medium">Ended:</span> {new Date(selectedSession.end_time).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Violation Type *
                </label>
                <select
                  value={formData.violation_type}
                  onChange={(e) => setFormData({ ...formData, violation_type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                >
                  {violationTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fine Amount (€) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.fine_amount}
                  onChange={(e) => setFormData({ ...formData, fine_amount: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={3}
                  placeholder="Additional details about the violation..."
                />
              </div>
            </>
          )}

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
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50"
              disabled={loading || loadingSessions || allSessions.length === 0}
            >
              {loading ? 'Creating...' : 'Issue Violation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
