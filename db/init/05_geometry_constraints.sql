-- ============================================
-- GEOMETRY TYPE CONSTRAINTS AND VALIDATION
-- Enforces strict geometry types as per PDF specification
-- ============================================

-- Configuration: Get SRID from environment or use default
DO $$
DECLARE
    target_srid INTEGER := COALESCE(current_setting('app.srid', true)::INTEGER, 4326);
BEGIN
    RAISE NOTICE 'Using SRID: %', target_srid;
END $$;

-- ============================================
-- GEOMETRY TYPE CHECK CONSTRAINTS
-- ============================================

-- ParkingZone: Must be Polygon with correct SRID
ALTER TABLE parking_zones DROP CONSTRAINT IF EXISTS chk_parking_zones_geom_type;
ALTER TABLE parking_zones ADD CONSTRAINT chk_parking_zones_geom_type
    CHECK (GeometryType(geom) = 'POLYGON');

ALTER TABLE parking_zones DROP CONSTRAINT IF EXISTS chk_parking_zones_geom_srid;
ALTER TABLE parking_zones ADD CONSTRAINT chk_parking_zones_geom_srid
    CHECK (ST_SRID(geom) = 4326);

-- ParkingBay: Must be Polygon with correct SRID
ALTER TABLE parking_bays DROP CONSTRAINT IF EXISTS chk_parking_bays_geom_type;
ALTER TABLE parking_bays ADD CONSTRAINT chk_parking_bays_geom_type
    CHECK (GeometryType(geom) = 'POLYGON');

ALTER TABLE parking_bays DROP CONSTRAINT IF EXISTS chk_parking_bays_geom_srid;
ALTER TABLE parking_bays ADD CONSTRAINT chk_parking_bays_geom_srid
    CHECK (ST_SRID(geom) = 4326);

-- StreetSegment: Must be LineString with correct SRID
ALTER TABLE street_segments DROP CONSTRAINT IF EXISTS chk_street_segments_geom_type;
ALTER TABLE street_segments ADD CONSTRAINT chk_street_segments_geom_type
    CHECK (GeometryType(geom) = 'LINESTRING');

ALTER TABLE street_segments DROP CONSTRAINT IF EXISTS chk_street_segments_geom_srid;
ALTER TABLE street_segments ADD CONSTRAINT chk_street_segments_geom_srid
    CHECK (ST_SRID(geom) = 4326);

-- Sensor: Must be Point with correct SRID
ALTER TABLE sensors DROP CONSTRAINT IF EXISTS chk_sensors_geom_type;
ALTER TABLE sensors ADD CONSTRAINT chk_sensors_geom_type
    CHECK (GeometryType(geom) = 'POINT');

ALTER TABLE sensors DROP CONSTRAINT IF EXISTS chk_sensors_geom_srid;
ALTER TABLE sensors ADD CONSTRAINT chk_sensors_geom_srid
    CHECK (ST_SRID(geom) = 4326);

-- PaymentTerminal: Must be Point with correct SRID
ALTER TABLE payment_terminals DROP CONSTRAINT IF EXISTS chk_payment_terminals_geom_type;
ALTER TABLE payment_terminals ADD CONSTRAINT chk_payment_terminals_geom_type
    CHECK (GeometryType(geom) = 'POINT');

ALTER TABLE payment_terminals DROP CONSTRAINT IF EXISTS chk_payment_terminals_geom_srid;
ALTER TABLE payment_terminals ADD CONSTRAINT chk_payment_terminals_geom_srid
    CHECK (ST_SRID(geom) = 4326);

-- Violation: Must be Point with correct SRID
ALTER TABLE violations DROP CONSTRAINT IF EXISTS chk_violations_geom_type;
ALTER TABLE violations ADD CONSTRAINT chk_violations_geom_type
    CHECK (GeometryType(geom) = 'POINT');

ALTER TABLE violations DROP CONSTRAINT IF EXISTS chk_violations_geom_srid;
ALTER TABLE violations ADD CONSTRAINT chk_violations_geom_srid
    CHECK (ST_SRID(geom) = 4326);

-- PointOfInterest: Must be Point with correct SRID
ALTER TABLE points_of_interest DROP CONSTRAINT IF EXISTS chk_poi_geom_type;
ALTER TABLE points_of_interest ADD CONSTRAINT chk_poi_geom_type
    CHECK (GeometryType(geom) = 'POINT');

ALTER TABLE points_of_interest DROP CONSTRAINT IF EXISTS chk_poi_geom_srid;
ALTER TABLE points_of_interest ADD CONSTRAINT chk_poi_geom_srid
    CHECK (ST_SRID(geom) = 4326);

-- ============================================
-- GEOMETRY VALIDITY CONSTRAINTS
-- ============================================

ALTER TABLE parking_zones DROP CONSTRAINT IF EXISTS chk_parking_zones_geom_valid;
ALTER TABLE parking_zones ADD CONSTRAINT chk_parking_zones_geom_valid
    CHECK (ST_IsValid(geom));

