"""
Parking Bays router with spatial operations
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
import json

from database import get_db
from models import User, ParkingBay, ParkingZone
from schemas import ParkingBayCreate, ParkingBayUpdate, BaySearchResult
from auth import get_current_user, get_operator
from geo_utils import geom_to_geojson, make_feature_collection, make_geojson_feature

router = APIRouter()

def bay_to_response(bay: ParkingBay) -> Dict[str, Any]:
    """Convert bay model to response dict with GeoJSON"""
    return {
        "bay_id": bay.bay_id,
        "zone_id": bay.zone_id,
        "bay_number": bay.bay_number,
        "is_disabled_only": bay.is_disabled_only,
        "is_electric": bay.is_electric,
        "status": bay.status,
        "last_status_update": bay.last_status_update,
        "created_at": bay.created_at,
        "updated_at": bay.updated_at,
        "geom": geom_to_geojson(bay.geom)
    }

@router.get("/")
async def get_bays(
    skip: int = 0,
    limit: int = 100,
    zone_id: Optional[int] = None,
    status: Optional[str] = None,
    is_disabled_only: Optional[bool] = None,
    is_electric: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """
    Get all parking bays with optional filters
    """
    query = db.query(ParkingBay)
    
    if zone_id is not None:
        query = query.filter(ParkingBay.zone_id == zone_id)
    
    if status:
        query = query.filter(ParkingBay.status == status)
    
    if is_disabled_only is not None:
        query = query.filter(ParkingBay.is_disabled_only == is_disabled_only)
    
    if is_electric is not None:
        query = query.filter(ParkingBay.is_electric == is_electric)
    
    bays = query.offset(skip).limit(limit).all()
    return [bay_to_response(b) for b in bays]

@router.get("/geojson")
async def get_bays_geojson(
    zone_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get all parking bays as GeoJSON FeatureCollection
    """
    query = db.query(ParkingBay).join(ParkingZone).filter(ParkingZone.is_active == True)
    
    if zone_id is not None:
        query = query.filter(ParkingBay.zone_id == zone_id)
    
    if status:
        query = query.filter(ParkingBay.status == status)
    
    bays = query.all()
    
    features = []
    for bay in bays:
        geom = geom_to_geojson(bay.geom)
        if geom:
            features.append(make_geojson_feature(
                geom,
                {
                    "bay_id": bay.bay_id,
                    "zone_id": bay.zone_id,
                    "bay_number": bay.bay_number,
                    "is_disabled_only": bay.is_disabled_only,
                    "is_electric": bay.is_electric,
                    "status": bay.status,
                    "last_status_update": bay.last_status_update.isoformat() if bay.last_status_update else None
                }
            ))
    
    return make_feature_collection(features)

@router.get("/near")
async def get_bays_near(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: float = Query(default=300, ge=50, le=2000, description="Radius in meters"),
    status: Optional[str] = Query(default="available"),
    limit: int = Query(default=200, ge=10, le=500, description="Maximum number of results"),
    db: Session = Depends(get_db)
):
    """
    Find available parking bays within radius of a destination point
    
    This is the primary driver-facing search endpoint.
    """
    params = {"lat": lat, "lng": lng, "radius": radius, "limit": limit}
    
    status_filter = ""
    if status:
        status_filter = "AND pb.status = :status"
        params["status"] = status
    
    query = text(f"""
        SELECT 
            pb.bay_id,
            pb.bay_number,
            pb.zone_id,
            pz.name as zone_name,
            pb.status,
            pb.is_disabled_only,
            pb.is_electric,
            pb.last_status_update,
            ST_Distance(
                pb.geom::geography,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
            ) as distance_meters,
            ST_AsGeoJSON(pb.geom)::json as geom,
            ST_AsGeoJSON(ST_PointOnSurface(pb.geom))::json as centroid
        FROM parking_bays pb
        JOIN parking_zones pz ON pb.zone_id = pz.zone_id
        WHERE pz.is_active = true
          {status_filter}
          AND ST_DWithin(
              pb.geom::geography,
              ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
              :radius
          )
        ORDER BY distance_meters
        LIMIT :limit
    """)
    
    result = db.execute(query, params)
    rows = result.fetchall()
    
    features = []
    items = []
    
    for row in rows:
        feature = make_geojson_feature(
            row.geom,
            {
                "bay_id": row.bay_id,
                "bay_number": row.bay_number,
                "zone_id": row.zone_id,
                "zone_name": row.zone_name,
                "status": row.status,
                "is_disabled_only": row.is_disabled_only,
                "is_electric": row.is_electric,
                "distance_meters": round(row.distance_meters, 2)
            }
        )
        features.append(feature)
        
        items.append({
            "bay_id": row.bay_id,
            "bay_number": row.bay_number,
            "zone_id": row.zone_id,
            "zone_name": row.zone_name,
            "status": row.status,
            "is_disabled_only": row.is_disabled_only,
            "is_electric": row.is_electric,
            "distance_meters": round(row.distance_meters, 2),
            "geom": row.centroid  # Use centroid Point for marker placement
        })
    
    return {
        "type": "FeatureCollection",
        "features": features,
        "items": items,
        "total": len(items),
        "search_point": {"lat": lat, "lng": lng},
        "radius_meters": radius
    }

