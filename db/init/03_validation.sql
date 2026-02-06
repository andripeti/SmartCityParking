-- Spatial Validation Functions and Triggers
-- These ensure spatial integrity constraints are maintained
-- GEOMETRY TYPE REQUIREMENTS (per PDF specification):
--   ParkingZone.geom = Polygon
--   ParkingBay.geom = Polygon
--   StreetSegment.geom = LineString
--   Sensor.geom = Point
--   PaymentTerminal.geom = Point
--   Violation.geom = Point

-- ============================================
-- VALIDATE BAY GEOMETRY TYPE
-- Ensures parking bay geometry is a Polygon
-- ============================================
CREATE OR REPLACE FUNCTION validate_bay_geometry_type()
RETURNS TRIGGER AS $$
BEGIN
    IF GeometryType(NEW.geom) != 'POLYGON' THEN
        RAISE EXCEPTION 'ParkingBay geometry must be POLYGON, got: %', GeometryType(NEW.geom);
    END IF;
    
    IF ST_SRID(NEW.geom) != 4326 THEN
        RAISE EXCEPTION 'ParkingBay geometry must have SRID 4326, got: %', ST_SRID(NEW.geom);
    END IF;
    
    IF NOT ST_IsValid(NEW.geom) THEN
        RAISE EXCEPTION 'ParkingBay geometry is not valid';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_bay_geometry_type_trigger ON parking_bays;
CREATE TRIGGER validate_bay_geometry_type_trigger
    BEFORE INSERT OR UPDATE OF geom ON parking_bays
    FOR EACH ROW EXECUTE FUNCTION validate_bay_geometry_type();

-- ============================================
-- VALIDATE BAY WITHIN ZONE
-- Ensures parking bays are spatially contained within their parent zone
-- ============================================
CREATE OR REPLACE FUNCTION validate_bay_within_zone()
RETURNS TRIGGER AS $$
DECLARE
    zone_geom GEOMETRY;
    zone_name VARCHAR;
BEGIN
    -- Get the zone geometry
    SELECT geom, name INTO zone_geom, zone_name 
    FROM parking_zones WHERE zone_id = NEW.zone_id;
    
    IF zone_geom IS NULL THEN
        RAISE EXCEPTION 'Zone with id % does not exist', NEW.zone_id;
    END IF;
    
    -- Check if bay is contained within zone (use ST_Within or ST_Intersects with high overlap)
    -- ST_Contains is strict, using ST_Within for the bay's perspective
    IF NOT ST_Within(NEW.geom, zone_geom) THEN
        -- Check if at least 90% of the bay is within the zone (for edge cases)
        IF ST_Area(ST_Intersection(NEW.geom, zone_geom)) / ST_Area(NEW.geom) < 0.9 THEN
            RAISE EXCEPTION 'Parking bay geometry must be contained within its parent zone "%" (zone_id: %). Bay overlaps zone by less than 90%%', 
                zone_name, NEW.zone_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_bay_within_zone_trigger ON parking_bays;
CREATE TRIGGER validate_bay_within_zone_trigger
    BEFORE INSERT OR UPDATE OF geom, zone_id ON parking_bays
    FOR EACH ROW EXECUTE FUNCTION validate_bay_within_zone();

-- ============================================
-- VALIDATE SENSOR GEOMETRY TYPE AND NEAR BAY
-- Ensures sensor is a Point and within threshold distance of associated bay
-- ============================================
CREATE OR REPLACE FUNCTION validate_sensor_geometry_type()
RETURNS TRIGGER AS $$
BEGIN
    IF GeometryType(NEW.geom) != 'POINT' THEN
        RAISE EXCEPTION 'Sensor geometry must be POINT, got: %', GeometryType(NEW.geom);
    END IF;
    
    IF ST_SRID(NEW.geom) != 4326 THEN
        RAISE EXCEPTION 'Sensor geometry must have SRID 4326, got: %', ST_SRID(NEW.geom);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_sensor_geometry_type_trigger ON sensors;
CREATE TRIGGER validate_sensor_geometry_type_trigger
    BEFORE INSERT OR UPDATE OF geom ON sensors
    FOR EACH ROW EXECUTE FUNCTION validate_sensor_geometry_type();

CREATE OR REPLACE FUNCTION validate_sensor_near_bay()
RETURNS TRIGGER AS $$
DECLARE
    bay_geom GEOMETRY;
    distance_meters FLOAT;
    threshold_meters FLOAT := 3.0; -- 3 meter threshold per PDF specification
