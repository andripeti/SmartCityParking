"""
Payment Terminals router
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
import json

from database import get_db
from models import User, PaymentTerminal
from schemas import PaymentTerminalCreate, PaymentTerminalUpdate, PaymentTerminalResponse
from auth import get_current_user, get_operator
from geo_utils import geom_to_geojson, make_feature_collection, make_geojson_feature

router = APIRouter()

def terminal_to_response(terminal: PaymentTerminal) -> Dict[str, Any]:
    """Convert terminal model to response dict with GeoJSON"""
    return {
        "terminal_id": terminal.terminal_id,
        "zone_id": terminal.zone_id,
        "terminal_code": terminal.terminal_code,
        "status": terminal.status,
        "installation_date": terminal.installation_date,
        "created_at": terminal.created_at,
        "updated_at": terminal.updated_at,
        "geom": geom_to_geojson(terminal.geom)
    }

@router.get("/")
async def get_terminals(
    skip: int = 0,
    limit: int = 100,
    zone_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get all payment terminals with optional filters
    """
    query = db.query(PaymentTerminal)
    
    if zone_id is not None:
        query = query.filter(PaymentTerminal.zone_id == zone_id)
    
    if status:
        query = query.filter(PaymentTerminal.status == status)
    
    terminals = query.offset(skip).limit(limit).all()
    return [terminal_to_response(t) for t in terminals]

@router.get("/geojson")
async def get_terminals_geojson(
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get all payment terminals as GeoJSON FeatureCollection
    """
    query = db.query(PaymentTerminal)
    
    if status:
        query = query.filter(PaymentTerminal.status == status)
    
    terminals = query.all()
    
    features = []
    for terminal in terminals:
        geom = geom_to_geojson(terminal.geom)
        if geom:
            features.append(make_geojson_feature(
                geom,
                {
                    "terminal_id": terminal.terminal_id,
                    "zone_id": terminal.zone_id,
                    "terminal_code": terminal.terminal_code,
                    "status": terminal.status
                }
            ))
    
    return make_feature_collection(features)

@router.get("/nearest")
async def get_nearest_terminal(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    db: Session = Depends(get_db)
):
    """
    Find the nearest operational payment terminal to a point
    """
    query = text("""
        SELECT 
            terminal_id, zone_id, terminal_code, status,
            ST_Distance(
                geom::geography,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
            ) as distance_meters,
            ST_AsGeoJSON(geom)::json as geom
        FROM payment_terminals
        WHERE status = 'operational'
        ORDER BY distance_meters
        LIMIT 1
    """)
    
    result = db.execute(query, {"lat": lat, "lng": lng})
    row = result.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="No operational terminal found")
    
    return {
        "terminal_id": row.terminal_id,
        "zone_id": row.zone_id,
        "terminal_code": row.terminal_code,
        "status": row.status,
        "distance_meters": round(row.distance_meters, 2),
        "geom": row.geom
    }

@router.get("/{terminal_id}")
async def get_terminal(terminal_id: int, db: Session = Depends(get_db)):
    """
    Get a specific payment terminal by ID
    """
    terminal = db.query(PaymentTerminal).filter(PaymentTerminal.terminal_id == terminal_id).first()
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")
    
    return terminal_to_response(terminal)

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_terminal(
    terminal_data: PaymentTerminalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_operator)
):
    """
    Create a new payment terminal (operator/admin only)
    """
    # Check terminal code uniqueness
    existing = db.query(PaymentTerminal).filter(
        PaymentTerminal.terminal_code == terminal_data.terminal_code
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Terminal code already exists")
    
    geojson_str = json.dumps(terminal_data.geom.model_dump())
    
    query = text("""
        INSERT INTO payment_terminals (zone_id, terminal_code, status, installation_date, geom)
        VALUES (:zone_id, :terminal_code, :status, :install_date, ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326))
        RETURNING terminal_id, zone_id, terminal_code, status, installation_date,
                  created_at, updated_at, ST_AsGeoJSON(geom)::json as geom
    """)
    
    result = db.execute(query, {
        "zone_id": terminal_data.zone_id,
        "terminal_code": terminal_data.terminal_code,
        "status": terminal_data.status,
        "install_date": terminal_data.installation_date,
        "geom": geojson_str
    })
    
    row = result.fetchone()
    db.commit()
    
    return {
        "terminal_id": row.terminal_id,
        "zone_id": row.zone_id,
        "terminal_code": row.terminal_code,
        "status": row.status,
        "installation_date": row.installation_date,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "geom": row.geom
    }

@router.put("/{terminal_id}")
async def update_terminal(
    terminal_id: int,
    terminal_data: PaymentTerminalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_operator)
):
    """
    Update a payment terminal (operator/admin only)
    """
    terminal = db.query(PaymentTerminal).filter(PaymentTerminal.terminal_id == terminal_id).first()
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")
    
    updates = []
    params = {"terminal_id": terminal_id}
    
    if terminal_data.zone_id is not None:
        updates.append("zone_id = :zone_id")
        params["zone_id"] = terminal_data.zone_id
    
    if terminal_data.terminal_code is not None:
        # Check uniqueness
        existing = db.query(PaymentTerminal).filter(
            PaymentTerminal.terminal_code == terminal_data.terminal_code,
            PaymentTerminal.terminal_id != terminal_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Terminal code already exists")
        updates.append("terminal_code = :terminal_code")
        params["terminal_code"] = terminal_data.terminal_code
    
    if terminal_data.status is not None:
        updates.append("status = :status")
        params["status"] = terminal_data.status
    
    if terminal_data.geom is not None:
        geojson_str = json.dumps(terminal_data.geom.model_dump())
        updates.append("geom = ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326)")
        params["geom"] = geojson_str
    
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    query = text(f"""
        UPDATE payment_terminals 
        SET {', '.join(updates)}, updated_at = NOW()
        WHERE terminal_id = :terminal_id
        RETURNING terminal_id, zone_id, terminal_code, status, installation_date,
                  created_at, updated_at, ST_AsGeoJSON(geom)::json as geom
    """)
    
    result = db.execute(query, params)
    row = result.fetchone()
    db.commit()
    
    return {
        "terminal_id": row.terminal_id,
        "zone_id": row.zone_id,
        "terminal_code": row.terminal_code,
        "status": row.status,
        "installation_date": row.installation_date,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "geom": row.geom
    }

@router.delete("/{terminal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_terminal(
    terminal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_operator)
):
    """
    Delete a payment terminal (operator/admin only)
    """
    terminal = db.query(PaymentTerminal).filter(PaymentTerminal.terminal_id == terminal_id).first()
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")
    
    db.delete(terminal)
    db.commit()
