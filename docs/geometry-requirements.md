# GIS Geometry Requirements

This document specifies the exact geometry types required for each spatial entity in the Smart City Parking Management System, as defined in the PDF specification.

## Table of Contents
1. [Geometry Type Requirements](#geometry-type-requirements)
2. [SRID Configuration](#srid-configuration)
3. [Database Constraints](#database-constraints)
4. [Spatial Validation Rules](#spatial-validation-rules)
5. [API Geometry Handling](#api-geometry-handling)
6. [UI Draw Tool Restrictions](#ui-draw-tool-restrictions)
7. [Valid GeoJSON Examples](#valid-geojson-examples)

---

## Geometry Type Requirements

| Entity | Required Geometry Type | PostGIS Type |
|--------|----------------------|--------------|
| **ParkingZone** | Polygon | `geometry(Polygon, 4326)` |
| **ParkingBay** | Polygon | `geometry(Polygon, 4326)` |
| **StreetSegment** | LineString | `geometry(LineString, 4326)` |
| **Sensor** | Point | `geometry(Point, 4326)` |
| **PaymentTerminal** | Point | `geometry(Point, 4326)` |
| **Violation** | Point | `geometry(Point, 4326)` |
| **PointOfInterest** | Point | `geometry(Point, 4326)` |

### Important Notes

- **DO NOT** use MultiPolygon or MultiLineString for application tables
- OSM staging tables may accept broader types for import, then normalize to simple types
- All geometries must be valid (no self-intersecting polygons, etc.)

---

## SRID Configuration

- **Default SRID**: 4326 (WGS 84)
- **Configurable via**: `SRID` environment variable in `.env`
- All geometries must have the same SRID across the system

```env
# .env
SRID=4326
```

---

## Database Constraints

All spatial tables have the following constraints enforced:

### Type Constraints
```sql
-- ParkingZone
CHECK (GeometryType(geom) = 'POLYGON')

-- ParkingBay  
CHECK (GeometryType(geom) = 'POLYGON')

-- StreetSegment
CHECK (GeometryType(geom) = 'LINESTRING')

-- Sensor, PaymentTerminal, Violation
CHECK (GeometryType(geom) = 'POINT')
```

### SRID Constraints
```sql
CHECK (ST_SRID(geom) = 4326)
```

### Validity Constraints
```sql
CHECK (ST_IsValid(geom))
```

### GiST Indexes
All geometry columns have spatial indexes:
```sql
CREATE INDEX idx_tablename_geom ON tablename USING GIST (geom);
```

---

## Spatial Validation Rules

### 1. Bay Must Be Within Zone
When creating or updating a `ParkingBay`:
- The bay polygon **MUST** be contained within its parent zone's polygon
- At least 90% overlap is required for edge cases
- Enforced by database trigger: `validate_bay_within_zone_trigger`

```sql
-- Validation function
IF NOT ST_Within(bay.geom, zone.geom) THEN
    -- Also allows if 90% overlap exists
    IF ST_Area(ST_Intersection(bay.geom, zone.geom)) / ST_Area(bay.geom) < 0.9 THEN
        RAISE EXCEPTION 'Bay must be contained within zone';
    END IF;
END IF;
```

### 2. Sensor Must Be Near Bay
When creating or updating a `Sensor` with a `bay_id`:
- The sensor point **MUST** be within **3 meters** of its associated bay
- Can be inside the bay polygon OR within 3m of the boundary
- Enforced by database trigger: `validate_sensor_near_bay_trigger`

```sql
-- Within bay polygon is OK
IF ST_Within(sensor.geom, bay.geom) THEN
    RETURN NEW;
END IF;

-- Within 3m of bay boundary is OK
IF ST_Distance(sensor.geom::geography, bay.geom::geography) <= 3.0 THEN
    RETURN NEW;
END IF;
```

### 3. Violation Must Be Inside Bay
When creating a `Violation`:
- The violation point **MUST** be inside its associated bay polygon
- 2 meter tolerance for GPS accuracy
- Enforced by database trigger: `validate_violation_inside_bay_trigger`

```sql
-- Inside bay polygon
IF ST_Contains(bay.geom, violation.geom) THEN
    RETURN NEW;
END IF;

-- Within 2m tolerance
IF ST_DWithin(violation.geom::geography, bay.geom::geography, 2.0) THEN
    RETURN NEW;
END IF;
```

---

## API Geometry Handling

### Request Validation

The API validates geometry types using Pydantic schemas:

```python
# For Polygon entities (Zone, Bay)
class GeoJSONPolygonGeometry(BaseModel):
    type: str = Field(..., pattern="^Polygon$")
    coordinates: List[List[List[float]]]

# For Point entities (Sensor, Terminal, Violation)
class GeoJSONPointGeometry(BaseModel):
    type: str = Field(..., pattern="^Point$")
    coordinates: List[float]

# For LineString entities (Street)
class GeoJSONLineStringGeometry(BaseModel):
    type: str = Field(..., pattern="^LineString$")
    coordinates: List[List[float]]
```

### Error Responses

When geometry validation fails, the API returns 400 with descriptive errors:

```json
{
    "detail": "ParkingZone geometry must be Polygon, got Point"
}

{
    "detail": "Bay geometry must be contained within the parent zone"
}

{
    "detail": "Violation point must be inside the associated parking bay"
}
```

### Response Format

All spatial endpoints return geometries in GeoJSON format:

```json
{
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[lng, lat], ...]]
            },
            "properties": {
                "zone_id": 1,
                "name": "Zone A"
            }
        }
    ]
}
```

---

## UI Draw Tool Restrictions

### MapLibre GL Draw Configuration

The frontend map editing tools restrict drawing by entity type:

| Layer | Allowed Draw Mode |
|-------|------------------|
| Zones | `draw_polygon` only |
| Bays | `draw_polygon` only |
| Streets | `draw_line_string` only |
| Sensors | `draw_point` only |
| Terminals | `draw_point` only |
| Violations | `draw_point` only |

### Implementation

```javascript
// Zone/Bay editing - Polygon only
const drawZone = new MapboxDraw({
    displayControlsDefault: false,
    controls: {
        polygon: true,
        trash: true
    }
});

// Sensor/Terminal - Point only
const drawSensor = new MapboxDraw({
    displayControlsDefault: false,
    controls: {
        point: true,
        trash: true
    }
});

// Street editing - LineString only
const drawStreet = new MapboxDraw({
    displayControlsDefault: false,
    controls: {
        line_string: true,
        trash: true
    }
});
```

### Validation Before Save

```javascript
function validateGeometry(feature, expectedType) {
    if (feature.geometry.type !== expectedType) {
        alert(`Invalid geometry type. Expected ${expectedType}, got ${feature.geometry.type}`);
        return false;
    }
    return true;
}

// Usage
drawZone.on('draw.create', (e) => {
    const feature = e.features[0];
    if (!validateGeometry(feature, 'Polygon')) {
        drawZone.delete(feature.id);
        return;
    }
    saveZone(feature);
});
```

---

## Valid GeoJSON Examples

### ParkingZone (Polygon)
```json
{
    "name": "Zone A - Stephansplatz",
    "zone_type": "on_street",
    "max_duration_minutes": 180,
    "geom": {
        "type": "Polygon",
        "coordinates": [[
            [16.3715, 48.2065],
            [16.3760, 48.2065],
            [16.3760, 48.2100],
            [16.3715, 48.2100],
            [16.3715, 48.2065]
        ]]
    }
}
```

### ParkingBay (Polygon)
```json
{
    "zone_id": 1,
    "bay_number": "A-001",
    "is_disabled_only": false,
    "is_electric": false,
    "geom": {
        "type": "Polygon",
        "coordinates": [[
            [16.3720, 48.2070],
            [16.3722, 48.2070],
            [16.3722, 48.2072],
            [16.3720, 48.2072],
            [16.3720, 48.2070]
        ]]
    }
}
```

### StreetSegment (LineString)
```json
{
    "name": "Kärntner Straße",
    "road_type": "primary",
    "speed_limit_kph": 30,
    "geom": {
        "type": "LineString",
        "coordinates": [
            [16.3690, 48.2040],
            [16.3710, 48.2060],
            [16.3730, 48.2080],
            [16.3740, 48.2085]
        ]
    }
}
```

### Sensor (Point)
```json
{
    "bay_id": 1,
    "sensor_type": "in_ground",
    "is_active": true,
    "battery_level_percent": 85,
    "geom": {
        "type": "Point",
        "coordinates": [16.3721, 48.2071]
    }
}
```

### PaymentTerminal (Point)
```json
{
    "zone_id": 1,
    "terminal_code": "T-001",
    "status": "operational",
    "geom": {
        "type": "Point",
        "coordinates": [16.3725, 48.2075]
    }
}
```

### Violation (Point)
```json
{
    "bay_id": 1,
    "violation_type": "no_payment",
    "fine_amount": 50.00,
    "notes": "No ticket displayed",
    "geom": {
        "type": "Point",
        "coordinates": [16.3721, 48.2071]
    }
}
```

---

## OSM Import Normalization

When importing from OpenStreetMap:

### Staging Tables (Accept Broad Types)
- `osm_parking_raw.geom` - Can be any geometry type
- `osm_roads_raw.geom` - LineString (already restricted)
- `osm_pois_raw.geom` - Point (already restricted)

### Normalization Functions

```sql
-- Convert MultiPolygon to Polygon (largest by area)
SELECT normalize_to_polygon(geom) FROM osm_parking_raw;

-- Convert MultiLineString to LineString (longest segment)  
SELECT normalize_to_linestring(geom) FROM osm_roads_raw;

-- Convert any geometry to Point (centroid)
SELECT normalize_to_point(geom) FROM osm_pois_raw;
```

### Features That Cannot Be Converted

When OSM features cannot be cleanly converted:
1. Skip the feature
2. Log to `geometry_conversion_log` table
3. Continue processing other features

```sql
-- Check conversion log
SELECT * FROM geometry_conversion_log 
WHERE conversion_status = 'skipped';
```

---

## Testing Geometry Validation

Run the automated tests:

```bash
# From project root
docker compose exec api pytest tests/test_geometry_validation.py -v
```

Test cases include:
- ✅ Inserting wrong geometry type into each entity (rejected)
- ✅ Bay cannot be saved outside its zone
- ✅ Violation point must be inside selected bay polygon
- ✅ Distance query endpoints return correct geometry types in GeoJSON

---

## Geometry Validation View

Query to check all geometries are valid:

```sql
SELECT * FROM v_geometry_validation_status;
```

Output:
```
table_name        | total_records | valid_type_count | valid_srid_count | valid_geom_count
------------------+---------------+------------------+------------------+-----------------
parking_zones     | 3047          | 3047             | 3047             | 3047
parking_bays      | 29656         | 29656            | 29656            | 29656
street_segments   | 29382         | 29382            | 29382            | 29382
sensors           | 0             | 0                | 0                | 0
payment_terminals | 0             | 0                | 0                | 0
violations        | 0             | 0                | 0                | 0
```