BEGIN
    -- Skip validation if bay_id is null
    IF NEW.bay_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Get the bay geometry
    SELECT geom INTO bay_geom FROM parking_bays WHERE bay_id = NEW.bay_id;
    
    IF bay_geom IS NULL THEN
        RAISE EXCEPTION 'Bay with id % does not exist', NEW.bay_id;
    END IF;
    
    -- Check if sensor is within or very close to the bay
    -- First check if point is inside the bay polygon
    IF ST_Within(NEW.geom, bay_geom) THEN
        RETURN NEW;
    END IF;
    
    -- Calculate distance using geography for accurate meters
    distance_meters := ST_Distance(
        NEW.geom::geography,
        bay_geom::geography
    );
    
    -- Check if sensor is within threshold of bay boundary
    IF distance_meters > threshold_meters THEN
        RAISE EXCEPTION 'Sensor must be within % meters of its associated bay (current distance: % meters)', 
            threshold_meters, ROUND(distance_meters::numeric, 2);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_sensor_near_bay_trigger ON sensors;
CREATE TRIGGER validate_sensor_near_bay_trigger
    BEFORE INSERT OR UPDATE OF geom, bay_id ON sensors
    FOR EACH ROW EXECUTE FUNCTION validate_sensor_near_bay();

-- ============================================
-- VALIDATE VIOLATION GEOMETRY TYPE AND INSIDE BAY
-- Ensures violation is a Point and inside the relevant bay polygon
-- ============================================
CREATE OR REPLACE FUNCTION validate_violation_geometry_type()
RETURNS TRIGGER AS $$
BEGIN
    IF GeometryType(NEW.geom) != 'POINT' THEN
        RAISE EXCEPTION 'Violation geometry must be POINT, got: %', GeometryType(NEW.geom);
    END IF;
    
    IF ST_SRID(NEW.geom) != 4326 THEN
        RAISE EXCEPTION 'Violation geometry must have SRID 4326, got: %', ST_SRID(NEW.geom);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_violation_geometry_type_trigger ON violations;
CREATE TRIGGER validate_violation_geometry_type_trigger
    BEFORE INSERT OR UPDATE OF geom ON violations
    FOR EACH ROW EXECUTE FUNCTION validate_violation_geometry_type();

CREATE OR REPLACE FUNCTION validate_violation_inside_bay()
RETURNS TRIGGER AS $$
DECLARE
    v_bay_geom GEOMETRY;
    v_bay_number VARCHAR;
BEGIN
    -- Get the bay geometry and number
    SELECT geom, parking_bays.bay_number INTO v_bay_geom, v_bay_number FROM parking_bays WHERE bay_id = NEW.bay_id;
    
    IF v_bay_geom IS NULL THEN
        RAISE EXCEPTION 'Bay with id % does not exist', NEW.bay_id;
    END IF;
    
    -- Check if violation point is inside bay polygon
    IF ST_Contains(v_bay_geom, NEW.geom) THEN
        RETURN NEW;
    END IF;
    
    -- Allow small tolerance (2m) for edge cases (GPS error, etc.)
    IF ST_DWithin(NEW.geom::geography, v_bay_geom::geography, 2.0) THEN
        RETURN NEW;
    END IF;
    
    RAISE EXCEPTION 'Violation point must be inside parking bay "%" (bay_id: %)', v_bay_number, NEW.bay_id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_violation_inside_bay_trigger ON violations;
CREATE TRIGGER validate_violation_inside_bay_trigger
    BEFORE INSERT OR UPDATE OF geom, bay_id ON violations
    FOR EACH ROW EXECUTE FUNCTION validate_violation_inside_bay();

-- ============================================
-- VALIDATE ZONE GEOMETRY TYPE
-- Ensures parking zone geometry is a Polygon
-- ============================================
CREATE OR REPLACE FUNCTION validate_zone_geometry_type()
RETURNS TRIGGER AS $$
BEGIN
    IF GeometryType(NEW.geom) != 'POLYGON' THEN
        RAISE EXCEPTION 'ParkingZone geometry must be POLYGON, got: %', GeometryType(NEW.geom);
    END IF;
    
    IF ST_SRID(NEW.geom) != 4326 THEN
        RAISE EXCEPTION 'ParkingZone geometry must have SRID 4326, got: %', ST_SRID(NEW.geom);
    END IF;
    
    IF NOT ST_IsValid(NEW.geom) THEN
        RAISE EXCEPTION 'ParkingZone geometry is not valid';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_zone_geometry_type_trigger ON parking_zones;
CREATE TRIGGER validate_zone_geometry_type_trigger
    BEFORE INSERT OR UPDATE OF geom ON parking_zones
    FOR EACH ROW EXECUTE FUNCTION validate_zone_geometry_type();