@router.get("/by-street/{street_id}")
async def get_bays_by_street(
    street_id: int,
    disabled_only: bool = Query(default=False),
    buffer_meters: float = Query(default=50, ge=10, le=200),
    db: Session = Depends(get_db)
):
    """
    Find parking bays along a street segment
    
    Optionally filter to only disabled bays.
    """
    params = {"street_id": street_id, "buffer": buffer_meters}
    
    disabled_filter = ""
    if disabled_only:
        disabled_filter = "AND pb.is_disabled_only = true"
    
    query = text(f"""
        SELECT 
            pb.bay_id,
            pb.bay_number,
            pb.zone_id,
            pz.name as zone_name,
            pb.status,
            pb.is_disabled_only,
            pb.is_electric,
            ST_Distance(pb.geom::geography, ss.geom::geography) as distance_to_street,
            ST_AsGeoJSON(pb.geom)::json as geom
        FROM parking_bays pb
        JOIN parking_zones pz ON pb.zone_id = pz.zone_id
        JOIN street_segments ss ON ss.street_id = :street_id
        WHERE pz.is_active = true
          AND ST_DWithin(pb.geom::geography, ss.geom::geography, :buffer)
          {disabled_filter}
        ORDER BY distance_to_street
    """)
    
    result = db.execute(query, params)
    rows = result.fetchall()
    
    features = []
    for row in rows:
        features.append(make_geojson_feature(
            row.geom,
            {
                "bay_id": row.bay_id,
                "bay_number": row.bay_number,
                "zone_id": row.zone_id,
                "zone_name": row.zone_name,
                "status": row.status,
                "is_disabled_only": row.is_disabled_only,
                "is_electric": row.is_electric,
                "distance_to_street": round(row.distance_to_street, 2)
            }
        ))
    
    return make_feature_collection(features)

