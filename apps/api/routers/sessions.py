"""
Parking Sessions router
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text
from typing import List, Optional
from datetime import datetime, timezone

from database import get_db
from models import User, ParkingSession, ParkingBay, ParkingZone, Vehicle
from schemas import ParkingSessionStart, ParkingSessionEnd, ParkingSessionResponse
from auth import get_current_user, get_driver

router = APIRouter()

@router.get("/")
async def get_sessions(
    skip: int = 0,
    limit: int = 100,
    bay_id: Optional[int] = None,
    vehicle_id: Optional[int] = None,
    status: Optional[str] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get parking sessions with filters
    
    Drivers can only see their own sessions.
    Operators and admins can see all sessions.
    """
    query = db.query(ParkingSession)
    
    # Role-based filtering
    if current_user.role == "driver":
        query = query.filter(ParkingSession.user_id == current_user.user_id)
    elif user_id is not None:
        query = query.filter(ParkingSession.user_id == user_id)
    
    if bay_id is not None:
        query = query.filter(ParkingSession.bay_id == bay_id)
    
    if vehicle_id is not None:
        query = query.filter(ParkingSession.vehicle_id == vehicle_id)
    
    if status:
        query = query.filter(ParkingSession.status == status)
    
    sessions = query.order_by(ParkingSession.start_time.desc()).offset(skip).limit(limit).all()
    
    return [
        {
            "session_id": s.session_id,
            "bay_id": s.bay_id,
            "vehicle_id": s.vehicle_id,
            "user_id": s.user_id,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "status": s.status,
            "amount_paid": float(s.amount_paid) if s.amount_paid else 0,
            "payment_method": s.payment_method,
            "created_at": s.created_at
        }
        for s in sessions
    ]

@router.get("/active")
async def get_active_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all active sessions for current user (or all if admin/operator)
    """
    query = db.query(ParkingSession).filter(ParkingSession.status == "active")
    
    if current_user.role == "driver":
        query = query.filter(ParkingSession.user_id == current_user.user_id)
    
    sessions = query.all()
    
    return [
        {
            "session_id": s.session_id,
            "bay_id": s.bay_id,
            "vehicle_id": s.vehicle_id,
            "user_id": s.user_id,
            "start_time": s.start_time,
            "status": s.status,
            "payment_method": s.payment_method
        }
        for s in sessions
    ]

@router.get("/{session_id}")
async def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get a specific session by ID
    """
    session = db.query(ParkingSession).filter(ParkingSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Access control
    if current_user.role == "driver" and session.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return {
        "session_id": session.session_id,
        "bay_id": session.bay_id,
        "vehicle_id": session.vehicle_id,
        "user_id": session.user_id,
        "start_time": session.start_time,
        "end_time": session.end_time,
        "status": session.status,
        "amount_paid": float(session.amount_paid) if session.amount_paid else 0,
        "payment_method": session.payment_method,
        "created_at": session.created_at
    }

@router.post("/start", status_code=status.HTTP_201_CREATED)
async def start_session(
    session_data: ParkingSessionStart,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_driver)
):
    """
    Start a new parking session
    
    - Validates bay is available
    - Validates vehicle belongs to user
    - Marks bay as occupied
    """
    # Check bay exists and is available
    bay = db.query(ParkingBay).filter(ParkingBay.bay_id == session_data.bay_id).first()
    if not bay:
        raise HTTPException(status_code=404, detail="Bay not found")
    
    if bay.status != "available":
        raise HTTPException(status_code=400, detail=f"Bay is not available (current status: {bay.status})")
    
    # Check vehicle belongs to user
    vehicle = db.query(Vehicle).filter(
        Vehicle.vehicle_id == session_data.vehicle_id,
        Vehicle.user_id == current_user.user_id
    ).first()
    
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found or doesn't belong to you")
    
    # Check for existing active session for this vehicle
    existing = db.query(ParkingSession).filter(
        ParkingSession.vehicle_id == session_data.vehicle_id,
        ParkingSession.status == "active"
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Vehicle already has an active parking session")
    
    # Create session
    session = ParkingSession(
        bay_id=session_data.bay_id,
        vehicle_id=session_data.vehicle_id,
        user_id=current_user.user_id,
        payment_method=session_data.payment_method,
        status="active"
    )
    
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return {
        "session_id": session.session_id,
        "bay_id": session.bay_id,
        "vehicle_id": session.vehicle_id,
        "user_id": session.user_id,
        "start_time": session.start_time,
        "status": session.status,
        "payment_method": session.payment_method,
        "message": "Parking session started successfully"
    }

@router.post("/{session_id}/end")
async def end_session(
    session_id: int,
    db: Session = Depends(get_db),
):
    """
    End a parking session
    
    - Sets end_time
    - Auto-calculates amount_paid from tariff
    - Marks session as completed
    - Bay status updated via trigger
    
    Note: Auth temporarily disabled for debugging CORS
    """
    session = db.query(ParkingSession).filter(ParkingSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.status != "active":
        raise HTTPException(status_code=400, detail=f"Session is not active (current status: {session.status})")
    
    session.end_time = datetime.now(timezone.utc)
    
    # Auto-calculate amount_paid from tariff
    bay = db.query(ParkingBay).options(
        joinedload(ParkingBay.zone).joinedload(ParkingZone.tariff_schedule)
    ).filter(ParkingBay.bay_id == session.bay_id).first()
    
    if bay and bay.zone:
        # Calculate duration in hours
        duration = (session.end_time - session.start_time).total_seconds() / 3600
        
        # Get hourly rate from tariff or use default
        hourly_rate = 2.50  # Default rate
        if bay.zone.tariff_schedule:
            hourly_rate = float(bay.zone.tariff_schedule.hourly_rate)
        
        # Calculate amount (minimum 0.50)
        session.amount_paid = max(0.50, round(duration * hourly_rate, 2))
    else:
        session.amount_paid = 0.0
    
    session.status = "completed"
    
    db.commit()
    db.refresh(session)
    
    return {
        "session_id": session.session_id,
        "bay_id": session.bay_id,
        "start_time": session.start_time,
        "end_time": session.end_time,
        "status": session.status,
        "amount_paid": float(session.amount_paid),
        "message": "Parking session ended successfully"
    }

@router.post("/{session_id}/cancel")
async def cancel_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_driver)
):
    """
    Cancel a parking session (only if very recent)
    """
    session = db.query(ParkingSession).filter(ParkingSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if current_user.role == "driver" and session.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Only active sessions can be cancelled")
    
    # Check if session is recent (within 5 minutes)
    time_diff = datetime.now(timezone.utc) - session.start_time
    if time_diff.total_seconds() > 300:  # 5 minutes
        raise HTTPException(status_code=400, detail="Session can only be cancelled within 5 minutes of starting")
    
    session.status = "cancelled"
    session.end_time = datetime.now(timezone.utc)
    
    db.commit()
    
    return {
        "session_id": session.session_id,
        "status": "cancelled",
        "message": "Parking session cancelled successfully"
    }

@router.post("/{session_id}/overstay")
async def mark_overstay(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Mark a session as overstay (officer/operator/admin only)
    """
    if current_user.role not in ["officer", "operator", "admin"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    session = db.query(ParkingSession).filter(ParkingSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Only active sessions can be marked as overstay")
    
    session.status = "overstay"
    
    db.commit()
    
    return {
        "session_id": session.session_id,
        "status": "overstay",
        "message": "Session marked as overstay"
    }
