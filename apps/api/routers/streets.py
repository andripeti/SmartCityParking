"""
Street Segments router
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
import json

from database import get_db
from models import User, StreetSegment
from schemas import StreetSegmentCreate, StreetSegmentResponse
from auth import get_current_user, get_operator
from geo_utils import geom_to_geojson, make_feature_collection, make_geojson_feature

router = APIRouter()

def street_to_response(street: StreetSegment) -> Dict[str, Any]:
    """Convert street model to response dict with GeoJSON"""
    return {
        "street_id": street.street_id,
        "name": street.name,
        "road_type": street.road_type,
        "speed_limit_kph": street.speed_limit_kph,
        "created_at": street.created_at,
        "updated_at": street.updated_at,
        "geom": geom_to_geojson(street.geom)
    }

@router.get("/")
async def get_streets(
    skip: int = 0,
    limit: int = 100,
    road_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get all street segments with optional filters
    """
    query = db.query(StreetSegment)
    
    if road_type:
        query = query.filter(StreetSegment.road_type == road_type)
    
    streets = query.offset(skip).limit(limit).all()
    return [street_to_response(s) for s in streets]

@router.get("/geojson")
async def get_streets_geojson(
    road_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get all street segments as GeoJSON FeatureCollection
    """
    query = db.query(StreetSegment)
    
    if road_type:
        query = query.filter(StreetSegment.road_type == road_type)
    
    streets = query.all()
    
    features = []
    for street in streets:
        geom = geom_to_geojson(street.geom)
        if geom:
            features.append(make_geojson_feature(
                geom,
                {
                    "street_id": street.street_id,
                    "name": street.name,
                    "road_type": street.road_type,
                    "speed_limit_kph": street.speed_limit_kph
                }
            ))
    
    return make_feature_collection(features)

@router.get("/{street_id}")
async def get_street(street_id: int, db: Session = Depends(get_db)):
    """
    Get a specific street segment by ID
    """
    street = db.query(StreetSegment).filter(StreetSegment.street_id == street_id).first()
    if not street:
        raise HTTPException(status_code=404, detail="Street segment not found")
    
    return street_to_response(street)

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_street(
    street_data: StreetSegmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_operator)
):
    """
    Create a new street segment (operator/admin only)
    """
    geojson_str = json.dumps(street_data.geom.model_dump())
    
    query = text("""
        INSERT INTO street_segments (name, road_type, speed_limit_kph, geom)
        VALUES (:name, :road_type, :speed_limit, ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326))
        RETURNING street_id, name, road_type, speed_limit_kph, created_at, updated_at, ST_AsGeoJSON(geom)::json as geom
    """)
    
    result = db.execute(query, {
        "name": street_data.name,
        "road_type": street_data.road_type,
        "speed_limit": street_data.speed_limit_kph,
        "geom": geojson_str
    })
    
    row = result.fetchone()
    db.commit()
    
    return {
        "street_id": row.street_id,
        "name": row.name,
        "road_type": row.road_type,
        "speed_limit_kph": row.speed_limit_kph,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "geom": row.geom
    }

@router.delete("/{street_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_street(
    street_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_operator)
):
    """
    Delete a street segment (operator/admin only)
    """
    street = db.query(StreetSegment).filter(StreetSegment.street_id == street_id).first()
    if not street:
        raise HTTPException(status_code=404, detail="Street segment not found")
    
    db.delete(street)
    db.commit()
