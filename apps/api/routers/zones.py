"""
Parking Zones router with spatial operations
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text, func
from typing import List, Optional, Dict, Any
import json

from database import get_db
from models import User, ParkingZone, ParkingBay, TariffSchedule
from schemas import (
    ParkingZoneCreate, ParkingZoneUpdate, ParkingZoneResponse,
    ZoneOccupancy, GeoJSONGeometry
)
from auth import get_current_user, get_operator, get_staff
from geo_utils import geom_to_geojson, make_feature_collection, make_geojson_feature

router = APIRouter()

def zone_to_response(zone: ParkingZone) -> Dict[str, Any]:
    """Convert zone model to response dict with GeoJSON"""
    tariff = None
    if zone.tariff_schedule:
        tariff = {
            "schedule_id": zone.tariff_schedule.tariff_schedule_id,
            "name": zone.tariff_schedule.name,
            "hourly_rate": float(zone.tariff_schedule.hourly_rate),
            "currency": zone.tariff_schedule.currency,
            "valid_from_time": str(zone.tariff_schedule.valid_from_time) if zone.tariff_schedule.valid_from_time else None,
            "valid_to_time": str(zone.tariff_schedule.valid_to_time) if zone.tariff_schedule.valid_to_time else None,
            "valid_days": zone.tariff_schedule.valid_days,
        }
    return {
        "zone_id": zone.zone_id,
        "name": zone.name,
        "zone_type": zone.zone_type,
        "max_duration_minutes": zone.max_duration_minutes,
        "tariff_schedule_id": zone.tariff_schedule_id,
        "tariff": tariff,
        "is_active": zone.is_active,
        "created_at": zone.created_at,
        "updated_at": zone.updated_at,
        "geom": geom_to_geojson(zone.geom)
    }

@router.get("/", response_model=List[Dict[str, Any]])
async def get_zones(
    skip: int = 0,
    limit: int = 5000,
    is_active: Optional[bool] = None,
    zone_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get all parking zones with optional filters
    """
    query = db.query(ParkingZone).options(joinedload(ParkingZone.tariff_schedule))
    
    if is_active is not None:
        query = query.filter(ParkingZone.is_active == is_active)
    
    if zone_type:
        query = query.filter(ParkingZone.zone_type == zone_type)
    
    zones = query.offset(skip).limit(limit).all()
    return [zone_to_response(z) for z in zones]

@router.get("/geojson")
async def get_zones_geojson(
    is_active: Optional[bool] = True,
    db: Session = Depends(get_db)
):
    """
    Get all parking zones as GeoJSON FeatureCollection
    """
    query = db.query(ParkingZone)
    
    if is_active is not None:
        query = query.filter(ParkingZone.is_active == is_active)
    
    zones = query.all()
    
    features = []
    for zone in zones:
        geom = geom_to_geojson(zone.geom)
        if geom:
            features.append(make_geojson_feature(
                geom,
                {
                    "zone_id": zone.zone_id,
                    "name": zone.name,
                    "zone_type": zone.zone_type,
                    "max_duration_minutes": zone.max_duration_minutes,
                    "tariff_schedule_id": zone.tariff_schedule_id,
                    "is_active": zone.is_active
                }
            ))
    
    return make_feature_collection(features)

@router.get("/near")
async def get_zones_near(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: float = Query(default=500, ge=50, le=5000, description="Radius in meters"),
    db: Session = Depends(get_db)
):
    """
    Find parking zones within radius of a point
    """
    query = text("""
        SELECT 
            zone_id,
            name,
            zone_type,
            max_duration_minutes,
            tariff_schedule_id,
            is_active,
            ST_Distance(
                geom::geography,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
            ) as distance_meters,
            ST_AsGeoJSON(geom)::json as geom
        FROM parking_zones
        WHERE is_active = true
          AND ST_DWithin(
              geom::geography,
              ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
              :radius
          )
        ORDER BY distance_meters
    """)
    
    result = db.execute(query, {"lat": lat, "lng": lng, "radius": radius})
    rows = result.fetchall()
    
    features = []
    for row in rows:
        features.append(make_geojson_feature(
            row.geom,
            {
                "zone_id": row.zone_id,
                "name": row.name,
                "zone_type": row.zone_type,
                "max_duration_minutes": row.max_duration_minutes,
                "distance_meters": round(row.distance_meters, 2)
            }
        ))
    
    return make_feature_collection(features)

