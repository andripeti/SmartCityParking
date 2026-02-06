"""
Vehicles router
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import User, Vehicle
from schemas import VehicleCreate, VehicleResponse
from auth import get_current_user

router = APIRouter()

@router.post("/", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED)
async def create_vehicle(
    vehicle_data: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new vehicle
    
    Users can only add vehicles to their own account.
    Admins can add vehicles to any account.
    """
    # Get user_id from vehicle_data or use current user's id
    user_id = vehicle_data.user_id if vehicle_data.user_id else current_user.user_id
    
    if user_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Cannot add vehicles to other users")
    
    # Check if license plate already exists
    existing = db.query(Vehicle).filter(Vehicle.license_plate == vehicle_data.license_plate).first()
    if existing:
        raise HTTPException(status_code=400, detail="License plate already registered")
    
    # Create vehicle
    new_vehicle = Vehicle(
        user_id=user_id,
        license_plate=vehicle_data.license_plate,
        vehicle_type=vehicle_data.vehicle_type,
        color=vehicle_data.color
    )
    
    db.add(new_vehicle)
    db.commit()
    db.refresh(new_vehicle)
    
    return new_vehicle

@router.get("/{vehicle_id}", response_model=VehicleResponse)
async def get_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get vehicle by ID
    
    Users can only view their own vehicles.
    Admins can view any vehicle.
    """
    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()
    
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    # Check ownership
    if vehicle.user_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    return vehicle

@router.put("/{vehicle_id}", response_model=VehicleResponse)
async def update_vehicle(
    vehicle_id: int,
    vehicle_data: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update vehicle details
    
    Users can only update their own vehicles.
    Admins can update any vehicle.
    """
    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()
    
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    # Check ownership
    if vehicle.user_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check if new license plate conflicts with another vehicle
    if vehicle_data.license_plate != vehicle.license_plate:
        existing = db.query(Vehicle).filter(
            Vehicle.license_plate == vehicle_data.license_plate,
            Vehicle.vehicle_id != vehicle_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="License plate already registered")
    
    # Update fields
    vehicle.license_plate = vehicle_data.license_plate
    vehicle.vehicle_type = vehicle_data.vehicle_type
    if vehicle_data.color is not None:
        vehicle.color = vehicle_data.color
    
    db.commit()
    db.refresh(vehicle)
    
    return vehicle

@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete vehicle
    
    Users can only delete their own vehicles.
    Admins can delete any vehicle.
    """
    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()
    
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    # Check ownership
    if vehicle.user_id != current_user.user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check if vehicle has active sessions
    from models import ParkingSession
    active_session = db.query(ParkingSession).filter(
        ParkingSession.vehicle_id == vehicle_id,
        ParkingSession.status == "active"
    ).first()
    
    if active_session:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete vehicle with active parking session"
        )
    
    db.delete(vehicle)
    db.commit()
    
    return None
