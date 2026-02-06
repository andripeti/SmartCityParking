"""
SQLAlchemy models for all database tables
"""
from sqlalchemy import Column, Integer, String, Boolean, Numeric, DateTime, Date, Time, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from database import Base

class TariffSchedule(Base):
    __tablename__ = "tariff_schedules"
    
    tariff_schedule_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    hourly_rate = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), default="EUR")
    valid_from_time = Column(Time, nullable=False)
    valid_to_time = Column(Time, nullable=False)
    valid_days = Column(String(50), nullable=False)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    zones = relationship("ParkingZone", back_populates="tariff_schedule")

class ParkingZone(Base):
    __tablename__ = "parking_zones"
    
    zone_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    zone_type = Column(String(50), nullable=False)
    max_duration_minutes = Column(Integer)
    tariff_schedule_id = Column(Integer, ForeignKey("tariff_schedules.tariff_schedule_id"))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    geom = Column(Geometry("POLYGON", srid=4326), nullable=False)
    
    # Relationships
    tariff_schedule = relationship("TariffSchedule", back_populates="zones")
    bays = relationship("ParkingBay", back_populates="zone", cascade="all, delete-orphan")
    terminals = relationship("PaymentTerminal", back_populates="zone")

class ParkingBay(Base):
    __tablename__ = "parking_bays"
    
    bay_id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(Integer, ForeignKey("parking_zones.zone_id", ondelete="CASCADE"), nullable=False)
    bay_number = Column(String(50), nullable=False)
    is_disabled_only = Column(Boolean, default=False)
    is_electric = Column(Boolean, default=False)
    status = Column(String(20), default="available")
    last_status_update = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    geom = Column(Geometry("POLYGON", srid=4326), nullable=False)
    
    # Relationships
    zone = relationship("ParkingZone", back_populates="bays")
    sensor = relationship("Sensor", back_populates="bay", uselist=False)
    sessions = relationship("ParkingSession", back_populates="bay")
    violations = relationship("Violation", back_populates="bay")

class StreetSegment(Base):
    __tablename__ = "street_segments"
    
    street_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    road_type = Column(String(50))
    speed_limit_kph = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    geom = Column(Geometry("LINESTRING", srid=4326), nullable=False)

class Sensor(Base):
    __tablename__ = "sensors"
    
    sensor_id = Column(Integer, primary_key=True, index=True)
    bay_id = Column(Integer, ForeignKey("parking_bays.bay_id", ondelete="SET NULL"))
    sensor_type = Column(String(50), nullable=False)
    installation_date = Column(Date)
    is_active = Column(Boolean, default=True)
    battery_level_percent = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    geom = Column(Geometry("POINT", srid=4326), nullable=False)
    
    # Relationships
    bay = relationship("ParkingBay", back_populates="sensor")

class PaymentTerminal(Base):
    __tablename__ = "payment_terminals"
    
    terminal_id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(Integer, ForeignKey("parking_zones.zone_id", ondelete="SET NULL"))
    terminal_code = Column(String(50), unique=True, nullable=False)
    status = Column(String(50), default="operational")
    installation_date = Column(Date)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    geom = Column(Geometry("POINT", srid=4326), nullable=False)
    
    # Relationships
    zone = relationship("ParkingZone", back_populates="terminals")

class User(Base):
    __tablename__ = "users"
    
    user_id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    phone_number = Column(String(50))
    role = Column(String(20), nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    vehicles = relationship("Vehicle", back_populates="owner", cascade="all, delete-orphan")
    sessions = relationship("ParkingSession", back_populates="user")
    violations_issued = relationship("Violation", back_populates="officer")

class Vehicle(Base):
    __tablename__ = "vehicles"
    
    vehicle_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    license_plate = Column(String(20), unique=True, nullable=False, index=True)
    vehicle_type = Column(String(20), nullable=False)
    color = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    owner = relationship("User", back_populates="vehicles")
    sessions = relationship("ParkingSession", back_populates="vehicle")

class ParkingSession(Base):
    __tablename__ = "parking_sessions"
    
    session_id = Column(Integer, primary_key=True, index=True)
    bay_id = Column(Integer, ForeignKey("parking_bays.bay_id"), nullable=False)
    vehicle_id = Column(Integer, ForeignKey("vehicles.vehicle_id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    start_time = Column(DateTime(timezone=True), server_default=func.now())
    end_time = Column(DateTime(timezone=True))
    status = Column(String(20), default="active")
    amount_paid = Column(Numeric(10, 2), default=0)
    payment_method = Column(String(20))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    bay = relationship("ParkingBay", back_populates="sessions")
    vehicle = relationship("Vehicle", back_populates="sessions")
    user = relationship("User", back_populates="sessions")
    violations = relationship("Violation", back_populates="session")

class Violation(Base):
    __tablename__ = "violations"
    
    violation_id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("parking_sessions.session_id", ondelete="SET NULL"))
    bay_id = Column(Integer, ForeignKey("parking_bays.bay_id"), nullable=False)
    officer_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    violation_type = Column(String(50), nullable=False)
    issued_at = Column(DateTime(timezone=True), server_default=func.now())
    fine_amount = Column(Numeric(10, 2), nullable=False)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    geom = Column(Geometry("POINT", srid=4326), nullable=False)
    
    # Relationships
    session = relationship("ParkingSession", back_populates="violations")
    bay = relationship("ParkingBay", back_populates="violations")
    officer = relationship("User", back_populates="violations_issued")

class PointOfInterest(Base):
    __tablename__ = "points_of_interest"
    
    poi_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    poi_type = Column(String(50), nullable=False)
    address = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    geom = Column(Geometry("POINT", srid=4326), nullable=False)

class ScenarioResult(Base):
    __tablename__ = "scenario_results"
    
    scenario_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    created_by = Column(Integer, ForeignKey("users.user_id"))
    scenario_data = Column(Text, nullable=False)  # JSON stored as text
    results = Column(Text)  # JSON stored as text
    created_at = Column(DateTime(timezone=True), server_default=func.now())
