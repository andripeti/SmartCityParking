-- Smart City Parking Management System
-- Database Schema with PostGIS

-- ============================================
-- TARIFF SCHEDULE (Non-spatial)
-- ============================================
CREATE TABLE IF NOT EXISTS tariff_schedules (
    tariff_schedule_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    hourly_rate NUMERIC(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    valid_from_time TIME NOT NULL,
    valid_to_time TIME NOT NULL,
    valid_days VARCHAR(50) NOT NULL, -- e.g., 'Mon-Fri', 'Sat-Sun', 'All'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PARKING ZONES (Polygon)
-- ============================================
CREATE TABLE IF NOT EXISTS parking_zones (
    zone_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    zone_type VARCHAR(50) NOT NULL CHECK (zone_type IN ('on_street', 'off_street', 'garage', 'lot')),
    max_duration_minutes INTEGER,
    tariff_schedule_id INTEGER REFERENCES tariff_schedules(tariff_schedule_id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    geom GEOMETRY(Polygon, 4326) NOT NULL
);

CREATE INDEX idx_parking_zones_geom ON parking_zones USING GIST (geom);
CREATE INDEX idx_parking_zones_active ON parking_zones (is_active);
CREATE INDEX idx_parking_zones_type ON parking_zones (zone_type);

-- ============================================
-- PARKING BAYS (Polygon)
-- ============================================
CREATE TABLE IF NOT EXISTS parking_bays (
    bay_id SERIAL PRIMARY KEY,
    zone_id INTEGER NOT NULL REFERENCES parking_zones(zone_id) ON DELETE CASCADE,
    bay_number VARCHAR(50) NOT NULL,
    is_disabled_only BOOLEAN DEFAULT FALSE,
    is_electric BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'closed', 'reserved')),
    last_status_update TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    geom GEOMETRY(Polygon, 4326) NOT NULL
);

CREATE INDEX idx_parking_bays_geom ON parking_bays USING GIST (geom);
CREATE INDEX idx_parking_bays_zone ON parking_bays (zone_id);
CREATE INDEX idx_parking_bays_status ON parking_bays (status);
CREATE INDEX idx_parking_bays_disabled ON parking_bays (is_disabled_only) WHERE is_disabled_only = TRUE;
CREATE INDEX idx_parking_bays_electric ON parking_bays (is_electric) WHERE is_electric = TRUE;

-- ============================================
-- STREET SEGMENTS (LineString)
-- ============================================
CREATE TABLE IF NOT EXISTS street_segments (
    street_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    road_type VARCHAR(50) CHECK (road_type IN ('primary', 'secondary', 'local')),
    speed_limit_kph INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    geom GEOMETRY(LineString, 4326) NOT NULL
);

CREATE INDEX idx_street_segments_geom ON street_segments USING GIST (geom);
CREATE INDEX idx_street_segments_type ON street_segments (road_type);

-- ============================================
-- SENSORS (Point)
-- ============================================
CREATE TABLE IF NOT EXISTS sensors (
    sensor_id SERIAL PRIMARY KEY,
    bay_id INTEGER REFERENCES parking_bays(bay_id) ON DELETE SET NULL,
    sensor_type VARCHAR(50) NOT NULL CHECK (sensor_type IN ('in_ground', 'overhead_camera')),
    installation_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    battery_level_percent INTEGER CHECK (battery_level_percent >= 0 AND battery_level_percent <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    geom GEOMETRY(Point, 4326) NOT NULL
);

CREATE INDEX idx_sensors_geom ON sensors USING GIST (geom);
CREATE INDEX idx_sensors_bay ON sensors (bay_id);
CREATE INDEX idx_sensors_active ON sensors (is_active);

-- ============================================
-- PAYMENT TERMINALS (Point)
-- ============================================
CREATE TABLE IF NOT EXISTS payment_terminals (
    terminal_id SERIAL PRIMARY KEY,
    zone_id INTEGER REFERENCES parking_zones(zone_id) ON DELETE SET NULL,
    terminal_code VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'operational' CHECK (status IN ('operational', 'out_of_service')),
    installation_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    geom GEOMETRY(Point, 4326) NOT NULL
);

CREATE INDEX idx_payment_terminals_geom ON payment_terminals USING GIST (geom);
CREATE INDEX idx_payment_terminals_zone ON payment_terminals (zone_id);
CREATE INDEX idx_payment_terminals_status ON payment_terminals (status);

-- ============================================
-- USERS (Non-spatial)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(50),
    role VARCHAR(20) NOT NULL CHECK (role IN ('driver', 'operator', 'officer', 'admin')),
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_role ON users (role);

-- ============================================
-- VEHICLES (Non-spatial)
-- ============================================
CREATE TABLE IF NOT EXISTS vehicles (
    vehicle_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    license_plate VARCHAR(20) UNIQUE NOT NULL,
    vehicle_type VARCHAR(20) NOT NULL CHECK (vehicle_type IN ('car', 'van', 'motorcycle')),
    color VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vehicles_user ON vehicles (user_id);
CREATE INDEX idx_vehicles_plate ON vehicles (license_plate);

-- ============================================
-- PARKING SESSIONS (Non-spatial, linked)
-- ============================================
CREATE TABLE IF NOT EXISTS parking_sessions (
    session_id SERIAL PRIMARY KEY,
    bay_id INTEGER NOT NULL REFERENCES parking_bays(bay_id),
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(vehicle_id),
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'overstay', 'cancelled')),
    amount_paid NUMERIC(10,2) DEFAULT 0,
    payment_method VARCHAR(20) CHECK (payment_method IN ('card', 'mobile_app', 'cash')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_parking_sessions_bay ON parking_sessions (bay_id);
CREATE INDEX idx_parking_sessions_vehicle ON parking_sessions (vehicle_id);
CREATE INDEX idx_parking_sessions_user ON parking_sessions (user_id);
CREATE INDEX idx_parking_sessions_status ON parking_sessions (status);
CREATE INDEX idx_parking_sessions_time ON parking_sessions (start_time, end_time);

-- ============================================
-- VIOLATIONS (Point)
-- ============================================
CREATE TABLE IF NOT EXISTS violations (
    violation_id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES parking_sessions(session_id) ON DELETE SET NULL,
    bay_id INTEGER NOT NULL REFERENCES parking_bays(bay_id),
    officer_id INTEGER NOT NULL REFERENCES users(user_id),
    violation_type VARCHAR(50) NOT NULL CHECK (violation_type IN ('no_payment', 'overstay', 'wrong_zone')),
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fine_amount NUMERIC(10,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    geom GEOMETRY(Point, 4326) NOT NULL
);

CREATE INDEX idx_violations_geom ON violations USING GIST (geom);
CREATE INDEX idx_violations_bay ON violations (bay_id);
CREATE INDEX idx_violations_officer ON violations (officer_id);
CREATE INDEX idx_violations_session ON violations (session_id);
CREATE INDEX idx_violations_type ON violations (violation_type);
CREATE INDEX idx_violations_issued ON violations (issued_at);

-- ============================================
-- POINTS OF INTEREST (Point) - For accessibility analysis
-- ============================================
CREATE TABLE IF NOT EXISTS points_of_interest (
    poi_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    poi_type VARCHAR(50) NOT NULL,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    geom GEOMETRY(Point, 4326) NOT NULL
);

CREATE INDEX idx_poi_geom ON points_of_interest USING GIST (geom);
CREATE INDEX idx_poi_type ON points_of_interest (poi_type);

-- ============================================
-- SCENARIO RESULTS (For scenario testing)
-- ============================================
CREATE TABLE IF NOT EXISTS scenario_results (
    scenario_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(user_id),
    scenario_data JSONB NOT NULL,
    results JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- UPDATE TIMESTAMP TRIGGER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update triggers to all relevant tables
CREATE TRIGGER update_tariff_schedules_updated_at
    BEFORE UPDATE ON tariff_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_parking_zones_updated_at
    BEFORE UPDATE ON parking_zones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_parking_bays_updated_at
    BEFORE UPDATE ON parking_bays
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_street_segments_updated_at
    BEFORE UPDATE ON street_segments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sensors_updated_at
    BEFORE UPDATE ON sensors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_terminals_updated_at
    BEFORE UPDATE ON payment_terminals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at
    BEFORE UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_parking_sessions_updated_at
    BEFORE UPDATE ON parking_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_violations_updated_at
    BEFORE UPDATE ON violations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Log schema creation
DO $$
BEGIN
    RAISE NOTICE 'Database schema created successfully with all tables and indexes';
END $$;
