import clsx from 'clsx'
import {
   Activity,
   AlertTriangle,
   Battery,
   DollarSign,
   ParkingSquare,
   TrendingDown,
   TrendingUp
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { analysisApi } from '../lib/api'
import { DashboardStats } from '../types'

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  color = 'primary' 
}: { 
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  trend?: 'up' | 'down'
  color?: 'primary' | 'green' | 'red' | 'amber'
}) {
  const colorClasses = {
    primary: 'bg-primary-100 text-primary-600',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    amber: 'bg-amber-100 text-amber-600',
  }
  
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        <div className={clsx('p-3 rounded-lg', colorClasses[color])}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center text-sm">
          {trend === 'up' ? (
            <>
              <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
              <span className="text-green-600">Up from yesterday</span>
            </>
          ) : (
            <>
              <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
              <span className="text-red-600">Down from yesterday</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function OccupancyBar({ percent, label }: { percent: number; label: string }) {
  const getColor = (p: number) => {
    if (p < 60) return 'bg-green-500'
    if (p < 85) return 'bg-amber-500'
    return 'bg-red-500'
  }
  
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">{percent.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={clsx('h-full rounded-full transition-all', getColor(percent))}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      setLoading(true)
      const response = await analysisApi.getDashboard()
      setStats(response.data)
    } catch (err) {
      setError('Failed to load dashboard data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error || 'Failed to load dashboard'}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={loadDashboard}
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Bays"
          value={stats.summary.total_bays}
          subtitle={`${stats.summary.available_bays} available`}
          icon={ParkingSquare}
          color="primary"
        />
        <StatCard
          title="Occupancy"
          value={`${stats.summary.overall_occupancy_percent.toFixed(1)}%`}
          subtitle={`${stats.summary.occupied_bays} occupied`}
          icon={Activity}
          color={stats.summary.overall_occupancy_percent > 85 ? 'red' : stats.summary.overall_occupancy_percent > 60 ? 'amber' : 'green'}
        />
        <StatCard
          title="Violations Today"
          value={stats.summary.violations_today}
          subtitle={`€${stats.summary.fines_today.toFixed(2)} in fines`}
          icon={AlertTriangle}
          color="red"
        />
        <StatCard
          title="Active Sessions"
          value={stats.summary.active_sessions}
          icon={DollarSign}
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Zone Occupancy */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Zone Occupancy</h2>
          <div className="space-y-4">
            {stats.zones.map((zone) => (
              <OccupancyBar 
                key={zone.zone_id}
                label={zone.name}
                percent={zone.occupancy_percent}
              />
            ))}
          </div>
        </div>

        {/* Sensor Status */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Sensor Status</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Total Sensors</span>
              <span className="font-semibold">{stats.sensors.total}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <span className="text-green-700">Active</span>
              <span className="font-semibold text-green-700">{stats.sensors.active}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
              <div className="flex items-center gap-2 text-amber-700">
                <Battery className="h-4 w-4" />
                <span>Low Battery</span>
              </div>
              <span className="font-semibold text-amber-700">{stats.sensors.low_battery}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Zone Details Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Zone Details</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Zone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Available
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Occupied
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Occupancy
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.zones.map((zone) => (
                <tr key={zone.zone_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {zone.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                    {zone.zone_type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {zone.total_bays}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-green-600 font-medium">{zone.available_bays}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-red-600 font-medium">{zone.occupied_bays}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className={clsx(
                      'px-2 py-1 rounded-full text-xs font-medium',
                      zone.occupancy_percent > 85 ? 'bg-red-100 text-red-700' :
                      zone.occupancy_percent > 60 ? 'bg-amber-100 text-amber-700' :
                      'bg-green-100 text-green-700'
                    )}>
                      {zone.occupancy_percent.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
