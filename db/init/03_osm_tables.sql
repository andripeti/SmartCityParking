-- OpenStreetMap Data Tables and Extensions
-- For importing and staging Vienna parking data from OSM

-- ============================================
-- OSM RAW DATA TABLES (Staging)
-- ============================================

-- Raw parking features from OSM (amenity=parking)
CREATE TABLE IF NOT EXISTS osm_parking_raw (
    id SERIAL PRIMARY KEY,
    osm_id BIGINT NOT NULL,
    osm_type VARCHAR(20) NOT NULL CHECK (osm_type IN ('node', 'way', 'relation')),
    name VARCHAR(500),
    parking_type VARCHAR(100), -- surface, underground, multi-storey, street_side
    access_type VARCHAR(100), -- public, private, customers, etc.
    capacity INTEGER,
    fee VARCHAR(50),
    operator VARCHAR(255),
    opening_hours VARCHAR(500),
    surface VARCHAR(100),
    tags JSONB NOT NULL DEFAULT '{}',
    geom GEOMETRY NOT NULL,
    imported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(osm_id, osm_type)
);

CREATE INDEX idx_osm_parking_raw_geom ON osm_parking_raw USING GIST (geom);
CREATE INDEX idx_osm_parking_raw_osm_id ON osm_parking_raw (osm_id);
CREATE INDEX idx_osm_parking_raw_type ON osm_parking_raw (parking_type);
CREATE INDEX idx_osm_parking_raw_tags ON osm_parking_raw USING GIN (tags);

-- Raw road features from OSM (highway=*)
CREATE TABLE IF NOT EXISTS osm_roads_raw (
    id SERIAL PRIMARY KEY,
    osm_id BIGINT NOT NULL,
    osm_type VARCHAR(20) NOT NULL CHECK (osm_type IN ('way', 'relation')),
    name VARCHAR(500),
    highway_type VARCHAR(100) NOT NULL, -- primary, secondary, tertiary, residential, etc.
    maxspeed VARCHAR(50),
    surface VARCHAR(100),
    oneway VARCHAR(10),
    lanes INTEGER,
    tags JSONB NOT NULL DEFAULT '{}',
    geom GEOMETRY(LineString, 4326) NOT NULL,
    imported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(osm_id, osm_type)
);

CREATE INDEX idx_osm_roads_raw_geom ON osm_roads_raw USING GIST (geom);
CREATE INDEX idx_osm_roads_raw_osm_id ON osm_roads_raw (osm_id);
CREATE INDEX idx_osm_roads_raw_type ON osm_roads_raw (highway_type);
CREATE INDEX idx_osm_roads_raw_name ON osm_roads_raw (name);

-- Raw POI features from OSM for accessibility analysis
CREATE TABLE IF NOT EXISTS osm_pois_raw (
    id SERIAL PRIMARY KEY,
    osm_id BIGINT NOT NULL,
    osm_type VARCHAR(20) NOT NULL CHECK (osm_type IN ('node', 'way', 'relation')),
    name VARCHAR(500),
    amenity VARCHAR(100), -- school, hospital, clinic, bus_station, etc.
    railway VARCHAR(100), -- station, halt, tram_stop, etc.
    public_transport VARCHAR(100),
    tags JSONB NOT NULL DEFAULT '{}',
    geom GEOMETRY(Point, 4326) NOT NULL,
    imported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(osm_id, osm_type)
);

CREATE INDEX idx_osm_pois_raw_geom ON osm_pois_raw USING GIST (geom);
CREATE INDEX idx_osm_pois_raw_osm_id ON osm_pois_raw (osm_id);
CREATE INDEX idx_osm_pois_raw_amenity ON osm_pois_raw (amenity);
CREATE INDEX idx_osm_pois_raw_railway ON osm_pois_raw (railway);

