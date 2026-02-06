"""
Pydantic schemas for request/response validation
"""
from pydantic import BaseModel, EmailStr, Field, validator, root_validator
from typing import Optional, List, Any, Dict, Union
from datetime import datetime, date, time
from decimal import Decimal
from enum import Enum

# ============================================
# Geometry Type Enums
# ============================================

class GeometryType(str, Enum):
    """Allowed GeoJSON geometry types"""
    POINT = "Point"
    LINESTRING = "LineString"
    POLYGON = "Polygon"
    MULTIPOINT = "MultiPoint"
    MULTILINESTRING = "MultiLineString"
    MULTIPOLYGON = "MultiPolygon"

# ============================================
# GeoJSON Schemas with Type Validation
# ============================================

class GeoJSONGeometry(BaseModel):
    """GeoJSON geometry object"""
    type: str
    coordinates: Any

class GeoJSONPointGeometry(GeoJSONGeometry):
    """GeoJSON Point geometry - required for Sensor, PaymentTerminal, Violation"""
    type: str = Field(..., pattern="^Point$")
    coordinates: List[float] = Field(..., min_length=2, max_length=3)
    
    @validator("type")
    def validate_point_type(cls, v):
        if v != "Point":
            raise ValueError(f"Geometry type must be 'Point', got '{v}'")
        return v
    
    @validator("coordinates")
    def validate_point_coords(cls, v):
        if len(v) < 2:
            raise ValueError("Point coordinates must have at least [longitude, latitude]")
        lng, lat = v[0], v[1]
        if not (-180 <= lng <= 180):
            raise ValueError(f"Longitude must be between -180 and 180, got {lng}")
        if not (-90 <= lat <= 90):
            raise ValueError(f"Latitude must be between -90 and 90, got {lat}")
        return v

class GeoJSONLineStringGeometry(GeoJSONGeometry):
    """GeoJSON LineString geometry - required for StreetSegment"""
    type: str = Field(..., pattern="^LineString$")
    coordinates: List[List[float]] = Field(..., min_length=2)
    
    @validator("type")
    def validate_linestring_type(cls, v):
        if v != "LineString":
            raise ValueError(f"Geometry type must be 'LineString', got '{v}'")
        return v
    
    @validator("coordinates")
    def validate_linestring_coords(cls, v):
        if len(v) < 2:
            raise ValueError("LineString must have at least 2 coordinates")
        for i, coord in enumerate(v):
            if len(coord) < 2:
                raise ValueError(f"Coordinate {i} must have at least [longitude, latitude]")
            lng, lat = coord[0], coord[1]
            if not (-180 <= lng <= 180):
                raise ValueError(f"Longitude at position {i} must be between -180 and 180, got {lng}")
            if not (-90 <= lat <= 90):
                raise ValueError(f"Latitude at position {i} must be between -90 and 90, got {lat}")
        return v

class GeoJSONPolygonGeometry(GeoJSONGeometry):
    """GeoJSON Polygon geometry - required for ParkingZone, ParkingBay"""
    type: str = Field(..., pattern="^Polygon$")
    coordinates: List[List[List[float]]] = Field(..., min_length=1)
    
    @validator("type")
    def validate_polygon_type(cls, v):
        if v != "Polygon":
            raise ValueError(f"Geometry type must be 'Polygon', got '{v}'")
        return v
    
    @validator("coordinates")
    def validate_polygon_coords(cls, v):
        if len(v) < 1:
            raise ValueError("Polygon must have at least 1 ring (exterior)")
        for ring_idx, ring in enumerate(v):
            if len(ring) < 4:
                raise ValueError(f"Polygon ring {ring_idx} must have at least 4 coordinates (first and last must be same)")
            # Check if ring is closed
            if ring[0] != ring[-1]:
                raise ValueError(f"Polygon ring {ring_idx} must be closed (first and last coordinates must match)")
            for i, coord in enumerate(ring):
                if len(coord) < 2:
                    raise ValueError(f"Coordinate {i} in ring {ring_idx} must have at least [longitude, latitude]")
                lng, lat = coord[0], coord[1]
                if not (-180 <= lng <= 180):
                    raise ValueError(f"Longitude at ring {ring_idx}, position {i} must be between -180 and 180, got {lng}")
                if not (-90 <= lat <= 90):
                    raise ValueError(f"Latitude at ring {ring_idx}, position {i} must be between -90 and 90, got {lat}")
        return v

