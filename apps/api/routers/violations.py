"""
Violations router
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from datetime import datetime, date
import json
import logging

from database import get_db
from models import User, Violation, ParkingBay, ParkingSession
from schemas import ViolationCreate, ViolationResponse, ViolationSearchRequest
from auth import get_current_user, get_officer
from geo_utils import geom_to_geojson, make_feature_collection, make_geojson_feature

router = APIRouter()
logger = logging.getLogger(__name__)

def violation_to_response(violation: Violation) -> Dict[str, Any]:
    """Convert violation model to response dict with GeoJSON"""
    return {
        "violation_id": violation.violation_id,
        "session_id": violation.session_id,
        "bay_id": violation.bay_id,
        "officer_id": violation.officer_id,
        "violation_type": violation.violation_type,
        "issued_at": violation.issued_at,
        "fine_amount": float(violation.fine_amount) if violation.fine_amount else 0,
        "notes": violation.notes,
        "created_at": violation.created_at,
        "geom": geom_to_geojson(violation.geom)
    }

@router.get("/")
async def get_violations(
    skip: int = 0,
    limit: int = 100,
    bay_id: Optional[int] = None,
    violation_type: Optional[str] = None,
    officer_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get violations with filters (officer/operator/admin)
    
    Drivers cannot access violation list.
    """
    if current_user.role == "driver":
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = db.query(Violation)
    
    if bay_id is not None:
        query = query.filter(Violation.bay_id == bay_id)
    
    if violation_type:
        query = query.filter(Violation.violation_type == violation_type)
    
    if officer_id is not None:
        query = query.filter(Violation.officer_id == officer_id)
    
    if start_date:
        query = query.filter(Violation.issued_at >= start_date)
    
    if end_date:
        query = query.filter(Violation.issued_at <= end_date)
    
    violations = query.order_by(Violation.issued_at.desc()).offset(skip).limit(limit).all()
    
    return [violation_to_response(v) for v in violations]

