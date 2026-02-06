export interface GeoJSONPoint {
  type: "Point";
  coordinates: [number, number];
}

export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface GeoJSONLineString {
  type: "LineString";
  coordinates: number[][];
}

export interface GeoJSONFeature<
  G = GeoJSONPoint | GeoJSONPolygon | GeoJSONLineString,
  P = Record<string, unknown>,
> {
  type: "Feature";
  geometry: G;
  properties: P;
}

export interface GeoJSONFeatureCollection<
  G = GeoJSONPoint | GeoJSONPolygon | GeoJSONLineString,
  P = Record<string, unknown>,
> {
  type: "FeatureCollection";
  features: GeoJSONFeature<G, P>[];
}

export interface ParkingZone {
  zone_id: number;
  name: string;
  zone_type: string;
  max_duration_minutes?: number;
  tariff_schedule_id?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  geom: GeoJSONPolygon;
}

export interface ParkingBay {
  bay_id: number;
  zone_id: number;
  bay_number: string;
  is_disabled_only: boolean;
  is_electric: boolean;
  status: "available" | "occupied" | "reserved" | "closed";
  last_status_update?: string;
  created_at: string;
  updated_at: string;
  geom: GeoJSONPoint | GeoJSONPolygon;
}

export interface Sensor {
  sensor_id: number;
  bay_id?: number;
  sensor_type: string;
  installation_date?: string;
  is_active: boolean;
  battery_level_percent?: number;
  created_at: string;
  updated_at: string;
  geom: GeoJSONPoint;
}

export interface PaymentTerminal {
  terminal_id: number;
  zone_id?: number;
  terminal_code: string;
  status: string;
  installation_date?: string;
  created_at: string;
  updated_at: string;
  geom: GeoJSONPoint;
}

export interface Violation {
  violation_id: number;
  session_id?: number;
  bay_id: number;
  bay_number?: string;
  officer_id: number;
  officer_name?: string;
  violation_type: string;
  issued_at: string;
  fine_amount: number;
  notes?: string;
  created_at: string;
  geom: GeoJSONPoint;
}

export interface ZoneOccupancy {
  zone_id: number;
  zone_name: string;
  total_bays: number;
  available_bays: number;
  occupied_bays: number;
  reserved_bays: number;
  closed_bays: number;
  occupancy_percent: number;
}

export interface DashboardStats {
  summary: {
    total_bays: number;
    available_bays: number;
    occupied_bays: number;
    overall_occupancy_percent: number;
    active_sessions: number;
    violations_today: number;
    fines_today: number;
  };
  sensors: {
    total: number;
    active: number;
    low_battery: number;
  };
  zones: Array<{
    zone_id: number;
    name: string;
    zone_type: string;
    total_bays: number;
    available_bays: number;
    occupied_bays: number;
    occupancy_percent: number;
  }>;
}

export interface User {
  user_id: number;
  full_name: string;
  email: string;
  phone_number?: string;
  role: "driver" | "operator" | "officer" | "admin";
  is_active: boolean;
  created_at: string;
}

export interface Vehicle {
  vehicle_id: number;
  user_id: number;
  license_plate: string;
  type: string;
  is_ev: boolean;
  is_default: boolean;
  created_at: string;
}

export interface ParkingSession {
  session_id: number;
  bay_id: number;
  vehicle_id: number;
  user_id: number;
  start_time: string;
  end_time?: string;
  status: "active" | "completed" | "overstay" | "cancelled";
  amount_due?: number;
  amount_paid: number;
  payment_method?: string;
  payment_status?: string;
  created_at: string;
  vehicle?: Vehicle;
}

export interface TariffSchedule {
  schedule_id: number;
  name: string;
  hourly_rate: number;
  daily_max?: number;
  free_minutes?: number;
  is_active: boolean;
}

export interface Zone extends ParkingZone {
  tariff?: TariffSchedule;
}

export interface Bay extends ParkingBay {
  zone_name?: string;
  distance_meters?: number;
}