-- ============================================
-- OSM SYNC LOG (Metadata tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS osm_sync_log (
    sync_id SERIAL PRIMARY KEY,
    sync_type VARCHAR(50) NOT NULL, -- parking, roads, pois, full
    area_name VARCHAR(100) NOT NULL DEFAULT 'Vienna',
    bbox_wkt TEXT, -- Bounding box as WKT
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    records_fetched INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    zones_created INTEGER DEFAULT 0,
    bays_generated INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    error_message TEXT,
    query_used TEXT
);

CREATE INDEX idx_osm_sync_log_type ON osm_sync_log (sync_type);
CREATE INDEX idx_osm_sync_log_status ON osm_sync_log (status);

-- ============================================
-- ADD OSM COLUMNS TO EXISTING TABLES
-- ============================================

-- Add OSM tracking columns to parking_zones
ALTER TABLE parking_zones 
ADD COLUMN IF NOT EXISTS osm_id BIGINT,
ADD COLUMN IF NOT EXISTS osm_type VARCHAR(20),
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS capacity INTEGER,
ADD COLUMN IF NOT EXISTS last_osm_sync TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_parking_zones_osm_id ON parking_zones (osm_id);
CREATE INDEX IF NOT EXISTS idx_parking_zones_source ON parking_zones (source);

-- Add OSM tracking columns to parking_bays
ALTER TABLE parking_bays 
ADD COLUMN IF NOT EXISTS osm_id BIGINT,
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS street_segment_id INTEGER REFERENCES street_segments(street_id);

CREATE INDEX IF NOT EXISTS idx_parking_bays_osm_id ON parking_bays (osm_id);
CREATE INDEX IF NOT EXISTS idx_parking_bays_source ON parking_bays (source);
CREATE INDEX IF NOT EXISTS idx_parking_bays_generated ON parking_bays (generated);
CREATE INDEX IF NOT EXISTS idx_parking_bays_street ON parking_bays (street_segment_id);

-- Add OSM tracking columns to street_segments
ALTER TABLE street_segments 
ADD COLUMN IF NOT EXISTS osm_id BIGINT,
ADD COLUMN IF NOT EXISTS osm_type VARCHAR(20),
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS highway_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_osm_sync TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_street_segments_osm_id ON street_segments (osm_id);
CREATE INDEX IF NOT EXISTS idx_street_segments_source ON street_segments (source);
CREATE INDEX IF NOT EXISTS idx_street_segments_highway ON street_segments (highway_type);

-- ============================================
-- HELPER FUNCTIONS FOR OSM IMPORT
-- ============================================

-- Function to classify OSM highway type to our road_type
CREATE OR REPLACE FUNCTION osm_highway_to_road_type(highway_type VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
    RETURN CASE 
        WHEN highway_type IN ('motorway', 'trunk', 'primary') THEN 'primary'
        WHEN highway_type IN ('secondary', 'tertiary') THEN 'secondary'
        ELSE 'local'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to classify OSM parking type to our zone_type
CREATE OR REPLACE FUNCTION osm_parking_to_zone_type(parking_type VARCHAR, access_type VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
    RETURN CASE 
        WHEN parking_type IN ('underground', 'multi-storey') THEN 'garage'
        WHEN parking_type = 'surface' THEN 'lot'
        WHEN parking_type = 'street_side' THEN 'on_street'
        WHEN access_type = 'private' THEN 'off_street'
        ELSE 'on_street'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to extract maxspeed as integer
CREATE OR REPLACE FUNCTION osm_maxspeed_to_int(maxspeed VARCHAR)
RETURNS INTEGER AS $$
BEGIN
    RETURN CASE 
        WHEN maxspeed ~ '^\d+$' THEN maxspeed::INTEGER
        WHEN maxspeed ~ '^\d+' THEN (regexp_match(maxspeed, '^(\d+)'))[1]::INTEGER
        ELSE NULL
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to determine tariff based on distance from Vienna center (Stephansplatz)
-- Districts 1-9 (inner): Premium rate, Districts 10-23 (outer): Standard rate
CREATE OR REPLACE FUNCTION get_vienna_tariff_by_location(geom GEOMETRY)
RETURNS INTEGER AS $$
DECLARE
    stephansplatz GEOMETRY := ST_SetSRID(ST_MakePoint(16.3738, 48.2082), 4326);
    distance_km FLOAT;
BEGIN
    distance_km := ST_Distance(ST_Centroid(geom)::geography, stephansplatz::geography) / 1000;
    -- Within ~3km of center (districts 1-9): Premium rate (id=3)
    -- Outside: Standard rate (id=1)
    RETURN CASE 
        WHEN distance_km <= 3 THEN 3  -- Premium Central tariff
        ELSE 1  -- Standard Weekday tariff
    END;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- VIEW FOR OSM IMPORT STATISTICS
-- ============================================
CREATE OR REPLACE VIEW v_osm_import_stats AS
SELECT 
    (SELECT COUNT(*) FROM osm_parking_raw) as parking_raw_count,
    (SELECT COUNT(*) FROM osm_roads_raw) as roads_raw_count,
    (SELECT COUNT(*) FROM osm_pois_raw) as pois_raw_count,
    (SELECT COUNT(*) FROM parking_zones WHERE source = 'osm') as osm_zones_count,
    (SELECT COUNT(*) FROM parking_bays WHERE source = 'osm') as osm_bays_count,
    (SELECT COUNT(*) FROM parking_bays WHERE generated = TRUE) as generated_bays_count,
    (SELECT COUNT(*) FROM street_segments WHERE source = 'osm') as osm_streets_count,
    (SELECT MAX(completed_at) FROM osm_sync_log WHERE status = 'completed') as last_sync;

-- Log schema extension
DO $$
BEGIN
    RAISE NOTICE 'OSM tables and extensions created successfully';
END $$;
