# OpenStreetMap Data Integration

This document describes how the Smart City Parking Management System integrates real OpenStreetMap (OSM) data for Vienna, Austria.

## Overview

The system uses OSM as the foundation dataset for parking zones, street segments, and points of interest. Data is fetched via the [Overpass API](https://overpass-api.de/) and transformed into the application's schema.

**Target City:** Vienna, Austria  
**Bounding Box:** `(48.12, 16.18, 48.32, 16.58)`  
**Center:** Stephansplatz `(48.2082, 16.3738)`

## License Compliance

### ODbL License
OpenStreetMap data is licensed under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright). By using OSM data, you agree to:

1. **Attribution** - Credit OpenStreetMap contributors
2. **Share-Alike** - Share derivative databases under ODbL
3. **Keep Open** - Keep derivative data open

### Required Attribution
The application displays the following attribution on all maps:
```
© OpenStreetMap contributors
```

This is implemented in the map components using MapLibre's `AttributionControl`.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Overpass API  │────▶│  GeoJSON Files  │────▶│    PostGIS      │
│   (OSM Data)    │     │   (Staging)     │     │   (Raw Tables)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │   Transform     │
                                               │   Scripts       │
                                               └─────────────────┘
                                                        │
                        ┌───────────────────────────────┼───────────────────────────────┐
                        ▼                               ▼                               ▼
               ┌─────────────────┐             ┌─────────────────┐             ┌─────────────────┐
               │  parking_zones  │             │ street_segments │             │ points_of_interest│
               └─────────────────┘             └─────────────────┘             └─────────────────┘
                        │
                        ▼
               ┌─────────────────┐
               │  parking_bays   │
               │  (Generated)    │
               └─────────────────┘
```

## Data Pipeline

### Stage 1: Fetch from Overpass API

The `fetch_vienna.py` script queries Overpass for:

#### Parking Areas
```overpass
[out:json][timeout:60];
(
  // Parking amenities
  node["amenity"="parking"](48.12,16.18,48.32,16.58);
  way["amenity"="parking"](48.12,16.18,48.32,16.58);
  relation["amenity"="parking"](48.12,16.18,48.32,16.58);
  // Street parking
  way["parking:lane:both"](48.12,16.18,48.32,16.58);
  way["parking:lane:left"](48.12,16.18,48.32,16.58);
  way["parking:lane:right"](48.12,16.18,48.32,16.58);
);
out body;
>;
out skel qt;
```

#### Roads
```overpass
[out:json][timeout:60];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service)$"](48.12,16.18,48.32,16.58);
out body;
>;
out skel qt;
```

#### Points of Interest
```overpass
[out:json][timeout:60];
(
  node["amenity"~"hospital|clinic|school|university|library|bank|police"](48.12,16.18,48.32,16.58);
  node["shop"](48.12,16.18,48.32,16.58);
  node["tourism"~"hotel|museum|attraction|viewpoint"](48.12,16.18,48.32,16.58);
  node["railway"="station"](48.12,16.18,48.32,16.58);
);
out body;
```

### Stage 2: Load into PostGIS

The `load_postgis.py` script performs UPSERT operations into staging tables:

- `osm_parking_raw` - Raw parking data with original OSM tags
- `osm_roads_raw` - Raw road network data
- `osm_pois_raw` - Raw points of interest

### Stage 3: Transform to Application Schema

#### Parking Zones (`transform_zones.py`)

Maps OSM parking types to zone types:

| OSM parking | Zone Type |
|-------------|-----------|
| surface | `lot` |
| multi-storey | `garage` |
| underground | `garage` |
| street_side | `on_street` |
| lane | `on_street` |
| parking:lane:* | `on_street` |
| (default) | `on_street` |

Tariff assignment based on district:
- **Districts 1-9** (Inner): €2.20/hr, max 2 hours
- **Districts 10-23** (Outer): €1.10/hr, max 3 hours

### Stage 4: Generate Parking Bays (`generate_bays.py`)

Since OSM rarely has individual bay polygons, the system generates them algorithmically:

#### For Parking Lots (zone_type = 'lot' or 'garage')
- Creates a grid layout within the zone polygon
- Bay dimensions: 2.5m × 5m
- Uses OSM `capacity` tag or defaults to 20 bays

#### For On-Street Parking (zone_type = 'on_street')
- Creates perimeter-style bays along the boundary
- Parallel configuration with 6m spacing
- Uses OSM `capacity` tag or defaults to 20 bays

#### Bay Attributes
- **5%** marked as disabled-only
- **5%** marked as EV charging
- **Bay numbering**: `{ZONE_PREFIX}-{SEQUENCE}`

### Stage 5: Import Supporting Data (`import_roads.py`)

- Transforms `osm_roads_raw` → `street_segments`
- Transforms `osm_pois_raw` → `points_of_interest`

## Usage

### Running the Full Import

#### Using Docker
```bash
# Full import (recommended)
docker compose run --rm osm-import

# Or with specific flags
docker compose run --rm osm-import python run_import.py --all
```

#### Running Locally
```bash
cd db/osm
pip install -r requirements.txt

