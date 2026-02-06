import { Navigate, Route, Routes } from 'react-router-dom'
import DriverLayout from './components/DriverLayout'
import Layout from './components/Layout'
import Analysis from './pages/Analysis'
import Bays from './pages/Bays'
import Dashboard from './pages/Dashboard'
import DriverDashboard from './pages/DriverDashboard'
import DriverHistory from './pages/DriverHistory'
import DriverVehicles from './pages/DriverVehicles'
import FindParking from './pages/FindParking'
import Login from './pages/Login'
import MapView from './pages/MapView'
import Sessions from './pages/Sessions'
import Settings from './pages/Settings'
import StartSession from './pages/StartSession'
import Violations from './pages/Violations'
import Zones from './pages/Zones'
import { useAuthStore } from './store/authStore'

// Protected route wrapper - requires authentication
function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { isAuthenticated, user } = useAuthStore()
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Redirect to appropriate dashboard based on role
    if (user.role === 'driver') {
      return <Navigate to="/driver" replace />
    }
    return <Navigate to="/" replace />
  }
  
  return <>{children}</>
}

// Driver protected route - requires driver or admin role
function DriverRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore()
  
  if (!isAuthenticated) {
    return <Navigate to="/login?redirect=/driver" replace />
  }
  
  if (user && !['driver', 'admin'].includes(user.role)) {
    return <Navigate to="/" replace />
  }
  
  return <>{children}</>
}

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/find-parking" element={<FindParking />} />
      
      {/* Driver routes (requires driver or admin role) */}
      <Route
        path="/driver"
        element={
          <DriverRoute>
            <DriverLayout />
          </DriverRoute>
        }
      >
        <Route index element={<DriverDashboard />} />
        <Route path="vehicles" element={<DriverVehicles />} />
        <Route path="history" element={<DriverHistory />} />
        <Route path="start-session/:bayId" element={<StartSession />} />
      </Route>
      
      {/* Staff routes (operator, officer, admin) */}
      <Route
        path="/"
        element={
          <ProtectedRoute allowedRoles={['operator', 'officer', 'admin']}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="map" element={<MapView />} />
        <Route path="zones" element={
          <ProtectedRoute allowedRoles={['operator', 'admin']}>
            <Zones />
          </ProtectedRoute>
        } />
        <Route path="bays" element={
          <ProtectedRoute allowedRoles={['operator', 'admin']}>
            <Bays />
          </ProtectedRoute>
        } />
        <Route path="sessions" element={<Sessions />} />
        <Route path="violations" element={
          <ProtectedRoute allowedRoles={['officer', 'admin']}>
            <Violations />
          </ProtectedRoute>
        } />
        <Route path="analysis" element={
          <ProtectedRoute allowedRoles={['operator', 'admin']}>
            <Analysis />
          </ProtectedRoute>
        } />
        <Route path="settings" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Settings />
          </ProtectedRoute>
        } />
      </Route>
    </Routes>
  )
}

export default App
