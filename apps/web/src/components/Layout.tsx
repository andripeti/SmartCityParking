import clsx from 'clsx'
import {
    AlertTriangle,
    BarChart3,
    Car,
    Clock,
    ExternalLink,
    LayoutDashboard,
    LogOut,
    Map,
    MapPin,
    Menu,
    ParkingSquare,
    Settings,
    X
} from 'lucide-react'
import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['operator', 'officer', 'admin'] },
  { name: 'Map', href: '/map', icon: Map, roles: ['operator', 'officer', 'admin'] },
  { name: 'Zones', href: '/zones', icon: MapPin, roles: ['operator', 'admin'] },
  { name: 'Bays', href: '/bays', icon: ParkingSquare, roles: ['operator', 'admin'] },
  { name: 'Sessions', href: '/sessions', icon: Clock, roles: ['operator', 'officer', 'admin'] },
  { name: 'Violations', href: '/violations', icon: AlertTriangle, roles: ['officer', 'admin'] },
  { name: 'Analysis', href: '/analysis', icon: BarChart3, roles: ['operator', 'admin'] },
  { name: 'Settings', href: '/settings', icon: Settings, roles: ['admin'] },
]

export default function Layout() {
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  const filteredNav = navigation.filter(
    (item) => !user || item.roles.includes(user.role)
  )
  
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile sidebar */}
      <div className={clsx(
        'fixed inset-0 z-50 lg:hidden',
        sidebarOpen ? 'block' : 'hidden'
      )}>
        <div 
          className="fixed inset-0 bg-gray-600 bg-opacity-75"
          onClick={() => setSidebarOpen(false)}
        />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white">
          <div className="flex h-16 items-center justify-between px-4 border-b">
            <span className="text-xl font-bold text-primary-600">Smart Parking</span>
            <button onClick={() => setSidebarOpen(false)}>
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            {filteredNav.map((item) => {
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={clsx(
                    'group flex items-center px-2 py-2 text-sm font-medium rounded-md',
                    isActive
                      ? 'bg-primary-100 text-primary-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon
                    className={clsx(
                      'mr-3 h-5 w-5 flex-shrink-0',
                      isActive ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'
                    )}
                  />
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex min-h-0 flex-1 flex-col border-r border-gray-200 bg-white">
          <div className="flex h-16 items-center px-4 border-b">
            <span className="text-xl font-bold text-primary-600">Smart Parking</span>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto">
            {filteredNav.map((item) => {
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={clsx(
                    'group flex items-center px-2 py-2 text-sm font-medium rounded-md',
                    isActive
                      ? 'bg-primary-100 text-primary-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <item.icon
                    className={clsx(
                      'mr-3 h-5 w-5 flex-shrink-0',
                      isActive ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'
                    )}
                  />
                  {item.name}
                </Link>
              )
            })}
          </nav>
          
          {/* Driver Mode Link */}
          <div className="px-2 py-4 border-t border-gray-200">
            <Link
              to="/find-parking"
              className="group flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            >
              <Car className="mr-3 h-5 w-5 flex-shrink-0 text-gray-400 group-hover:text-gray-500" />
              Public Parking Finder
              <ExternalLink className="ml-auto h-4 w-4 text-gray-400" />
            </Link>
            {user?.role === 'admin' && (
              <Link
                to="/driver"
                className="group flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              >
                <Car className="mr-3 h-5 w-5 flex-shrink-0 text-gray-400 group-hover:text-gray-500" />
                Driver Mode
                <ExternalLink className="ml-auto h-4 w-4 text-gray-400" />
              </Link>
            )}
          </div>
          
          <div className="flex flex-shrink-0 border-t border-gray-200 p-4">
            <div className="flex items-center w-full">
              <div className="flex-shrink-0">
                <div className="h-9 w-9 rounded-full bg-primary-500 flex items-center justify-center text-white font-medium">
                  {user?.full_name?.charAt(0) || 'U'}
                </div>
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">
                  {user?.full_name}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {user?.role}
                </p>
              </div>
              <button
                onClick={logout}
                className="ml-2 p-1.5 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
                title="Sign out"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm lg:hidden">
          <button
            type="button"
            className="text-gray-700"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="text-lg font-semibold text-primary-600">Smart Parking</span>
        </div>
        
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