class GeoJSONFeature(BaseModel):
    """GeoJSON feature object"""
    type: str = "Feature"
    geometry: GeoJSONGeometry
    properties: Dict[str, Any] = {}

class GeoJSONFeatureCollection(BaseModel):
    """GeoJSON feature collection"""
    type: str = "FeatureCollection"
    features: List[GeoJSONFeature]

# ============================================
# Auth Schemas
# ============================================

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    email: EmailStr
    phone_number: Optional[str] = None
    password: str = Field(..., min_length=6)
    role: str = Field(default="driver")
    
    @validator("role")
    def validate_role(cls, v):
        allowed = ["driver", "operator", "officer", "admin"]
        if v not in allowed:
            raise ValueError(f"Role must be one of: {allowed}")
        return v

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None
    role: Optional[str] = None

class UserResponse(BaseModel):
    user_id: int
    full_name: str
    email: str
    phone_number: Optional[str]
    role: str
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# ============================================
# Tariff Schedule Schemas
# ============================================

class TariffScheduleBase(BaseModel):
    name: str
    hourly_rate: Decimal
    currency: str = "EUR"
    valid_from_time: time
    valid_to_time: time
    valid_days: str
    notes: Optional[str] = None

class TariffScheduleCreate(TariffScheduleBase):
    pass

class TariffScheduleResponse(TariffScheduleBase):
    tariff_schedule_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# ============================================
# Parking Zone Schemas
# ============================================

class ParkingZoneBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    zone_type: str
    max_duration_minutes: Optional[int] = None
    tariff_schedule_id: Optional[int] = None
    is_active: bool = True
    
    @validator("zone_type")
    def validate_zone_type(cls, v):
        allowed = ["on_street", "off_street", "garage", "lot"]
        if v not in allowed:
            raise ValueError(f"Zone type must be one of: {allowed}")
        return v

class ParkingZoneCreate(ParkingZoneBase):
    """Create parking zone - geometry must be Polygon"""
    geom: GeoJSONPolygonGeometry

class ParkingZoneUpdate(BaseModel):
    name: Optional[str] = None
    zone_type: Optional[str] = None
    max_duration_minutes: Optional[int] = None
    tariff_schedule_id: Optional[int] = None
    is_active: Optional[bool] = None
    geom: Optional[GeoJSONPolygonGeometry] = None

class ParkingZoneResponse(BaseModel):
    zone_id: int
    name: str
    zone_type: str
    max_duration_minutes: Optional[int]
    tariff_schedule_id: Optional[int]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    geom: GeoJSONGeometry
    
    class Config:
        from_attributes = True

class ParkingZoneGeoJSON(GeoJSONFeature):
    """Parking zone as GeoJSON feature"""
    pass

class ZoneOccupancy(BaseModel):
    zone_id: int
    zone_name: str
    total_bays: int
    available_bays: int
    occupied_bays: int
    reserved_bays: int
    closed_bays: int
    occupancy_percent: float

# ============================================
# Parking Bay Schemas
# ============================================

class ParkingBayBase(BaseModel):
    zone_id: int
    bay_number: str = Field(..., min_length=1, max_length=50)
    is_disabled_only: bool = False
    is_electric: bool = False
    status: str = "available"
    
    @validator("status")
    def validate_status(cls, v):
        allowed = ["available", "occupied", "closed", "reserved"]
        if v not in allowed:
            raise ValueError(f"Status must be one of: {allowed}")
        return v