@router.get("/geojson")
async def get_violations_geojson(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    violation_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get violations as GeoJSON FeatureCollection
    """
    if current_user.role == "driver":
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = db.query(Violation)
    
    if start_date:
        query = query.filter(Violation.issued_at >= start_date)
    
    if end_date:
        query = query.filter(Violation.issued_at <= end_date)
    
    if violation_type:
        query = query.filter(Violation.violation_type == violation_type)
    
    violations = query.all()
    
    features = []
    for v in violations:
        geom = geom_to_geojson(v.geom)
        if geom:
            features.append(make_geojson_feature(
                geom,
                {
                    "violation_id": v.violation_id,
                    "violation_type": v.violation_type,
                    "bay_id": v.bay_id,
                    "officer_id": v.officer_id,
                    "fine_amount": float(v.fine_amount) if v.fine_amount else 0,
                    "issued_at": v.issued_at.isoformat() if v.issued_at else None
                }
            ))
    
    return make_feature_collection(features)

@router.post("/search")
async def search_violations(
    search_data: ViolationSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_officer)
):
    """
    Search violations within a polygon area during a time window
    
    This is the primary enforcement query for officers.
    """
    polygon_geojson = json.dumps(search_data.polygon.model_dump())
    
    query = text("""
        SELECT 
            v.violation_id,
            v.violation_type,
            v.bay_id,
            pb.bay_number,
            v.officer_id,
            u.full_name as officer_name,
            v.fine_amount,
            v.issued_at,
            v.notes,
            ST_AsGeoJSON(v.geom)::json as geom
        FROM violations v
        JOIN parking_bays pb ON v.bay_id = pb.bay_id
        JOIN users u ON v.officer_id = u.user_id
        WHERE ST_Contains(
            ST_SetSRID(ST_GeomFromGeoJSON(:polygon), 4326),
            v.geom
        )
        AND v.issued_at >= :start_time
        AND v.issued_at <= :end_time
        ORDER BY v.issued_at DESC
    """)
    
    result = db.execute(query, {
        "polygon": polygon_geojson,
        "start_time": search_data.start_time,
        "end_time": search_data.end_time
    })
    
    rows = result.fetchall()
    
    features = []
    items = []
    
    for row in rows:
        feature = make_geojson_feature(
            row.geom,
            {
                "violation_id": row.violation_id,
                "violation_type": row.violation_type,
                "bay_id": row.bay_id,
                "bay_number": row.bay_number,
                "officer_name": row.officer_name,
                "fine_amount": float(row.fine_amount),
                "issued_at": row.issued_at.isoformat()
            }
        )
        features.append(feature)
        
        items.append({
            "violation_id": row.violation_id,
            "violation_type": row.violation_type,
            "bay_id": row.bay_id,
            "bay_number": row.bay_number,
            "officer_id": row.officer_id,
            "officer_name": row.officer_name,
            "fine_amount": float(row.fine_amount),
            "issued_at": row.issued_at,
            "notes": row.notes
        })
    
    return {
        "type": "FeatureCollection",
        "features": features,
        "items": items,
        "total": len(items),
        "search_params": {
            "start_time": search_data.start_time.isoformat(),
            "end_time": search_data.end_time.isoformat()
        }
    }

@router.get("/my")
async def get_my_violations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get violations for the current driver
    
    Returns all violations associated with the driver's parking sessions.
    Drivers can only see their own violations.
    """
    try:
        # Get all violations where the session belongs to the current user
        query = text("""
            SELECT 
                v.violation_id,
                v.session_id,
                v.bay_id,
                pb.bay_number,
                v.officer_id,
                u.full_name as officer_name,
                v.violation_type,
                v.issued_at,
                v.fine_amount,
                v.notes,
                v.created_at,
                ST_AsGeoJSON(v.geom)::json as geom
            FROM violations v
            JOIN parking_sessions ps ON v.session_id = ps.session_id
            JOIN parking_bays pb ON v.bay_id = pb.bay_id
            LEFT JOIN users u ON v.officer_id = u.user_id
            WHERE ps.user_id = :user_id
            ORDER BY v.issued_at DESC
        """)
        
        result = db.execute(query, {"user_id": current_user.user_id})
        rows = result.fetchall()
        
        violations = []
        for row in rows:
            violations.append({
                "violation_id": row.violation_id,
                "session_id": row.session_id,
                "bay_id": row.bay_id,
                "bay_number": row.bay_number,
                "officer_id": row.officer_id,
                "officer_name": row.officer_name,
                "violation_type": row.violation_type,
                "issued_at": row.issued_at.isoformat() if row.issued_at else None,
                "fine_amount": float(row.fine_amount),
                "notes": row.notes,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "geom": row.geom
            })
        
        return violations
    except Exception as e:
        logger.error(f"Error fetching driver violations: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching violations: {str(e)}")

@router.get("/{violation_id}")
async def get_violation(
    violation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get a specific violation by ID
    """
    if current_user.role == "driver":
        raise HTTPException(status_code=403, detail="Access denied")
    
    violation = db.query(Violation).filter(Violation.violation_id == violation_id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    
    return violation_to_response(violation)

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_violation(
    violation_data: ViolationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_officer)
):
    """
    Create a new violation (officer/admin only)
    
    GEOMETRY: If not provided, will use the center point of the associated bay
    SPATIAL VALIDATION: If geom provided, violation point must be inside the associated parking bay
    
    - Validates bay exists
    - Auto-generates geometry from bay if not provided
    - Auto-sets officer_id and issued_at
    """
    # Check bay exists
    bay = db.query(ParkingBay).filter(ParkingBay.bay_id == violation_data.bay_id).first()
    if not bay:
        raise HTTPException(status_code=404, detail="Bay not found")
    
    # If geometry not provided, get the bay's center point
    if not violation_data.geom:
        result = db.execute(text("""
            SELECT ST_AsGeoJSON(ST_Centroid(geom))::json as geom
            FROM parking_bays WHERE bay_id = :bay_id
        """), {"bay_id": violation_data.bay_id})
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Could not generate violation geometry")
        geojson_str = json.dumps(row.geom)
    else:
        # Validate geometry type (Pydantic schema enforces Point but double-check)
        geom_dict = violation_data.geom.model_dump()
        if geom_dict.get("type") != "Point":
            raise HTTPException(
                status_code=400, 
                detail=f"Violation geometry must be Point, got {geom_dict.get('type')}"
            )
        geojson_str = json.dumps(geom_dict)
    
    # Insert with spatial validation (trigger checks if point is in bay)
    query = text("""
        INSERT INTO violations (session_id, bay_id, officer_id, violation_type, fine_amount, notes, geom)
        VALUES (:session_id, :bay_id, :officer_id, :violation_type, :fine_amount, :notes, 
                ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326))
        RETURNING violation_id, session_id, bay_id, officer_id, violation_type, issued_at, 
                  fine_amount, notes, created_at, ST_AsGeoJSON(geom)::json as geom
    """)
    
    try:
        result = db.execute(query, {
            "session_id": violation_data.session_id,
            "bay_id": violation_data.bay_id,
            "officer_id": current_user.user_id,
            "violation_type": violation_data.violation_type,
            "fine_amount": float(violation_data.fine_amount),
            "notes": violation_data.notes,
            "geom": geojson_str
        })
        row = result.fetchone()
        db.commit()
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        logger.error(f"Violation creation failed: {error_msg}")
        if "inside" in error_msg.lower() or "near" in error_msg.lower() or "must be inside" in error_msg:
            raise HTTPException(
                status_code=400,
                detail=error_msg if "Distance:" in error_msg else "Violation point must be inside the associated parking bay"
            )
        if "chk_violations_geom_type" in error_msg or "must be POINT" in error_msg:
            raise HTTPException(status_code=400, detail="Geometry must be a Point")
        if "chk_violations_geom_srid" in error_msg:
            raise HTTPException(status_code=400, detail="Geometry must have SRID 4326")
        if "officer" in error_msg.lower():
            raise HTTPException(
                status_code=403,
                detail="Only officers or admins can issue violations"
            )
        raise HTTPException(status_code=400, detail=f"Failed to create violation: {error_msg}")
    
    return {
        "violation_id": row.violation_id,
        "session_id": row.session_id,
        "bay_id": row.bay_id,
        "officer_id": row.officer_id,
        "violation_type": row.violation_type,
        "issued_at": row.issued_at,
        "fine_amount": float(row.fine_amount),
        "notes": row.notes,
        "created_at": row.created_at,
        "geom": row.geom,
        "message": "Violation created successfully"
    }

@router.get("/stats/summary")
async def get_violation_stats(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get violation statistics summary
    """
    if current_user.role == "driver":
        raise HTTPException(status_code=403, detail="Access denied")
    
    date_filter = ""
    params = {}
    
    if start_date:
        date_filter += " AND issued_at >= :start_date"
        params["start_date"] = start_date
    
    if end_date:
        date_filter += " AND issued_at <= :end_date"
        params["end_date"] = end_date
    
    query = text(f"""
        SELECT 
            violation_type,
            COUNT(*) as count,
            SUM(fine_amount) as total_fines,
            AVG(fine_amount) as avg_fine
        FROM violations
        WHERE 1=1 {date_filter}
        GROUP BY violation_type
        ORDER BY count DESC
    """)
    
    result = db.execute(query, params)
    rows = result.fetchall()
    
    stats = []
    total_violations = 0
    total_fines = 0
    
    for row in rows:
        stats.append({
            "violation_type": row.violation_type,
            "count": row.count,
            "total_fines": float(row.total_fines) if row.total_fines else 0,
            "avg_fine": float(row.avg_fine) if row.avg_fine else 0
        })
        total_violations += row.count
        total_fines += float(row.total_fines) if row.total_fines else 0
    
    return {
        "by_type": stats,
        "total_violations": total_violations,
        "total_fines": total_fines
    }

@router.delete("/{violation_id}")
async def delete_violation(
    violation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete/Pay a violation
    
    - Drivers can delete violations associated with their own sessions
    - Officers and admins can delete any violation
    """
    # Get the violation
    violation = db.query(Violation).filter(Violation.violation_id == violation_id).first()
    
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    
    # Check permissions
    if current_user.role == "driver":
        # Driver can only delete their own violations
        session = db.query(ParkingSession).filter(
            ParkingSession.session_id == violation.session_id
        ).first()
        
        if not session or session.user_id != current_user.user_id:
            raise HTTPException(
                status_code=403, 
                detail="You can only pay violations associated with your own parking sessions"
            )
    elif current_user.role not in ["officer", "operator", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Delete the violation
    db.delete(violation)
    db.commit()
    
    return {"message": "Violation paid successfully", "violation_id": violation_id}