ALTER TABLE parking_bays DROP CONSTRAINT IF EXISTS chk_parking_bays_geom_valid;
ALTER TABLE parking_bays ADD CONSTRAINT chk_parking_bays_geom_valid
    CHECK (ST_IsValid(geom));

ALTER TABLE street_segments DROP CONSTRAINT IF EXISTS chk_street_segments_geom_valid;
ALTER TABLE street_segments ADD CONSTRAINT chk_street_segments_geom_valid
    CHECK (ST_IsValid(geom));

-- ============================================
-- OSM STAGING TABLES CONFIGURATION
-- Accept broader geometry types for import, then transform
-- ============================================

-- Drop and recreate constraint on osm_parking_raw to accept any geometry
ALTER TABLE osm_parking_raw DROP CONSTRAINT IF EXISTS chk_osm_parking_raw_geom_srid;
-- No type constraint - can be Point, Polygon, MultiPolygon

-- osm_roads_raw already has LineString constraint which is correct
-- Just ensure SRID is correct
ALTER TABLE osm_roads_raw DROP CONSTRAINT IF EXISTS chk_osm_roads_raw_geom_srid;
ALTER TABLE osm_roads_raw ADD CONSTRAINT chk_osm_roads_raw_geom_srid
    CHECK (ST_SRID(geom) = 4326);

-- osm_pois_raw must be Point
ALTER TABLE osm_pois_raw DROP CONSTRAINT IF EXISTS chk_osm_pois_raw_geom_srid;
ALTER TABLE osm_pois_raw ADD CONSTRAINT chk_osm_pois_raw_geom_srid
    CHECK (ST_SRID(geom) = 4326);

-- ============================================
-- GEOMETRY TRANSFORMATION FUNCTIONS
-- For normalizing OSM multi-geometries to simple geometries
-- ============================================

-- Convert MultiPolygon to Polygon (takes largest by area)
CREATE OR REPLACE FUNCTION normalize_to_polygon(geom GEOMETRY)
RETURNS GEOMETRY AS $$
DECLARE
    geom_type TEXT;
    result GEOMETRY;
    max_area FLOAT := 0;
    current_area FLOAT;
    n INTEGER;
    i INTEGER;
    current_geom GEOMETRY;
BEGIN
    IF geom IS NULL THEN
        RETURN NULL;
    END IF;
    
    geom_type := GeometryType(geom);
    
    -- Already a Polygon - return as is
    IF geom_type = 'POLYGON' THEN
        RETURN geom;
    END IF;
    
    -- Handle MultiPolygon - return the largest polygon by area
    IF geom_type = 'MULTIPOLYGON' THEN
        n := ST_NumGeometries(geom);
        FOR i IN 1..n LOOP
            current_geom := ST_GeometryN(geom, i);
            current_area := ST_Area(current_geom::geography);
            IF current_area > max_area THEN
                max_area := current_area;
                result := current_geom;
            END IF;
        END LOOP;
        RETURN result;
    END IF;
    
    -- Handle GeometryCollection - extract first polygon
    IF geom_type = 'GEOMETRYCOLLECTION' THEN
        n := ST_NumGeometries(geom);
        FOR i IN 1..n LOOP
            current_geom := ST_GeometryN(geom, i);
            IF GeometryType(current_geom) = 'POLYGON' THEN
                current_area := ST_Area(current_geom::geography);
                IF current_area > max_area THEN
                    max_area := current_area;
                    result := current_geom;
                END IF;
            END IF;
        END LOOP;
        RETURN result;
    END IF;
    
    -- Handle Point - create a small buffer polygon (for parking nodes)
    IF geom_type = 'POINT' THEN
        -- Create ~25 sq meter polygon (5m radius buffer)
        RETURN ST_Buffer(geom::geography, 2.5)::geometry;
    END IF;
    
    -- Other types cannot be converted
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Convert MultiLineString to LineString (takes longest segment)
CREATE OR REPLACE FUNCTION normalize_to_linestring(geom GEOMETRY)
RETURNS GEOMETRY AS $$
DECLARE
    geom_type TEXT;
    result GEOMETRY;
    max_length FLOAT := 0;
    current_length FLOAT;
    n INTEGER;
    i INTEGER;
    current_geom GEOMETRY;