@router.get("/{zone_id}")
async def get_zone(zone_id: int, db: Session = Depends(get_db)):
    """
    Get a specific parking zone by ID
    """
    zone = db.query(ParkingZone).filter(ParkingZone.zone_id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    return zone_to_response(zone)

@router.get("/{zone_id}/occupancy", response_model=ZoneOccupancy)
async def get_zone_occupancy(zone_id: int, db: Session = Depends(get_db)):
    """
    Get occupancy statistics for a parking zone
    """
    zone = db.query(ParkingZone).filter(ParkingZone.zone_id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    query = text("""
        SELECT * FROM calculate_zone_occupancy(:zone_id)
    """)
    
    result = db.execute(query, {"zone_id": zone_id})
    row = result.fetchone()
    
    return {
        "zone_id": zone_id,
        "zone_name": zone.name,
        "total_bays": row.total_bays,
        "available_bays": row.available_bays,
        "occupied_bays": row.occupied_bays,
        "reserved_bays": row.reserved_bays,
        "closed_bays": row.closed_bays,
        "occupancy_percent": float(row.occupancy_percent) if row.occupancy_percent else 0.0
    }

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_zone(
    zone_data: ParkingZoneCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_staff)
):
    """
    Create a new parking zone (operator/officer/admin)
    
    GEOMETRY REQUIREMENT: geom must be a valid GeoJSON Polygon with SRID 4326
    """
    # Validate geometry type (Pydantic schema enforces Polygon but double-check)
    geom_dict = zone_data.geom.model_dump()
    if geom_dict.get("type") != "Polygon":
        raise HTTPException(
            status_code=400, 
            detail=f"ParkingZone geometry must be Polygon, got {geom_dict.get('type')}"
        )
    
    # Convert GeoJSON to PostGIS geometry
    geojson_str = json.dumps(geom_dict)
    
    try:
        # Insert using raw SQL for proper geometry handling
        query = text("""
            INSERT INTO parking_zones (name, zone_type, max_duration_minutes, tariff_schedule_id, is_active, geom)
            VALUES (:name, :zone_type, :max_duration, :tariff_id, :is_active, ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326))
            RETURNING zone_id, name, zone_type, max_duration_minutes, tariff_schedule_id, is_active, 
                      created_at, updated_at, ST_AsGeoJSON(geom)::json as geom
        """)
        
        result = db.execute(query, {
            "name": zone_data.name,
            "zone_type": zone_data.zone_type,
            "max_duration": zone_data.max_duration_minutes,
            "tariff_id": zone_data.tariff_schedule_id,
            "is_active": zone_data.is_active,
            "geom": geojson_str
        })
        
        row = result.fetchone()
        db.commit()
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        if "chk_parking_zones_geom_type" in error_msg:
            raise HTTPException(status_code=400, detail="Geometry must be a Polygon")
        if "chk_parking_zones_geom_srid" in error_msg:
            raise HTTPException(status_code=400, detail="Geometry must have SRID 4326")
        if "chk_parking_zones_geom_valid" in error_msg:
            raise HTTPException(status_code=400, detail="Geometry is not valid")
        raise HTTPException(status_code=400, detail=f"Failed to create zone: {error_msg}")
    
    return {
        "zone_id": row.zone_id,
        "name": row.name,
        "zone_type": row.zone_type,
        "max_duration_minutes": row.max_duration_minutes,
        "tariff_schedule_id": row.tariff_schedule_id,
        "is_active": row.is_active,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "geom": row.geom
    }

@router.put("/{zone_id}")
async def update_zone(
    zone_id: int,
    zone_data: ParkingZoneUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_staff)
):
    """
    Update a parking zone (operator/officer/admin)
    """
    zone = db.query(ParkingZone).filter(ParkingZone.zone_id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    # Build dynamic update query
    updates = []
    params = {"zone_id": zone_id}
    
    if zone_data.name is not None:
        updates.append("name = :name")
        params["name"] = zone_data.name
    
    if zone_data.zone_type is not None:
        updates.append("zone_type = :zone_type")
        params["zone_type"] = zone_data.zone_type
    
    if zone_data.max_duration_minutes is not None:
        updates.append("max_duration_minutes = :max_duration")
        params["max_duration"] = zone_data.max_duration_minutes
    
    if zone_data.tariff_schedule_id is not None:
        updates.append("tariff_schedule_id = :tariff_id")
        params["tariff_id"] = zone_data.tariff_schedule_id
    
    if zone_data.is_active is not None:
        updates.append("is_active = :is_active")
        params["is_active"] = zone_data.is_active
    
    if zone_data.geom is not None:
        geojson_str = json.dumps(zone_data.geom.model_dump())
        updates.append("geom = ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326)")
        params["geom"] = geojson_str
    
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    query = text(f"""
        UPDATE parking_zones 
        SET {', '.join(updates)}, updated_at = NOW()
        WHERE zone_id = :zone_id
        RETURNING zone_id, name, zone_type, max_duration_minutes, tariff_schedule_id, is_active,
                  created_at, updated_at, ST_AsGeoJSON(geom)::json as geom
    """)
    
    result = db.execute(query, params)
    row = result.fetchone()
    db.commit()
    
    return {
        "zone_id": row.zone_id,
        "name": row.name,
        "zone_type": row.zone_type,
        "max_duration_minutes": row.max_duration_minutes,
        "tariff_schedule_id": row.tariff_schedule_id,
        "is_active": row.is_active,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "geom": row.geom
    }

@router.delete("/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_zone(
    zone_id: int,
    hard_delete: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_staff)
):
    """
    Delete/archive a parking zone (operator/officer/admin)
    
    By default performs soft delete (sets is_active=false).
    Set hard_delete=true to permanently remove.
    """
    zone = db.query(ParkingZone).filter(ParkingZone.zone_id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    if hard_delete:
        db.delete(zone)
    else:
        zone.is_active = False
    
    db.commit()
