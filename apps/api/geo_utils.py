"""
GeoJSON utility functions for converting between PostGIS and GeoJSON
Includes geometry type validation per PDF specification:
  - ParkingZone/ParkingBay: Polygon
  - StreetSegment: LineString  
  - Sensor/PaymentTerminal/Violation: Point
"""
import json
from typing import Any, Dict, Optional, Tuple
from sqlalchemy import text, func
from sqlalchemy.orm import Session
from geoalchemy2.shape import to_shape
from shapely.geometry import mapping, shape
from shapely.validation import explain_validity
from fastapi import HTTPException

# Default SRID - can be overridden by environment variable
DEFAULT_SRID = 4326

# Geometry type requirements per entity
GEOMETRY_REQUIREMENTS = {
    'parking_zone': 'Polygon',
    'parking_bay': 'Polygon',
    'street_segment': 'LineString',
    'sensor': 'Point',
    'payment_terminal': 'Point',
    'violation': 'Point',
    'point_of_interest': 'Point'
}

def geom_to_geojson(geom) -> Optional[Dict[str, Any]]:
    """Convert a GeoAlchemy2 geometry to GeoJSON dict"""
    if geom is None:
        return None
    try:
        shapely_geom = to_shape(geom)
        return mapping(shapely_geom)
    except Exception:
        return None

def geojson_to_wkt(geojson: Dict[str, Any], srid: int = DEFAULT_SRID) -> str:
    """Convert GeoJSON dict to WKT string"""
    shapely_geom = shape(geojson)
    return f"SRID={srid};{shapely_geom.wkt}"

def geojson_to_ewkt(geojson: Dict[str, Any], srid: int = DEFAULT_SRID) -> str:
    """Convert GeoJSON dict to EWKT string"""
    shapely_geom = shape(geojson)
    return f"SRID={srid};{shapely_geom.wkt}"

def make_geojson_feature(geometry: Dict[str, Any], properties: Dict[str, Any]) -> Dict[str, Any]:
    """Create a GeoJSON Feature object"""
    return {
        "type": "Feature",
        "geometry": geometry,
        "properties": properties
    }

def make_feature_collection(features: list) -> Dict[str, Any]:
    """Create a GeoJSON FeatureCollection"""
    return {
        "type": "FeatureCollection",
        "features": features
    }

def validate_geometry_type(geojson: Dict[str, Any], expected_type: str, entity_name: str = "geometry") -> Tuple[bool, str]:
    """
    Validate that a GeoJSON geometry matches the expected type.
    Returns (is_valid, error_message)
    """
    if not geojson:
        return False, f"{entity_name} is required"
    
    actual_type = geojson.get("type")
    if actual_type != expected_type:
        return False, f"{entity_name} must be {expected_type}, got {actual_type}"
    
    try:
        shapely_geom = shape(geojson)
        if not shapely_geom.is_valid:
            reason = explain_validity(shapely_geom)
            return False, f"{entity_name} is not valid: {reason}"
        if shapely_geom.is_empty:
            return False, f"{entity_name} is empty"
    except Exception as e:
        return False, f"{entity_name} could not be parsed: {str(e)}"
    
    return True, ""

def validate_polygon(geojson: Dict[str, Any], entity_name: str = "Polygon") -> bool:
    """Validate that a GeoJSON geometry is a valid polygon"""
    is_valid, error = validate_geometry_type(geojson, "Polygon", entity_name)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)
    return True

def validate_point(geojson: Dict[str, Any], entity_name: str = "Point") -> bool:
    """Validate that a GeoJSON geometry is a valid point"""
    if geojson.get("type") != "Point":
        raise HTTPException(status_code=400, detail=f"{entity_name} must be Point, got {geojson.get('type')}")
    try:
        coords = geojson.get("coordinates", [])
        if len(coords) < 2:
            raise HTTPException(status_code=400, detail=f"{entity_name} must have [longitude, latitude] coordinates")
        lng, lat = coords[0], coords[1]
        if not (-180 <= lng <= 180):
            raise HTTPException(status_code=400, detail=f"{entity_name} longitude must be between -180 and 180")
        if not (-90 <= lat <= 90):
            raise HTTPException(status_code=400, detail=f"{entity_name} latitude must be between -90 and 90")
        return True
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"{entity_name} coordinates are invalid: {str(e)}")

def validate_linestring(geojson: Dict[str, Any], entity_name: str = "LineString") -> bool:
    """Validate that a GeoJSON geometry is a valid linestring"""
    is_valid, error = validate_geometry_type(geojson, "LineString", entity_name)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)
    return True

def validate_geojson_for_entity(geojson: Dict[str, Any], entity_type: str) -> bool:
    """
    Validate GeoJSON geometry type for a specific entity type.
    Raises HTTPException if invalid.
    """
    expected = GEOMETRY_REQUIREMENTS.get(entity_type)
    if not expected:
        raise ValueError(f"Unknown entity type: {entity_type}")
    
    if expected == "Polygon":
        return validate_polygon(geojson, f"{entity_type.replace('_', ' ').title()} geometry")
    elif expected == "LineString":
        return validate_linestring(geojson, f"{entity_type.replace('_', ' ').title()} geometry")
    elif expected == "Point":
        return validate_point(geojson, f"{entity_type.replace('_', ' ').title()} geometry")
    
    return False

def st_geomfromgeojson(db: Session, geojson: Dict[str, Any], srid: int = DEFAULT_SRID):
    """Create a PostGIS geometry from GeoJSON using database function"""
    geojson_str = json.dumps(geojson)
    result = db.execute(
        text("SELECT ST_SetSRID(ST_GeomFromGeoJSON(:geojson), :srid)"),
        {"geojson": geojson_str, "srid": srid}
    )
    return result.scalar()

def st_asgeojson(db: Session, geom_column) -> Dict[str, Any]:
    """Convert a geometry column to GeoJSON using database function"""
    result = db.execute(
        text("SELECT ST_AsGeoJSON(:geom)::json"),
        {"geom": geom_column}
    )
    return result.scalar()

def ensure_srid(geojson: Dict[str, Any], srid: int = DEFAULT_SRID) -> Dict[str, Any]:
    """
    Ensure geometry is returned with proper SRID metadata.
    GeoJSON doesn't have SRID field but we track it for internal use.
    """
    return {
        **geojson,
        "_srid": srid
    }

def normalize_multipolygon_to_polygon(geojson: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert a MultiPolygon to a Polygon by taking the largest polygon by area.
    Returns original if already a Polygon.
    """
    if geojson.get("type") == "Polygon":
        return geojson
    
    if geojson.get("type") != "MultiPolygon":
        raise ValueError(f"Cannot convert {geojson.get('type')} to Polygon")
    
    shapely_multi = shape(geojson)
    if shapely_multi.is_empty:
        raise ValueError("MultiPolygon is empty")
    
    # Find the largest polygon by area
    largest = max(shapely_multi.geoms, key=lambda g: g.area)
    return mapping(largest)

def normalize_multilinestring_to_linestring(geojson: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert a MultiLineString to a LineString by taking the longest segment.
    Returns original if already a LineString.
    """
    if geojson.get("type") == "LineString":
        return geojson
    
    if geojson.get("type") != "MultiLineString":
        raise ValueError(f"Cannot convert {geojson.get('type')} to LineString")
    
    shapely_multi = shape(geojson)
    if shapely_multi.is_empty:
        raise ValueError("MultiLineString is empty")
    
    # Find the longest linestring by length
    longest = max(shapely_multi.geoms, key=lambda g: g.length)
    return mapping(longest)
