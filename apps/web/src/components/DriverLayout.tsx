import clsx from 'clsx'
import {
    Car,
    History,
    Home,
    LogOut,
    Menu,
    Navigation2,
    User,
    X
} from 'lucide-react'
import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const navigation = [
  { name: 'Dashboard', href: '/driver', icon: Home },
  { name: 'Find Parking', href: '/find-parking', icon: Navigation2 },
  { name: 'My Vehicles', href: '/driver/vehicles', icon: Car },
  { name: 'History', href: '/driver/history', icon: History },
]

export default function DriverLayout() {
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Logo & Desktop Nav */}
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Link to="/driver" className="flex items-center gap-2">
                  <Car className="h-8 w-8 text-primary-600" />
                  <span className="text-xl font-bold text-gray-900">Smart Parking</span>
                </Link>
              </div>
              
              {/* Desktop Navigation */}
              <div className="hidden sm:ml-8 sm:flex sm:space-x-4">
                {navigation.map((item) => {
                  const isActive = location.pathname === item.href || 
                    (item.href !== '/driver' && location.pathname.startsWith(item.href))
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={clsx(
                        'inline-flex items-center px-3 py-2 text-sm font-medium rounded-md',
                        isActive
                          ? 'text-primary-700 bg-primary-50'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      )}
                    >
                      <item.icon className="h-4 w-4 mr-1.5" />
                      {item.name}
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* User Menu */}
            <div className="flex items-center">
              {/* Admin link for admin users */}
              {user?.role === 'admin' && (
                <Link
                  to="/"
                  className="hidden sm:flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 mr-2"
                >
                  Admin Panel
                </Link>
              )}
              
              <div className="hidden sm:flex items-center gap-3 border-l pl-4 ml-4">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
                  <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
                </div>
                <div className="h-9 w-9 rounded-full bg-primary-500 flex items-center justify-center text-white font-medium">
                  {user?.full_name?.charAt(0) || 'U'}
                </div>
                <button
                  onClick={logout}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
                  title="Sign out"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>

              {/* Mobile menu button */}
              <button
                type="button"
                className="sm:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t">
            <div className="pt-2 pb-3 space-y-1">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={clsx(
                      'flex items-center px-4 py-2 text-base font-medium',
                      isActive
                        ? 'text-primary-700 bg-primary-50 border-l-4 border-primary-500'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <item.icon className="h-5 w-5 mr-3" />
                    {item.name}
                  </Link>
                )
              })}
            </div>
            <div className="pt-4 pb-3 border-t border-gray-200">
              <div className="flex items-center px-4">
                <div className="h-10 w-10 rounded-full bg-primary-500 flex items-center justify-center text-white font-medium">
                  {user?.full_name?.charAt(0) || 'U'}
                </div>
                <div className="ml-3">
                  <p className="text-base font-medium text-gray-800">{user?.full_name}</p>
                  <p className="text-sm text-gray-500 capitalize">{user?.role}</p>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                {user?.role === 'admin' && (
                  <Link
                    to="/"
                    className="flex items-center px-4 py-2 text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <User className="h-5 w-5 mr-3" />
                    Admin Panel
                  </Link>
                )}
                <button
                  onClick={() => {
                    logout()
                    setMobileMenuOpen(false)
                  }}
                  className="flex items-center w-full px-4 py-2 text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                >
                  <LogOut className="h-5 w-5 mr-3" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main>
        <Outlet />
      </main>
    </div>
  )
}
