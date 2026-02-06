import clsx from 'clsx'
import { format, subDays } from 'date-fns'
import { AlertTriangle, Calendar, DollarSign, Filter, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import ViolationForm from '../components/ViolationForm'
import { violationsApi } from '../lib/api'
import { Violation } from '../types'

export default function Violations() {
  const [violations, setViolations] = useState<Violation[]>([])
  const [stats, setStats] = useState<{ by_type: Array<{ violation_type: string; count: number; total_fines: number }>; total_violations: number; total_fines: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('')
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('week')
  const [searchQuery, setSearchQuery] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    loadData()
  }, [filterType, dateRange])

  const getDateFilter = () => {
    const now = new Date()
    switch (dateRange) {
      case 'today':
        return { start_date: format(now, 'yyyy-MM-dd') }
      case 'week':
        return { start_date: format(subDays(now, 7), 'yyyy-MM-dd') }
      case 'month':
        return { start_date: format(subDays(now, 30), 'yyyy-MM-dd') }
      default:
        return {}
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      const dateFilter = getDateFilter()
      const [violationsRes, statsRes] = await Promise.all([
        violationsApi.getAll({ violation_type: filterType || undefined, ...dateFilter }),
        violationsApi.getStats(),
      ])
      setViolations(violationsRes.data)
      setStats(statsRes.data)
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filter violations by search query (bay ID or notes)
  const filteredViolations = violations.filter(v => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      v.bay_id.toString().includes(query) ||
      v.violation_type.toLowerCase().includes(query) ||
      v.notes?.toLowerCase().includes(query)
    )
  })

  const handleCreateSuccess = () => {
    setShowForm(false)
    loadData()
  }

  const violationTypes = [...new Set(violations.map(v => v.violation_type))]

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
        <ViolationForm
          onClose={() => setShowForm(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Violations</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500"
        >
          <AlertTriangle className="h-4 w-4" />
          Issue Violation
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600">Total Violations</p>
                <p className="text-2xl font-bold text-red-700">{stats.total_violations}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-400" />
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600">Total Fines</p>
                <p className="text-2xl font-bold text-green-700">€{stats.total_fines.toFixed(2)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-400" />
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-2">By Type</p>
            <div className="space-y-1">
              {stats.by_type.slice(0, 3).map(item => (
                <div key={item.violation_type} className="flex justify-between text-sm">
                  <span className="text-gray-700 capitalize">{item.violation_type.replace('_', ' ')}</span>
                  <span className="font-medium">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search Input */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by bay ID or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          
          {/* Date Range */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
              className="px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>
          
          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Types</option>
              {violationTypes.map(type => (
                <option key={type} value={type} className="capitalize">
                  {type.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Violations Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Bay
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Issued At
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Fine
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredViolations.map((violation) => (
                <tr key={violation.violation_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-medium text-gray-900">#{violation.violation_id}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={clsx(
                      'px-2 py-1 rounded-full text-xs font-medium capitalize',
                      violation.violation_type === 'overstay' && 'bg-amber-100 text-amber-700',
                      violation.violation_type === 'no_payment' && 'bg-red-100 text-red-700',
                      violation.violation_type === 'double_parking' && 'bg-purple-100 text-purple-700',
                      !['overstay', 'no_payment', 'double_parking'].includes(violation.violation_type) && 'bg-gray-100 text-gray-700',
                    )}>
                      {violation.violation_type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    Bay {violation.bay_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(violation.issued_at), 'MMM d, yyyy HH:mm')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-red-600">
                    €{violation.fine_amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {violation.notes || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredViolations.length === 0 && (
          <div className="text-center py-12">
            <AlertTriangle className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">No violations found</p>
            {searchQuery && (
              <p className="text-xs text-gray-400 mt-1">Try adjusting your search query</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