@router.get("/{bay_id}")
async def get_bay(bay_id: int, db: Session = Depends(get_db)):
    """
    Get a specific parking bay by ID
    """
    bay = db.query(ParkingBay).filter(ParkingBay.bay_id == bay_id).first()
    if not bay:
        raise HTTPException(status_code=404, detail="Bay not found")
    
    return bay_to_response(bay)

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_bay(
    bay_data: ParkingBayCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_operator)
):
    """
    Create a new parking bay (operator/admin only)
    
    GEOMETRY REQUIREMENT: geom must be a valid GeoJSON Polygon with SRID 4326
    If geom is not provided, it will be auto-generated inside the parent zone
    SPATIAL VALIDATION: Bay must be contained within its parent zone
    """
    # Verify zone exists
    zone = db.query(ParkingZone).filter(ParkingZone.zone_id == bay_data.zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    # If geometry not provided, auto-generate a small polygon inside the zone
    if not bay_data.geom:
        # Generate a small bay polygon at a point inside the zone
        result = db.execute(text("""
            SELECT ST_AsGeoJSON(
                ST_Buffer(ST_PointOnSurface(geom), 0.00003)
            )::json as geom
            FROM parking_zones WHERE zone_id = :zone_id
        """), {"zone_id": bay_data.zone_id})
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Could not generate bay geometry")
        geojson_str = json.dumps(row.geom)
    else:
        # Validate geometry type (Pydantic schema enforces Polygon but double-check)
        geom_dict = bay_data.geom.model_dump()
        if geom_dict.get("type") != "Polygon":
            raise HTTPException(
                status_code=400, 
                detail=f"ParkingBay geometry must be Polygon, got {geom_dict.get('type')}"
            )
        geojson_str = json.dumps(geom_dict)
    
    # Insert with spatial validation (trigger will check containment)
    query = text("""
        INSERT INTO parking_bays (zone_id, bay_number, is_disabled_only, is_electric, status, geom)
        VALUES (:zone_id, :bay_number, :is_disabled, :is_electric, :status, ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326))
        RETURNING bay_id, zone_id, bay_number, is_disabled_only, is_electric, status,
                  last_status_update, created_at, updated_at, ST_AsGeoJSON(geom)::json as geom
    """)
    
    try:
        result = db.execute(query, {
            "zone_id": bay_data.zone_id,
            "bay_number": bay_data.bay_number,
            "is_disabled": bay_data.is_disabled_only,
            "is_electric": bay_data.is_electric,
            "status": bay_data.status,
            "geom": geojson_str
        })
        row = result.fetchone()
        db.commit()
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        if "contained within" in error_msg or "must be contained" in error_msg:
            raise HTTPException(
                status_code=400,
                detail="Bay geometry must be contained within the parent zone"
            )
        if "chk_parking_bays_geom_type" in error_msg or "must be POLYGON" in error_msg:
            raise HTTPException(status_code=400, detail="Geometry must be a Polygon")
        if "chk_parking_bays_geom_srid" in error_msg:
            raise HTTPException(status_code=400, detail="Geometry must have SRID 4326")
        if "chk_parking_bays_geom_valid" in error_msg or "is not valid" in error_msg:
            raise HTTPException(status_code=400, detail="Geometry is not valid")
        raise HTTPException(status_code=400, detail=f"Failed to create bay: {error_msg}")
    
    return {
        "bay_id": row.bay_id,
        "zone_id": row.zone_id,
        "bay_number": row.bay_number,
        "is_disabled_only": row.is_disabled_only,
        "is_electric": row.is_electric,
        "status": row.status,
        "last_status_update": row.last_status_update,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "geom": row.geom
    }

@router.put("/{bay_id}")
async def update_bay(
    bay_id: int,
    bay_data: ParkingBayUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_operator)
):
    """
    Update a parking bay (operator/admin only)
    """
    bay = db.query(ParkingBay).filter(ParkingBay.bay_id == bay_id).first()
    if not bay:
        raise HTTPException(status_code=404, detail="Bay not found")
    
    updates = []
    params = {"bay_id": bay_id}
    
    if bay_data.zone_id is not None:
        updates.append("zone_id = :zone_id")
        params["zone_id"] = bay_data.zone_id
    
    if bay_data.bay_number is not None:
        updates.append("bay_number = :bay_number")
        params["bay_number"] = bay_data.bay_number
    
    if bay_data.is_disabled_only is not None:
        updates.append("is_disabled_only = :is_disabled")
        params["is_disabled"] = bay_data.is_disabled_only
    
    if bay_data.is_electric is not None:
        updates.append("is_electric = :is_electric")
        params["is_electric"] = bay_data.is_electric
    
    if bay_data.status is not None:
        updates.append("status = :status")
        updates.append("last_status_update = NOW()")
        params["status"] = bay_data.status
    
    if bay_data.geom is not None:
        geojson_str = json.dumps(bay_data.geom.model_dump())
        updates.append("geom = ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326)")
        params["geom"] = geojson_str
    
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    query = text(f"""
        UPDATE parking_bays 
        SET {', '.join(updates)}, updated_at = NOW()
        WHERE bay_id = :bay_id
        RETURNING bay_id, zone_id, bay_number, is_disabled_only, is_electric, status,
                  last_status_update, created_at, updated_at, ST_AsGeoJSON(geom)::json as geom
    """)
    
    try:
        result = db.execute(query, params)
        row = result.fetchone()
        db.commit()
    except Exception as e:
        db.rollback()
        if "contained within" in str(e):
            raise HTTPException(
                status_code=400,
                detail="Bay geometry must be contained within the parent zone"
            )
        raise HTTPException(status_code=400, detail=str(e))
    
    return {
        "bay_id": row.bay_id,
        "zone_id": row.zone_id,
        "bay_number": row.bay_number,
        "is_disabled_only": row.is_disabled_only,
        "is_electric": row.is_electric,
        "status": row.status,
        "last_status_update": row.last_status_update,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "geom": row.geom
    }

@router.delete("/{bay_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bay(
    bay_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_operator)
):
    """
    Delete a parking bay (operator/admin only)
    """
    bay = db.query(ParkingBay).filter(ParkingBay.bay_id == bay_id).first()
    if not bay:
        raise HTTPException(status_code=404, detail="Bay not found")
    
    db.delete(bay)
    db.commit()

@router.patch("/{bay_id}/status")
async def update_bay_status(
    bay_id: int,
    status: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_operator)
):
    """
    Quick update of bay status (operator/admin only)
    """
    allowed_statuses = ["available", "occupied", "closed", "reserved"]
    if status not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {allowed_statuses}")
    
    bay = db.query(ParkingBay).filter(ParkingBay.bay_id == bay_id).first()
    if not bay:
        raise HTTPException(status_code=404, detail="Bay not found")
    
    query = text("""
        UPDATE parking_bays 
        SET status = :status, last_status_update = NOW(), updated_at = NOW()
        WHERE bay_id = :bay_id
        RETURNING bay_id, status, last_status_update
    """)
    
    result = db.execute(query, {"bay_id": bay_id, "status": status})
    row = result.fetchone()
    db.commit()
    
    return {
        "bay_id": row.bay_id,
        "status": row.status,
        "last_status_update": row.last_status_update
    }
