import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    console.debug(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login on auth error
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

// API functions
export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  me: () => api.get("/auth/me"),
};

export const zonesApi = {
  getAll: (params?: { is_active?: boolean; limit?: number }) =>
    api.get("/zones", { params }),
  getGeoJSON: () => api.get("/zones/geojson"),
  getNear: (lat: number, lng: number, radius?: number) =>
    api.get("/zones/near", { params: { lat, lng, radius } }),
  getById: (id: number) => api.get(`/zones/${id}`),
  getOccupancy: (id: number) => api.get(`/zones/${id}/occupancy`),
  create: (data: unknown) => api.post("/zones", data),
  update: (id: number, data: unknown) => api.put(`/zones/${id}`, data),
  delete: (id: number) => api.delete(`/zones/${id}`),
};

export const baysApi = {
  getAll: (params?: {
    zone_id?: number;
    status?: string;
    skip?: number;
    limit?: number;
  }) => api.get("/bays", { params }),
  getGeoJSON: (params?: { zone_id?: number; status?: string }) =>
    api.get("/bays/geojson", { params }),
  getNear: (params: {
    lat: number;
    lng: number;
    radius?: number;
    status?: string;
    is_electric?: boolean;
    is_disabled_only?: boolean;
  }) => api.get("/bays/near", { params }),
  getByStreet: (streetId: number) => api.get(`/bays/by-street/${streetId}`),
  getById: (id: number) => api.get(`/bays/${id}`),
  create: (data: unknown) => api.post("/bays", data),
  update: (id: number, data: unknown) => api.put(`/bays/${id}`, data),
  updateStatus: (id: number, status: string) =>
    api.patch(`/bays/${id}/status`, null, { params: { status } }),
  delete: (id: number) => api.delete(`/bays/${id}`),
};

export const sensorsApi = {
  getAll: (params?: { bay_id?: number; is_active?: boolean }) =>
    api.get("/sensors", { params }),
  getGeoJSON: () => api.get("/sensors/geojson"),
  getLowBattery: (threshold?: number) =>
    api.get("/sensors/low-battery", { params: { threshold } }),
  getById: (id: number) => api.get(`/sensors/${id}`),
  create: (data: unknown) => api.post("/sensors", data),
  update: (id: number, data: unknown) => api.put(`/sensors/${id}`, data),
  delete: (id: number) => api.delete(`/sensors/${id}`),
};

export const terminalsApi = {
  getAll: (params?: { zone_id?: number; status?: string }) =>
    api.get("/terminals", { params }),
  getGeoJSON: () => api.get("/terminals/geojson"),
  getNearest: (lat: number, lng: number) =>
    api.get("/terminals/nearest", { params: { lat, lng } }),
  getById: (id: number) => api.get(`/terminals/${id}`),
  create: (data: unknown) => api.post("/terminals", data),
  update: (id: number, data: unknown) => api.put(`/terminals/${id}`, data),
  delete: (id: number) => api.delete(`/terminals/${id}`),
};

export const sessionsApi = {
  getAll: (params?: {
    bay_id?: number;
    status?: string;
    user_id?: number;
    start_time_from?: string;
    start_time_to?: string;
    limit?: number;
  }) => api.get("/sessions", { params }),
  getActive: () => api.get("/sessions/active"),
  getById: (id: number) => api.get(`/sessions/${id}`),
  start: (data: {
    bay_id: number;
    vehicle_id: number;
    payment_method?: string;
  }) => api.post("/sessions/start", data),
  end: (id: number, data?: { amount_paid?: number }) =>
    api.post(`/sessions/${id}/end`, data ?? undefined),
  cancel: (id: number) => api.post(`/sessions/${id}/cancel`),
  markOverstay: (id: number) => api.post(`/sessions/${id}/overstay`),
};

export const violationsApi = {
  getAll: (params?: {
    bay_id?: number;
    violation_type?: string;
    start_date?: string;
    end_date?: string;
  }) => api.get("/violations", { params }),
  getGeoJSON: (params?: { start_date?: string; end_date?: string }) =>
    api.get("/violations/geojson", { params }),
  search: (data: { polygon: unknown; start_time: string; end_time: string }) =>
    api.post("/violations/search", data),
  getStats: () => api.get("/violations/stats/summary"),
  getById: (id: number) => api.get(`/violations/${id}`),
  create: (data: unknown) => api.post("/violations", data),
  getMy: () => api.get("/violations/my"),
  delete: (id: number) => api.delete(`/violations/${id}`),
};

export const analysisApi = {
  getOccupancyHeatmap: () => api.get("/analysis/occupancy-heatmap"),
  getOccupancyGrid: (gridSize?: number) =>
    api.get("/analysis/occupancy-grid", {
      params: { grid_size_meters: gridSize },
    }),
  getViolationHotspots: (params?: {
    start_time?: string;
    end_time?: string;
    grid_size_meters?: number;
  }) => api.get("/analysis/violation-hotspots", { params }),
  getAccessibility: (lat: number, lng: number, radius?: number) =>
    api.get("/analysis/accessibility", {
      params: { dest_lat: lat, dest_lng: lng, radius_meters: radius },
    }),
  getPOIs: (poiType?: string) =>
    api.get("/analysis/pois", { params: { poi_type: poiType } }),
  runScenario: (data: unknown) => api.post("/analysis/scenario", data),
  getDashboard: () => api.get("/analysis/dashboard"),
};

export const streetsApi = {
  getAll: () => api.get("/streets"),
  getGeoJSON: () => api.get("/streets/geojson"),
  getById: (id: number) => api.get(`/streets/${id}`),
};

export const vehiclesApi = {
  getByUser: (userId: number) => api.get(`/users/${userId}/vehicles`),
  getById: (id: number) => api.get(`/vehicles/${id}`),
  create: (data: {
    user_id: number;
    license_plate: string;
    vehicle_type: string;
    color?: string;
  }) => api.post("/vehicles/", data),
  update: (
    id: number,
    data: Partial<{
      license_plate: string;
      vehicle_type: string;
      color: string;
    }>,
  ) => api.put(`/vehicles/${id}`, data),
  delete: (id: number) => api.delete(`/vehicles/${id}`),
};

export const usersApi = {
  getAll: () => api.get("/users"),
  getById: (id: number) => api.get(`/users/${id}`),
  create: (data: unknown) => api.post("/users", data),
  update: (id: number, data: unknown) => api.put(`/users/${id}`, data),
  delete: (id: number) => api.delete(`/users/${id}`),
};
