"""
Sensors router
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
import json

from database import get_db
from models import User, Sensor
from schemas import SensorCreate, SensorUpdate, SensorResponse
from auth import get_current_user, get_operator
from geo_utils import geom_to_geojson, make_feature_collection, make_geojson_feature

router = APIRouter()

def sensor_to_response(sensor: Sensor) -> Dict[str, Any]:
    """Convert sensor model to response dict with GeoJSON"""
    return {
        "sensor_id": sensor.sensor_id,
        "bay_id": sensor.bay_id,
        "sensor_type": sensor.sensor_type,
        "installation_date": sensor.installation_date,
        "is_active": sensor.is_active,
        "battery_level_percent": sensor.battery_level_percent,
        "created_at": sensor.created_at,
        "updated_at": sensor.updated_at,
        "geom": geom_to_geojson(sensor.geom)
    }

@router.get("/")
async def get_sensors(
    skip: int = 0,
    limit: int = 100,
    bay_id: Optional[int] = None,
    sensor_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """
    Get all sensors with optional filters
    """
    query = db.query(Sensor)
    
    if bay_id is not None:
        query = query.filter(Sensor.bay_id == bay_id)
    
    if sensor_type:
        query = query.filter(Sensor.sensor_type == sensor_type)
    
    if is_active is not None:
        query = query.filter(Sensor.is_active == is_active)
    
    sensors = query.offset(skip).limit(limit).all()
    return [sensor_to_response(s) for s in sensors]

@router.get("/geojson")
async def get_sensors_geojson(
    is_active: Optional[bool] = True,
    db: Session = Depends(get_db)
):
    """
    Get all sensors as GeoJSON FeatureCollection
    """
    query = db.query(Sensor)
    
    if is_active is not None:
        query = query.filter(Sensor.is_active == is_active)
    
    sensors = query.all()
    
    features = []
    for sensor in sensors:
        geom = geom_to_geojson(sensor.geom)
        if geom:
            features.append(make_geojson_feature(
                geom,
                {
                    "sensor_id": sensor.sensor_id,
                    "bay_id": sensor.bay_id,
                    "sensor_type": sensor.sensor_type,
                    "is_active": sensor.is_active,
                    "battery_level_percent": sensor.battery_level_percent
                }
            ))
    
    return make_feature_collection(features)

@router.get("/low-battery")
async def get_low_battery_sensors(
    threshold: int = Query(default=20, ge=0, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_operator)
):
    """
    Get sensors with low battery (operator/admin only)
    """
    query = text("""
        SELECT 
            sensor_id, bay_id, sensor_type, battery_level_percent,
            is_active, ST_AsGeoJSON(geom)::json as geom
        FROM sensors
        WHERE is_active = true
          AND battery_level_percent IS NOT NULL
          AND battery_level_percent <= :threshold
        ORDER BY battery_level_percent ASC
    """)
    
    result = db.execute(query, {"threshold": threshold})
    rows = result.fetchall()
    
    features = []
    for row in rows:
        features.append(make_geojson_feature(
            row.geom,
            {
                "sensor_id": row.sensor_id,
                "bay_id": row.bay_id,
                "sensor_type": row.sensor_type,
                "battery_level_percent": row.battery_level_percent
            }
        ))
    
    return make_feature_collection(features)

@router.get("/{sensor_id}")
async def get_sensor(sensor_id: int, db: Session = Depends(get_db)):
    """
    Get a specific sensor by ID
    """
    sensor = db.query(Sensor).filter(Sensor.sensor_id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    
    return sensor_to_response(sensor)

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_sensor(
    sensor_data: SensorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_operator)
):
    """
    Create a new sensor (operator/admin only)
    
    GEOMETRY REQUIREMENT: geom must be a valid GeoJSON Point with SRID 4326
    SPATIAL VALIDATION: If bay_id is provided, sensor must be within 3m of the bay
    """
    # Validate geometry type (Pydantic schema enforces Point but double-check)
    geom_dict = sensor_data.geom.model_dump()
    if geom_dict.get("type") != "Point":
        raise HTTPException(
            status_code=400, 
            detail=f"Sensor geometry must be Point, got {geom_dict.get('type')}"
        )
    
    geojson_str = json.dumps(geom_dict)
    
    query = text("""
        INSERT INTO sensors (bay_id, sensor_type, installation_date, is_active, battery_level_percent, geom)
        VALUES (:bay_id, :sensor_type, :install_date, :is_active, :battery, ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326))
        RETURNING sensor_id, bay_id, sensor_type, installation_date, is_active, battery_level_percent,
                  created_at, updated_at, ST_AsGeoJSON(geom)::json as geom
    """)
    
    try:
        result = db.execute(query, {
            "bay_id": sensor_data.bay_id,
            "sensor_type": sensor_data.sensor_type,
            "install_date": sensor_data.installation_date,
            "is_active": sensor_data.is_active,
            "battery": sensor_data.battery_level_percent,
            "geom": geojson_str
        })
        row = result.fetchone()
        db.commit()
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        if "within" in error_msg.lower() or "meters of" in error_msg:
            raise HTTPException(
                status_code=400,
                detail="Sensor must be within 3 meters of its associated bay"
            )
        if "chk_sensors_geom_type" in error_msg or "must be POINT" in error_msg:
            raise HTTPException(status_code=400, detail="Geometry must be a Point")
        if "chk_sensors_geom_srid" in error_msg:
            raise HTTPException(status_code=400, detail="Geometry must have SRID 4326")
        raise HTTPException(status_code=400, detail=f"Failed to create sensor: {error_msg}")
    
    return {
        "sensor_id": row.sensor_id,
        "bay_id": row.bay_id,
        "sensor_type": row.sensor_type,
        "installation_date": row.installation_date,
        "is_active": row.is_active,
        "battery_level_percent": row.battery_level_percent,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "geom": row.geom
    }

@router.put("/{sensor_id}")
async def update_sensor(
    sensor_id: int,
    sensor_data: SensorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_operator)
):
    """
    Update a sensor (operator/admin only)
    """
    sensor = db.query(Sensor).filter(Sensor.sensor_id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    
    updates = []
    params = {"sensor_id": sensor_id}
    
    if sensor_data.bay_id is not None:
        updates.append("bay_id = :bay_id")
        params["bay_id"] = sensor_data.bay_id
    
    if sensor_data.sensor_type is not None:
        updates.append("sensor_type = :sensor_type")
        params["sensor_type"] = sensor_data.sensor_type
    
    if sensor_data.is_active is not None:
        updates.append("is_active = :is_active")
        params["is_active"] = sensor_data.is_active
    
    if sensor_data.battery_level_percent is not None:
        updates.append("battery_level_percent = :battery")
        params["battery"] = sensor_data.battery_level_percent
    
    if sensor_data.geom is not None:
        geojson_str = json.dumps(sensor_data.geom.model_dump())
        updates.append("geom = ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326)")
        params["geom"] = geojson_str
    
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    query = text(f"""
        UPDATE sensors 
        SET {', '.join(updates)}, updated_at = NOW()
        WHERE sensor_id = :sensor_id
        RETURNING sensor_id, bay_id, sensor_type, installation_date, is_active, battery_level_percent,
                  created_at, updated_at, ST_AsGeoJSON(geom)::json as geom
    """)
    
    try:
        result = db.execute(query, params)
        row = result.fetchone()
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    
    return {
        "sensor_id": row.sensor_id,
        "bay_id": row.bay_id,
        "sensor_type": row.sensor_type,
        "installation_date": row.installation_date,
        "is_active": row.is_active,
        "battery_level_percent": row.battery_level_percent,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "geom": row.geom
    }

@router.delete("/{sensor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sensor(
    sensor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_operator)
):
    """
    Delete a sensor (operator/admin only)
    """
    sensor = db.query(Sensor).filter(Sensor.sensor_id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    
    db.delete(sensor)
    db.commit()