class ParkingBayCreate(ParkingBayBase):
    """Create parking bay - geometry will be auto-generated if not provided"""
    geom: Optional[GeoJSONPolygonGeometry] = None

class ParkingBayUpdate(BaseModel):
    zone_id: Optional[int] = None
    bay_number: Optional[str] = None
    is_disabled_only: Optional[bool] = None
    is_electric: Optional[bool] = None
    status: Optional[str] = None
    geom: Optional[GeoJSONPolygonGeometry] = None

class ParkingBayResponse(BaseModel):
    bay_id: int
    zone_id: int
    bay_number: str
    is_disabled_only: bool
    is_electric: bool
    status: str
    last_status_update: datetime
    created_at: datetime
    updated_at: datetime
    geom: GeoJSONGeometry
    
    class Config:
        from_attributes = True

class BaySearchResult(BaseModel):
    bay_id: int
    bay_number: str
    zone_id: int
    zone_name: str
    status: str
    is_disabled_only: bool
    is_electric: bool
    distance_meters: float
    geom: GeoJSONGeometry

# ============================================
# Street Segment Schemas
# ============================================

class StreetSegmentBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    road_type: Optional[str] = None
    speed_limit_kph: Optional[int] = None
    
    @validator("road_type")
    def validate_road_type(cls, v):
        if v is not None:
            allowed = ["primary", "secondary", "local"]
            if v not in allowed:
                raise ValueError(f"Road type must be one of: {allowed}")
        return v

class StreetSegmentCreate(StreetSegmentBase):
    """Create street segment - geometry must be LineString"""
    geom: GeoJSONLineStringGeometry

class StreetSegmentResponse(StreetSegmentBase):
    street_id: int
    created_at: datetime
    updated_at: datetime
    geom: GeoJSONLineStringGeometry
    
    class Config:
        from_attributes = True

# ============================================
# Sensor Schemas
# ============================================

class SensorBase(BaseModel):
    bay_id: Optional[int] = None
    sensor_type: str
    installation_date: Optional[date] = None
    is_active: bool = True
    battery_level_percent: Optional[int] = Field(None, ge=0, le=100)
    
    @validator("sensor_type")
    def validate_sensor_type(cls, v):
        allowed = ["in_ground", "overhead_camera"]
        if v not in allowed:
            raise ValueError(f"Sensor type must be one of: {allowed}")
        return v

class SensorCreate(SensorBase):
    """Create sensor - geometry must be Point"""
    geom: GeoJSONPointGeometry

class SensorUpdate(BaseModel):
    bay_id: Optional[int] = None
    sensor_type: Optional[str] = None
    is_active: Optional[bool] = None
    battery_level_percent: Optional[int] = None
    geom: Optional[GeoJSONPointGeometry] = None

class SensorResponse(SensorBase):
    sensor_id: int
    created_at: datetime
    updated_at: datetime
    geom: GeoJSONPointGeometry
    
    class Config:
        from_attributes = True

# ============================================
# Payment Terminal Schemas
# ============================================

class PaymentTerminalBase(BaseModel):
    zone_id: Optional[int] = None
    terminal_code: str = Field(..., min_length=1, max_length=50)
    status: str = "operational"
    installation_date: Optional[date] = None
    
    @validator("status")
    def validate_status(cls, v):
        allowed = ["operational", "out_of_service"]
        if v not in allowed:
            raise ValueError(f"Status must be one of: {allowed}")
        return v

class PaymentTerminalCreate(PaymentTerminalBase):
    """Create payment terminal - geometry must be Point"""
    geom: GeoJSONPointGeometry

class PaymentTerminalUpdate(BaseModel):
    zone_id: Optional[int] = None
    terminal_code: Optional[str] = None
    status: Optional[str] = None
    geom: Optional[GeoJSONPointGeometry] = None

class PaymentTerminalResponse(PaymentTerminalBase):
    terminal_id: int
    created_at: datetime
    updated_at: datetime
    geom: GeoJSONPointGeometry
    
    class Config:
        from_attributes = True

# ============================================
# Vehicle Schemas
# ============================================