BEGIN
    IF geom IS NULL THEN
        RETURN NULL;
    END IF;
    
    geom_type := GeometryType(geom);
    
    -- Already a LineString - return as is
    IF geom_type = 'LINESTRING' THEN
        RETURN geom;
    END IF;
    
    -- Handle MultiLineString - return the longest segment
    IF geom_type = 'MULTILINESTRING' THEN
        n := ST_NumGeometries(geom);
        FOR i IN 1..n LOOP
            current_geom := ST_GeometryN(geom, i);
            current_length := ST_Length(current_geom::geography);
            IF current_length > max_length THEN
                max_length := current_length;
                result := current_geom;
            END IF;
        END LOOP;
        RETURN result;
    END IF;
    
    -- Handle GeometryCollection - extract first linestring
    IF geom_type = 'GEOMETRYCOLLECTION' THEN
        n := ST_NumGeometries(geom);
        FOR i IN 1..n LOOP
            current_geom := ST_GeometryN(geom, i);
            IF GeometryType(current_geom) = 'LINESTRING' THEN
                current_length := ST_Length(current_geom::geography);
                IF current_length > max_length THEN
                    max_length := current_length;
                    result := current_geom;
                END IF;
            END IF;
        END LOOP;
        RETURN result;
    END IF;
    
    -- Other types cannot be converted
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Convert any geometry to Point (centroid)
CREATE OR REPLACE FUNCTION normalize_to_point(geom GEOMETRY)
RETURNS GEOMETRY AS $$
BEGIN
    IF geom IS NULL THEN
        RETURN NULL;
    END IF;
    
    IF GeometryType(geom) = 'POINT' THEN
        RETURN geom;
    END IF;
    
    -- For any other type, return centroid
    RETURN ST_Centroid(geom);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- TABLE FOR LOGGING GEOMETRY CONVERSION ISSUES
-- ============================================

CREATE TABLE IF NOT EXISTS geometry_conversion_log (
    log_id SERIAL PRIMARY KEY,
    source_table VARCHAR(100) NOT NULL,
    source_id BIGINT,
    osm_id BIGINT,
    original_geom_type VARCHAR(50),
    target_geom_type VARCHAR(50),
    conversion_status VARCHAR(20) NOT NULL CHECK (conversion_status IN ('success', 'skipped', 'error')),
    error_message TEXT,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_geometry_conversion_log_status ON geometry_conversion_log (conversion_status);
CREATE INDEX idx_geometry_conversion_log_source ON geometry_conversion_log (source_table);

-- ============================================
-- HELPER FUNCTION TO VALIDATE GEOMETRY TYPE
-- Returns true if geometry matches expected type
-- ============================================

CREATE OR REPLACE FUNCTION validate_geometry_type(
    geom GEOMETRY,
    expected_type VARCHAR,
    allow_multi BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN AS $$
DECLARE
    actual_type TEXT;
BEGIN
    IF geom IS NULL THEN
        RETURN FALSE;
    END IF;
    
    actual_type := GeometryType(geom);
    
    IF actual_type = expected_type THEN
        RETURN TRUE;
    END IF;
    
    IF allow_multi AND actual_type = 'MULTI' || expected_type THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- VIEW FOR GEOMETRY VALIDATION STATUS
-- ============================================

CREATE OR REPLACE VIEW v_geometry_validation_status AS
SELECT 
    'parking_zones' as table_name,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE GeometryType(geom) = 'POLYGON') as valid_type_count,
    COUNT(*) FILTER (WHERE ST_SRID(geom) = 4326) as valid_srid_count,
    COUNT(*) FILTER (WHERE ST_IsValid(geom)) as valid_geom_count
FROM parking_zones
UNION ALL
SELECT 
    'parking_bays' as table_name,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE GeometryType(geom) = 'POLYGON') as valid_type_count,
    COUNT(*) FILTER (WHERE ST_SRID(geom) = 4326) as valid_srid_count,
    COUNT(*) FILTER (WHERE ST_IsValid(geom)) as valid_geom_count
FROM parking_bays
UNION ALL
SELECT 
    'street_segments' as table_name,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE GeometryType(geom) = 'LINESTRING') as valid_type_count,
    COUNT(*) FILTER (WHERE ST_SRID(geom) = 4326) as valid_srid_count,
    COUNT(*) FILTER (WHERE ST_IsValid(geom)) as valid_geom_count
FROM street_segments
UNION ALL
SELECT 
    'sensors' as table_name,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE GeometryType(geom) = 'POINT') as valid_type_count,
    COUNT(*) FILTER (WHERE ST_SRID(geom) = 4326) as valid_srid_count,
    COUNT(*) as valid_geom_count  -- Points are always valid
FROM sensors
UNION ALL
SELECT 
    'payment_terminals' as table_name,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE GeometryType(geom) = 'POINT') as valid_type_count,
    COUNT(*) FILTER (WHERE ST_SRID(geom) = 4326) as valid_srid_count,
    COUNT(*) as valid_geom_count
FROM payment_terminals
UNION ALL
SELECT 
    'violations' as table_name,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE GeometryType(geom) = 'POINT') as valid_type_count,
    COUNT(*) FILTER (WHERE ST_SRID(geom) = 4326) as valid_srid_count,
    COUNT(*) as valid_geom_count
FROM violations
UNION ALL
SELECT 
    'points_of_interest' as table_name,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE GeometryType(geom) = 'POINT') as valid_type_count,
    COUNT(*) FILTER (WHERE ST_SRID(geom) = 4326) as valid_srid_count,
    COUNT(*) as valid_geom_count
FROM points_of_interest;

-- Log constraint creation
DO $$
BEGIN
    RAISE NOTICE 'Geometry constraints and validation functions created successfully';
END $$;