# Set environment variable
export DATABASE_URL="postgresql://parking:parking_secret_2024@localhost:5432/parking_db"

# Full import
python run_import.py --all

# Or step by step:
python run_import.py --fetch        # Fetch from Overpass
python run_import.py --load         # Load into PostGIS
python run_import.py --transform    # Transform to zones
python run_import.py --generate-bays # Generate parking bays
python run_import.py --import-roads  # Import roads and POIs
python run_import.py --stats        # Show statistics
```

### Available CLI Flags

| Flag | Description |
|------|-------------|
| `--all` | Run complete import pipeline |
| `--fetch` | Fetch data from Overpass API |
| `--load` | Load GeoJSON into staging tables |
| `--transform` | Transform parking to zones |
| `--generate-bays` | Generate parking bays |
| `--import-roads` | Import roads and POIs |
| `--stats` | Show import statistics |

### Viewing Statistics

After import, check the results:

```sql
-- Zone counts by source
SELECT source, zone_type, COUNT(*) 
FROM parking_zones 
GROUP BY source, zone_type;

-- Bay generation stats
SELECT z.name, z.zone_type, COUNT(b.id) as bay_count
FROM parking_zones z
LEFT JOIN parking_bays b ON z.id = b.zone_id
GROUP BY z.id, z.name, z.zone_type
ORDER BY bay_count DESC;

-- Sync log
SELECT * FROM osm_sync_log ORDER BY started_at DESC LIMIT 10;
```

## Data Quality Notes

### What OSM Provides
- ✅ Parking lot locations and boundaries
- ✅ Street parking lane annotations
- ✅ Capacity estimates (sometimes)
- ✅ Access restrictions (public/private)
- ✅ Surface type and covered/underground info

### What OSM Typically Lacks
- ❌ Individual parking bay polygons
- ❌ Real-time occupancy
- ❌ Tariff/pricing information
- ❌ Precise capacity for many areas

### How We Handle Gaps
1. **Missing capacity**: Default to 20 bays per zone
2. **Missing bays**: Auto-generate grid/perimeter layouts
3. **Missing tariffs**: Assign based on district location
4. **Missing occupancy**: Simulate with background service

## Occupancy Simulation

Since OSM doesn't provide real-time occupancy, the API includes a simulation service that updates bay statuses every 3 minutes:

- **55%** probability → Occupied
- **35%** probability → Available
- **5%** probability → Reserved
- **5%** probability → Closed

Time-of-day modifiers:
- **6AM-9AM**: Rush hour (fewer available)
- **9AM-11AM**: Morning (balanced)
- **11AM-1PM**: Lunch peak (fewer available)
- **1PM-5PM**: Afternoon (balanced)
- **5PM-8PM**: Evening rush (fewer available)
- **8PM-11PM**: Evening (more available)
- **11PM-6AM**: Night (mostly available)

## Refreshing Data

### Manual Refresh
```bash
# Full refresh
docker compose run --rm osm-import

# Incremental (fetch and load only new)
docker compose run --rm osm-import python run_import.py --fetch --load
```

### Scheduled Refresh (Cron Example)
```bash
# Weekly refresh on Sundays at 3 AM
0 3 * * 0 cd /path/to/project && docker compose run --rm osm-import >> /var/log/osm-import.log 2>&1
```

## Troubleshooting

### Overpass API Rate Limits
The Overpass API may rate-limit requests. If you see timeout errors:
1. Wait a few minutes and retry
2. Use a local Overpass instance for heavy usage
3. Cache GeoJSON files locally

### Missing Geometry
Some OSM elements may have broken geometry. The import scripts handle this by:
1. Logging warnings for invalid geometries
2. Skipping elements that can't be parsed
3. Tracking failed imports in `osm_sync_log`

### PostGIS Connection Issues
Ensure the database is running and accessible:
```bash
# Test connection
psql $DATABASE_URL -c "SELECT PostGIS_Version();"
```

## File Structure

```
db/osm/
├── config.py           # Vienna bbox, Overpass queries, tariff config
├── requirements.txt    # Python dependencies
├── fetch_vienna.py     # Overpass API fetcher
├── load_postgis.py     # GeoJSON → PostGIS loader
├── transform_zones.py  # osm_parking_raw → parking_zones
├── generate_bays.py    # Zone → parking_bays generator
├── import_roads.py     # Roads and POI importer
├── run_import.py       # CLI orchestrator
└── data/               # Cached GeoJSON files (gitignored)
    ├── parking.geojson
    ├── roads.geojson
    └── pois.geojson
```

## References

- [OpenStreetMap Wiki: Tag:amenity=parking](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dparking)
- [OpenStreetMap Wiki: Parking](https://wiki.openstreetmap.org/wiki/Key:parking)
- [Overpass API Documentation](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [Vienna Kurzparkzone Info](https://www.wien.gv.at/verkehr/parken/kurzparkzonen/)
- [ODbL License](https://opendatacommons.org/licenses/odbl/)
