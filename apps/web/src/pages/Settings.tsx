import clsx from 'clsx'
import { Bell, Lock, Map, Plus, Settings as SettingsIcon, Trash2, User, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usersApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'

type SettingsTab = 'profile' | 'users' | 'notifications' | 'map' | 'security'

interface SystemUser {
  user_id: number
  email: string
  full_name: string
  role: string
  is_active: boolean
  created_at: string
}

export default function Settings() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [users, setUsers] = useState<SystemUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [showUserForm, setShowUserForm] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', full_name: '', password: '', role: 'driver' })

  const tabs = [
    { id: 'profile', name: 'Profile', icon: User },
    { id: 'users', name: 'Users', icon: Users },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'map', name: 'Map Settings', icon: Map },
    { id: 'security', name: 'Security', icon: Lock },
  ]

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers()
    }
  }, [activeTab])

  const loadUsers = async () => {
    try {
      setLoadingUsers(true)
      const response = await usersApi.getAll()
      setUsers(response.data)
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await usersApi.create(newUser)
      setShowUserForm(false)
      setNewUser({ email: '', full_name: '', password: '', role: 'driver' })
      loadUsers()
    } catch (err) {
      console.error('Failed to create user:', err)
    }
  }

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return
    try {
      await usersApi.delete(userId)
      loadUsers()
    } catch (err) {
      console.error('Failed to delete user:', err)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-6 w-6 text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={clsx(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg',
                  activeTab === tab.id
                    ? 'bg-primary-100 text-primary-900'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <tab.icon className="h-5 w-5" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl shadow-sm p-6">
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">Profile Settings</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Full Name</label>
                    <input
                      type="text"
                      defaultValue={user?.full_name}
                      className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      defaultValue={user?.email}
                      disabled
                      className="mt-1 block w-full rounded-lg border-gray-300 bg-gray-50 shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Role</label>
                    <input
                      type="text"
                      defaultValue={user?.role}
                      disabled
                      className="mt-1 block w-full rounded-lg border-gray-300 bg-gray-50 shadow-sm capitalize"
                    />
                  </div>
                </div>
                <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500">
                  Save Changes
                </button>
              </div>
            )}

            {activeTab === 'users' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
                  <button
                    onClick={() => setShowUserForm(!showUserForm)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500"
                  >
                    <Plus className="h-4 w-4" />
                    Add User
                  </button>
                </div>

                {showUserForm && (
                  <form onSubmit={handleCreateUser} className="p-4 bg-gray-50 rounded-lg space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Full Name</label>
                        <input
                          type="text"
                          value={newUser.full_name}
                          onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                          required
                          className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                          type="email"
                          value={newUser.email}
                          onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                          required
                          className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Password</label>
                        <input
                          type="password"
                          value={newUser.password}
                          onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                          required
                          className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Role</label>
                        <select
                          value={newUser.role}
                          onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                          className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                        >
                          <option value="driver">Driver</option>
                          <option value="operator">Operator</option>
                          <option value="officer">Officer</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500">
                        Create User
                      </button>
                      <button type="button" onClick={() => setShowUserForm(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-100">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {loadingUsers ? (
                  <div className="animate-pulse space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-12 bg-gray-200 rounded" />
                    ))}
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.map((u) => (
                        <tr key={u.user_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{u.full_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                          <td className="px-4 py-3">
                            <span className={clsx(
                              'px-2 py-1 rounded-full text-xs font-medium capitalize',
                              u.role === 'admin' && 'bg-purple-100 text-purple-700',
                              u.role === 'operator' && 'bg-blue-100 text-blue-700',
                              u.role === 'officer' && 'bg-amber-100 text-amber-700',
                              u.role === 'driver' && 'bg-green-100 text-green-700',
                            )}>
                              {u.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={clsx(
                              'px-2 py-1 rounded-full text-xs font-medium',
                              u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            )}>
                              {u.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {u.user_id !== user?.user_id && (
                              <button
                                onClick={() => handleDeleteUser(u.user_id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">Notification Preferences</h2>
                <div className="space-y-4">
                  <label className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-900">Session Reminders</span>
                      <p className="text-sm text-gray-500">Get notified before session expires</p>
                    </div>
                    <input type="checkbox" defaultChecked className="rounded text-primary-600" />
                  </label>
                  <label className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-900">Availability Alerts</span>
                      <p className="text-sm text-gray-500">Notify when parking becomes available</p>
                    </div>
                    <input type="checkbox" defaultChecked className="rounded text-primary-600" />
                  </label>
                  <label className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-900">System Updates</span>
                      <p className="text-sm text-gray-500">Important system announcements</p>
                    </div>
                    <input type="checkbox" className="rounded text-primary-600" />
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'map' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">Map Settings</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Default Zoom Level</label>
                    <input
                      type="range"
                      min="10"
                      max="20"
                      defaultValue="14"
                      className="mt-2 w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Map Style</label>
                    <select className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500">
                      <option>Light</option>
                      <option>Dark</option>
                      <option>Satellite</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="rounded text-primary-600" />
                    <span className="text-gray-700">Show labels</span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">Security Settings</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Current Password</label>
                    <input
                      type="password"
                      className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">New Password</label>
                    <input
                      type="password"
                      className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                    <input
                      type="password"
                      className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    />
                  </div>
                  <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500">
                    Update Password
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
