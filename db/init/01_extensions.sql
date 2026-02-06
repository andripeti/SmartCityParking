-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Set default SRID
DO $$
BEGIN
    PERFORM set_config('app.srid', '4326', false);
END $$;

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'PostGIS extensions enabled successfully';
END $$;