class VehicleBase(BaseModel):
    license_plate: str = Field(..., min_length=1, max_length=20)
    vehicle_type: str
    color: Optional[str] = None
    
    @validator("vehicle_type")
    def validate_vehicle_type(cls, v):
        allowed = ["car", "van", "motorcycle"]
        if v not in allowed:
            raise ValueError(f"Vehicle type must be one of: {allowed}")
        return v

class VehicleCreate(VehicleBase):
    user_id: int

class VehicleResponse(VehicleBase):
    vehicle_id: int
    user_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# ============================================
# Parking Session Schemas
# ============================================

class ParkingSessionStart(BaseModel):
    bay_id: int
    vehicle_id: int
    payment_method: str = "mobile_app"
    
    class Config:
        extra = "ignore"  # Ignore extra fields like user_id, expected_duration_hours
    
    @validator("payment_method")
    def validate_payment_method(cls, v):
        allowed = ["card", "mobile_app", "cash"]
        if v not in allowed:
            raise ValueError(f"Payment method must be one of: {allowed}")
        return v

class ParkingSessionEnd(BaseModel):
    amount_paid: Optional[Decimal] = Field(None, ge=0)

class ParkingSessionResponse(BaseModel):
    session_id: int
    bay_id: int
    vehicle_id: int
    user_id: int
    start_time: datetime
    end_time: Optional[datetime]
    status: str
    amount_paid: Decimal
    payment_method: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True

# ============================================
# Violation Schemas
# ============================================

class ViolationBase(BaseModel):
    session_id: Optional[int] = None
    bay_id: int
    violation_type: str
    fine_amount: Decimal = Field(..., ge=0)
    notes: Optional[str] = None
    
    @validator("violation_type")
    def validate_violation_type(cls, v):
        allowed = ["no_payment", "overstay", "wrong_zone"]
        if v not in allowed:
            raise ValueError(f"Violation type must be one of: {allowed}")
        return v

class ViolationCreate(ViolationBase):
    """Create violation - geometry will be auto-generated from bay if not provided"""
    geom: Optional[GeoJSONPointGeometry] = None

class ViolationResponse(BaseModel):
    violation_id: int
    session_id: Optional[int]
    bay_id: int
    officer_id: int
    violation_type: str
    issued_at: datetime
    fine_amount: Decimal
    notes: Optional[str]
    created_at: datetime
    geom: GeoJSONPointGeometry
    
    class Config:
        from_attributes = True

class ViolationSearchRequest(BaseModel):
    """Search violations in area - search area must be Polygon"""
    polygon: GeoJSONPolygonGeometry
    start_time: datetime
    end_time: datetime

# ============================================
# Analysis Schemas
# ============================================

class OccupancyHeatmapRequest(BaseModel):
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    hour_bucket: Optional[int] = Field(None, ge=0, le=23)

class HotspotRequest(BaseModel):
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    grid_size_meters: float = Field(default=100, ge=10, le=1000)

class AccessibilityRequest(BaseModel):
    dest_lat: float = Field(..., ge=-90, le=90)
    dest_lng: float = Field(..., ge=-180, le=180)
    radius_meters: float = Field(default=500, ge=50, le=5000)

class ScenarioRequest(BaseModel):
    name: str
    description: Optional[str] = None
    action: str  # "add" or "remove"
    zone_id: int
    bay_changes: List[Dict[str, Any]]  # List of bays to add/remove

class ScenarioResponse(BaseModel):
    scenario_id: int
    name: str
    original_capacity: int
    new_capacity: int
    capacity_change: int
    original_occupancy_percent: float
    estimated_new_occupancy_percent: float
    affected_bays: List[Dict[str, Any]]

class POIResponse(BaseModel):
    poi_id: int
    name: str
    poi_type: str
    address: Optional[str]
    geom: GeoJSONGeometry
    
    class Config:
        from_attributes = True

# ============================================
# Pagination
# ============================================

class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    page_size: int
    total_pages: int