-- ============================================
-- VALIDATE STREET SEGMENT GEOMETRY TYPE
-- Ensures street segment geometry is a LineString
-- ============================================
CREATE OR REPLACE FUNCTION validate_street_geometry_type()
RETURNS TRIGGER AS $$
BEGIN
    IF GeometryType(NEW.geom) != 'LINESTRING' THEN
        RAISE EXCEPTION 'StreetSegment geometry must be LINESTRING, got: %', GeometryType(NEW.geom);
    END IF;
    
    IF ST_SRID(NEW.geom) != 4326 THEN
        RAISE EXCEPTION 'StreetSegment geometry must have SRID 4326, got: %', ST_SRID(NEW.geom);
    END IF;
    
    IF NOT ST_IsValid(NEW.geom) THEN
        RAISE EXCEPTION 'StreetSegment geometry is not valid';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_street_geometry_type_trigger ON street_segments;
CREATE TRIGGER validate_street_geometry_type_trigger
    BEFORE INSERT OR UPDATE OF geom ON street_segments
    FOR EACH ROW EXECUTE FUNCTION validate_street_geometry_type();

-- ============================================
-- VALIDATE PAYMENT TERMINAL GEOMETRY TYPE
-- Ensures payment terminal geometry is a Point
-- ============================================
CREATE OR REPLACE FUNCTION validate_terminal_geometry_type()
RETURNS TRIGGER AS $$
BEGIN
    IF GeometryType(NEW.geom) != 'POINT' THEN
        RAISE EXCEPTION 'PaymentTerminal geometry must be POINT, got: %', GeometryType(NEW.geom);
    END IF;
    
    IF ST_SRID(NEW.geom) != 4326 THEN
        RAISE EXCEPTION 'PaymentTerminal geometry must have SRID 4326, got: %', ST_SRID(NEW.geom);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_terminal_geometry_type_trigger ON payment_terminals;
CREATE TRIGGER validate_terminal_geometry_type_trigger
    BEFORE INSERT OR UPDATE OF geom ON payment_terminals
    FOR EACH ROW EXECUTE FUNCTION validate_terminal_geometry_type();

CREATE TRIGGER validate_violation_inside_bay_trigger
    BEFORE INSERT OR UPDATE OF geom, bay_id ON violations
    FOR EACH ROW EXECUTE FUNCTION validate_violation_inside_bay();

-- ============================================
-- UPDATE BAY STATUS ON SESSION CHANGES
-- Automatically updates bay status based on session state
-- ============================================
CREATE OR REPLACE FUNCTION update_bay_status_on_session()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- New session started - mark bay as occupied
        IF NEW.status = 'active' THEN
            UPDATE parking_bays 
            SET status = 'occupied', last_status_update = CURRENT_TIMESTAMP
            WHERE bay_id = NEW.bay_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Session ended or completed - mark bay as available
        IF NEW.status IN ('completed', 'cancelled') AND OLD.status = 'active' THEN
            UPDATE parking_bays 
            SET status = 'available', last_status_update = CURRENT_TIMESTAMP
            WHERE bay_id = NEW.bay_id;
        -- Session marked as overstay
        ELSIF NEW.status = 'overstay' AND OLD.status = 'active' THEN
            UPDATE parking_bays 
            SET status = 'occupied', last_status_update = CURRENT_TIMESTAMP
            WHERE bay_id = NEW.bay_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bay_status_trigger
    AFTER INSERT OR UPDATE OF status ON parking_sessions
    FOR EACH ROW EXECUTE FUNCTION update_bay_status_on_session();

-- ============================================
-- VALIDATE OFFICER ROLE FOR VIOLATIONS
-- Ensures only users with 'officer' role can create violations
-- ============================================
CREATE OR REPLACE FUNCTION validate_officer_role()
RETURNS TRIGGER AS $$
DECLARE
    user_role VARCHAR(20);
BEGIN
    SELECT role INTO user_role FROM users WHERE user_id = NEW.officer_id;
    
    IF user_role IS NULL THEN
        RAISE EXCEPTION 'User with id % does not exist', NEW.officer_id;
    END IF;
    
    IF user_role != 'officer' AND user_role != 'admin' THEN
        RAISE EXCEPTION 'Only officers or admins can issue violations (user role: %)', user_role;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_officer_role_trigger
    BEFORE INSERT OR UPDATE OF officer_id ON violations
    FOR EACH ROW EXECUTE FUNCTION validate_officer_role();

-- ============================================
-- HELPER FUNCTIONS FOR SPATIAL QUERIES
-- ============================================

-- Find available bays within radius of a point (in meters)
CREATE OR REPLACE FUNCTION find_available_bays_near(
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION DEFAULT 300
)
RETURNS TABLE (
    bay_id INTEGER,
    bay_number VARCHAR,
    zone_id INTEGER,
    zone_name VARCHAR,
    status VARCHAR,
    is_disabled_only BOOLEAN,
    is_electric BOOLEAN,
    distance_meters DOUBLE PRECISION,
    geojson JSON
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pb.bay_id,
        pb.bay_number,
        pb.zone_id,
        pz.name as zone_name,
        pb.status,
        pb.is_disabled_only,
        pb.is_electric,
        ST_Distance(
            pb.geom::geography,
            ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
        ) as distance_meters,
        json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(pb.geom)::json,
            'properties', json_build_object(
                'bay_id', pb.bay_id,
                'bay_number', pb.bay_number,
                'zone_id', pb.zone_id,
                'zone_name', pz.name,
                'status', pb.status,
                'is_disabled_only', pb.is_disabled_only,
                'is_electric', pb.is_electric
            )
        ) as geojson
    FROM parking_bays pb
    JOIN parking_zones pz ON pb.zone_id = pz.zone_id
    WHERE pb.status = 'available'
      AND pz.is_active = true
      AND ST_DWithin(
          pb.geom::geography,
          ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
          radius_meters
      )
    ORDER BY distance_meters;
END;
$$ LANGUAGE plpgsql;

-- Find zones within radius of a point (in meters)
CREATE OR REPLACE FUNCTION find_zones_near(
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION DEFAULT 500
)
RETURNS TABLE (
    zone_id INTEGER,
    name VARCHAR,
    zone_type VARCHAR,
    max_duration_minutes INTEGER,
    tariff_schedule_id INTEGER,
    distance_meters DOUBLE PRECISION,
    geojson JSON
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pz.zone_id,
        pz.name,
        pz.zone_type,
        pz.max_duration_minutes,
        pz.tariff_schedule_id,
        ST_Distance(
            pz.geom::geography,
            ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
        ) as distance_meters,
        json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(pz.geom)::json,
            'properties', json_build_object(
                'zone_id', pz.zone_id,
                'name', pz.name,
                'zone_type', pz.zone_type,
                'max_duration_minutes', pz.max_duration_minutes
            )
        ) as geojson
    FROM parking_zones pz
    WHERE pz.is_active = true
      AND ST_DWithin(
          pz.geom::geography,
          ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
          radius_meters
      )
    ORDER BY distance_meters;
END;
$$ LANGUAGE plpgsql;

-- Find violations within a polygon during a time window
CREATE OR REPLACE FUNCTION find_violations_in_area(
    polygon_geojson TEXT,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
    violation_id INTEGER,
    violation_type VARCHAR,
    bay_id INTEGER,
    officer_id INTEGER,
    fine_amount NUMERIC,
    issued_at TIMESTAMP WITH TIME ZONE,
    geojson JSON
) AS $$
DECLARE
    search_polygon GEOMETRY;
BEGIN
    -- Parse the GeoJSON polygon
    search_polygon := ST_SetSRID(ST_GeomFromGeoJSON(polygon_geojson), 4326);
    
    RETURN QUERY
    SELECT 
        v.violation_id,
        v.violation_type,
        v.bay_id,
        v.officer_id,
        v.fine_amount,
        v.issued_at,
        json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(v.geom)::json,
            'properties', json_build_object(
                'violation_id', v.violation_id,
                'violation_type', v.violation_type,
                'bay_id', v.bay_id,
                'fine_amount', v.fine_amount,
                'issued_at', v.issued_at
            )
        ) as geojson
    FROM violations v
    WHERE ST_Contains(search_polygon, v.geom)
      AND v.issued_at >= start_time
      AND v.issued_at <= end_time
    ORDER BY v.issued_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Calculate zone occupancy
CREATE OR REPLACE FUNCTION calculate_zone_occupancy(p_zone_id INTEGER)
RETURNS TABLE (
    total_bays BIGINT,
    available_bays BIGINT,
    occupied_bays BIGINT,
    reserved_bays BIGINT,
    closed_bays BIGINT,
    occupancy_percent NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as total_bays,
        COUNT(*) FILTER (WHERE pb.status = 'available') as available_bays,
        COUNT(*) FILTER (WHERE pb.status = 'occupied') as occupied_bays,
        COUNT(*) FILTER (WHERE pb.status = 'reserved') as reserved_bays,
        COUNT(*) FILTER (WHERE pb.status = 'closed') as closed_bays,
        CASE 
            WHEN COUNT(*) FILTER (WHERE pb.status != 'closed') > 0 THEN
                ROUND(
                    (COUNT(*) FILTER (WHERE pb.status = 'occupied')::NUMERIC / 
                     COUNT(*) FILTER (WHERE pb.status != 'closed')::NUMERIC) * 100,
                    2
                )
            ELSE 0
        END as occupancy_percent
    FROM parking_bays pb
    WHERE pb.zone_id = p_zone_id;
END;
$$ LANGUAGE plpgsql;

-- Log validation functions creation
DO $$
BEGIN
    RAISE NOTICE 'Spatial validation functions and triggers created successfully';
END $$;
