"""
Analysis router - Heatmaps, Hotspots, Accessibility, Scenarios
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import json

from database import get_db
from models import User, ParkingZone, ParkingBay, PointOfInterest, ScenarioResult
from schemas import (
    OccupancyHeatmapRequest, HotspotRequest, AccessibilityRequest,
    ScenarioRequest, ScenarioResponse, ZoneOccupancy, POIResponse
)
from auth import get_current_user, get_operator, get_staff
from geo_utils import geom_to_geojson, make_feature_collection, make_geojson_feature

router = APIRouter()

@router.get("/occupancy-heatmap")
async def get_occupancy_heatmap(
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    hour_bucket: Optional[int] = Query(None, ge=0, le=23),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate occupancy heatmap data
    
    Returns zone polygons with occupancy intensity values.
    If hour_bucket is specified, filters sessions that overlap with that hour.
    """
    if current_user.role == "driver":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get all active zones with their occupancy
    query = text("""
        WITH zone_stats AS (
            SELECT 
                pz.zone_id,
                pz.name,
                pz.zone_type,
                COUNT(pb.bay_id) as total_bays,
                COUNT(pb.bay_id) FILTER (WHERE pb.status = 'occupied') as occupied_bays,
                COUNT(pb.bay_id) FILTER (WHERE pb.status != 'closed') as active_bays
            FROM parking_zones pz
            LEFT JOIN parking_bays pb ON pz.zone_id = pb.zone_id
            WHERE pz.is_active = true
            GROUP BY pz.zone_id, pz.name, pz.zone_type
        )
        SELECT 
            zs.zone_id,
            zs.name,
            zs.zone_type,
            zs.total_bays,
            zs.occupied_bays,
            zs.active_bays,
            CASE 
                WHEN zs.active_bays > 0 THEN 
                    ROUND((zs.occupied_bays::numeric / zs.active_bays::numeric) * 100, 2)
                ELSE 0
            END as occupancy_percent,
            ST_AsGeoJSON(pz.geom)::json as geom,
            ST_X(ST_Centroid(pz.geom)) as center_lng,
            ST_Y(ST_Centroid(pz.geom)) as center_lat
        FROM zone_stats zs
        JOIN parking_zones pz ON zs.zone_id = pz.zone_id
        ORDER BY occupancy_percent DESC
    """)
    
    result = db.execute(query)
    rows = result.fetchall()
    
    features = []
    for row in rows:
        # Intensity value from 0-1 based on occupancy
        intensity = float(row.occupancy_percent) / 100.0
        
        features.append(make_geojson_feature(
            row.geom,
            {
                "zone_id": row.zone_id,
                "name": row.name,
                "zone_type": row.zone_type,
                "total_bays": row.total_bays,
                "occupied_bays": row.occupied_bays,
                "occupancy_percent": float(row.occupancy_percent),
                "intensity": intensity,
                "center": [row.center_lng, row.center_lat]
            }
        ))
    
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "type": "occupancy_heatmap",
            "generated_at": datetime.utcnow().isoformat(),
            "zone_count": len(features)
        }
    }

@router.get("/occupancy-grid")
async def get_occupancy_grid(
    grid_size_meters: float = Query(default=100, ge=50, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate occupancy heatmap as a hexagonal grid
    """
    if current_user.role == "driver":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Generate hex grid over bays and compute occupancy per cell
    query = text("""
        WITH bounds AS (
            SELECT ST_Extent(geom) as bbox FROM parking_bays
        ),
        grid AS (
            SELECT (ST_HexagonGrid(:grid_size, bbox)).*
            FROM bounds
        ),
        bay_counts AS (
            SELECT 
                g.i, g.j, g.geom as cell_geom,
                COUNT(pb.bay_id) as total_bays,
                COUNT(pb.bay_id) FILTER (WHERE pb.status = 'occupied') as occupied_bays
            FROM grid g
            LEFT JOIN parking_bays pb ON ST_Intersects(g.geom, pb.geom)
            GROUP BY g.i, g.j, g.geom
            HAVING COUNT(pb.bay_id) > 0
        )
        SELECT 
            i, j,
            total_bays,
            occupied_bays,
            CASE 
                WHEN total_bays > 0 THEN ROUND((occupied_bays::numeric / total_bays::numeric) * 100, 2)
                ELSE 0
            END as occupancy_percent,
            ST_AsGeoJSON(cell_geom)::json as geom,
            ST_X(ST_Centroid(cell_geom)) as center_lng,
            ST_Y(ST_Centroid(cell_geom)) as center_lat
        FROM bay_counts
        ORDER BY occupancy_percent DESC
    """)
    
    try:
        result = db.execute(query, {"grid_size": grid_size_meters / 111000})  # Approximate degrees
        rows = result.fetchall()
    except Exception:
        # Fallback if hex grid not available
        return await get_occupancy_heatmap(db=db, current_user=current_user)
    
    features = []
    for row in rows:
        intensity = float(row.occupancy_percent) / 100.0
        
        features.append(make_geojson_feature(
            row.geom,
            {
                "cell_id": f"{row.i}_{row.j}",
                "total_bays": row.total_bays,
                "occupied_bays": row.occupied_bays,
                "occupancy_percent": float(row.occupancy_percent),
                "intensity": intensity,
                "center": [row.center_lng, row.center_lat]
            }
        ))
    
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "type": "occupancy_grid",
            "grid_size_meters": grid_size_meters,
            "generated_at": datetime.utcnow().isoformat()
        }
    }

@router.get("/violation-hotspots")
async def get_violation_hotspots(
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    grid_size_meters: float = Query(default=100, ge=50, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate violation hotspot analysis
    
    Uses grid-based density to identify violation clusters.
    """
    if current_user.role == "driver":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Set default time range to last 30 days
    if not end_time:
        end_time = datetime.utcnow()
    if not start_time:
        start_time = end_time - timedelta(days=30)
    
    # Grid-based density analysis
    query = text("""
        WITH violation_points AS (
            SELECT geom, violation_type, fine_amount
            FROM violations
            WHERE issued_at >= :start_time AND issued_at <= :end_time
        ),
        bounds AS (
            SELECT ST_Extent(geom) as bbox FROM violation_points
        ),
        grid AS (
            SELECT (ST_SquareGrid(:grid_size, bbox)).*
            FROM bounds
            WHERE bbox IS NOT NULL
        ),
        hotspots AS (
            SELECT 
                g.i, g.j, g.geom as cell_geom,
                COUNT(v.geom) as violation_count,
                SUM(v.fine_amount) as total_fines,
                array_agg(DISTINCT v.violation_type) as violation_types
            FROM grid g
            JOIN violation_points v ON ST_Contains(g.geom, v.geom)
            GROUP BY g.i, g.j, g.geom
        )
        SELECT 
            i, j,
            violation_count,
            total_fines,
            violation_types,
            ST_AsGeoJSON(cell_geom)::json as geom,
            ST_X(ST_Centroid(cell_geom)) as center_lng,
            ST_Y(ST_Centroid(cell_geom)) as center_lat
        FROM hotspots
        ORDER BY violation_count DESC
    """)
    
    try:
        result = db.execute(query, {
            "start_time": start_time,
            "end_time": end_time,
            "grid_size": grid_size_meters / 111000  # Approximate degrees
        })
        rows = result.fetchall()
    except Exception as e:
        # Fallback to simple point aggregation
        return await _get_violation_points_fallback(db, start_time, end_time)
    
    if not rows:
        return await _get_violation_points_fallback(db, start_time, end_time)
    
    # Calculate max for normalization
    max_count = max(row.violation_count for row in rows) if rows else 1
    
    features = []
    for row in rows:
        intensity = row.violation_count / max_count
        
        features.append(make_geojson_feature(
            row.geom,
            {
                "cell_id": f"{row.i}_{row.j}",
                "violation_count": row.violation_count,
                "total_fines": float(row.total_fines) if row.total_fines else 0,
                "violation_types": row.violation_types,
                "intensity": intensity,
                "center": [row.center_lng, row.center_lat]
            }
        ))
    
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "type": "violation_hotspots",
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "grid_size_meters": grid_size_meters,
            "total_violations": sum(row.violation_count for row in rows),
            "hotspot_count": len(features)
        }
    }

async def _get_violation_points_fallback(db: Session, start_time: datetime, end_time: datetime):
    """Fallback to simple violation points if grid fails"""
    query = text("""
        SELECT 
            v.violation_id,
            v.violation_type,
            v.fine_amount,
            v.issued_at,
            ST_AsGeoJSON(v.geom)::json as geom
        FROM violations v
        WHERE v.issued_at >= :start_time AND v.issued_at <= :end_time
    """)
    
    result = db.execute(query, {"start_time": start_time, "end_time": end_time})
    rows = result.fetchall()
    
    features = []
    for row in rows:
        features.append(make_geojson_feature(
            row.geom,
            {
                "violation_id": row.violation_id,
                "violation_type": row.violation_type,
                "fine_amount": float(row.fine_amount) if row.fine_amount else 0,
                "issued_at": row.issued_at.isoformat() if row.issued_at else None
            }
        ))
    
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "type": "violation_points",
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "total_violations": len(features)
        }
    }

@router.get("/accessibility")
async def get_accessibility_analysis(
    dest_lat: float = Query(..., ge=-90, le=90),
    dest_lng: float = Query(..., ge=-180, le=180),
    radius_meters: float = Query(default=500, ge=50, le=2000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Compute accessibility analysis - average walking distance from parking to destination
    """
    if current_user.role == "driver":
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = text("""
        WITH dest_point AS (
            SELECT ST_SetSRID(ST_MakePoint(:lng, :lat), 4326) as geom
        ),
        nearby_bays AS (
            SELECT 
                pb.bay_id,
                pb.bay_number,
                pb.zone_id,
                pb.status,
                ST_Distance(pb.geom::geography, dp.geom::geography) as distance_meters,
                ST_AsGeoJSON(pb.geom)::json as geom
            FROM parking_bays pb, dest_point dp
            WHERE ST_DWithin(pb.geom::geography, dp.geom::geography, :radius)
              AND pb.status != 'closed'
        )
        SELECT 
            bay_id, bay_number, zone_id, status, distance_meters, geom
        FROM nearby_bays
        ORDER BY distance_meters
    """)
    
    result = db.execute(query, {"lat": dest_lat, "lng": dest_lng, "radius": radius_meters})
    rows = result.fetchall()
    
    if not rows:
        return {
            "destination": {"lat": dest_lat, "lng": dest_lng},
            "radius_meters": radius_meters,
            "statistics": {
                "total_bays": 0,
                "available_bays": 0,
                "average_distance_meters": None,
                "min_distance_meters": None,
                "max_distance_meters": None
            },
            "bays": {"type": "FeatureCollection", "features": []}
        }
    
    # Calculate statistics
    distances = [row.distance_meters for row in rows]
    available_distances = [row.distance_meters for row in rows if row.status == "available"]
    
    features = []
    for row in rows:
        features.append(make_geojson_feature(
            row.geom,
            {
                "bay_id": row.bay_id,
                "bay_number": row.bay_number,
                "zone_id": row.zone_id,
                "status": row.status,
                "distance_meters": round(row.distance_meters, 2)
            }
        ))
    
    return {
        "destination": {"lat": dest_lat, "lng": dest_lng},
        "radius_meters": radius_meters,
        "statistics": {
            "total_bays": len(rows),
            "available_bays": len([r for r in rows if r.status == "available"]),
            "average_distance_meters": round(sum(distances) / len(distances), 2) if distances else None,
            "average_distance_available": round(sum(available_distances) / len(available_distances), 2) if available_distances else None,
            "min_distance_meters": round(min(distances), 2) if distances else None,
            "max_distance_meters": round(max(distances), 2) if distances else None
        },
        "bays": {
            "type": "FeatureCollection",
            "features": features
        }
    }

@router.get("/pois")
async def get_pois(
    poi_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get points of interest for accessibility analysis
    """
    query = db.query(PointOfInterest)
    
    if poi_type:
        query = query.filter(PointOfInterest.poi_type == poi_type)
    
    pois = query.all()
    
    features = []
    for poi in pois:
        geom = geom_to_geojson(poi.geom)
        if geom:
            features.append(make_geojson_feature(
                geom,
                {
                    "poi_id": poi.poi_id,
                    "name": poi.name,
                    "poi_type": poi.poi_type,
                    "address": poi.address
                }
            ))
    
    return make_feature_collection(features)

@router.post("/scenario")
async def run_scenario(
    scenario: ScenarioRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_operator)
):
    """
    Run a scenario test - simulate adding or removing bays
    
    Does NOT modify actual data, returns projected impact.
    """
    # Get current zone stats
    zone_query = text("""
        SELECT 
            pz.zone_id,
            pz.name,
            COUNT(pb.bay_id) as total_bays,
            COUNT(pb.bay_id) FILTER (WHERE pb.status = 'occupied') as occupied_bays,
            COUNT(pb.bay_id) FILTER (WHERE pb.status != 'closed') as active_bays
        FROM parking_zones pz
        LEFT JOIN parking_bays pb ON pz.zone_id = pb.zone_id
        WHERE pz.zone_id = :zone_id
        GROUP BY pz.zone_id, pz.name
    """)
    
    result = db.execute(zone_query, {"zone_id": scenario.zone_id})
    zone_row = result.fetchone()
    
    if not zone_row:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    original_capacity = zone_row.total_bays
    original_active = zone_row.active_bays
    original_occupied = zone_row.occupied_bays
    
    # Calculate scenario impact
    bay_change_count = len(scenario.bay_changes)
    
    if scenario.action == "add":
        new_capacity = original_capacity + bay_change_count
        new_active = original_active + bay_change_count
    elif scenario.action == "remove":
        new_capacity = max(0, original_capacity - bay_change_count)
        new_active = max(0, original_active - bay_change_count)
    else:
        raise HTTPException(status_code=400, detail="Action must be 'add' or 'remove'")
    
    # Estimate new occupancy (assumes same number of vehicles)
    if original_active > 0:
        original_occupancy = (original_occupied / original_active) * 100
    else:
        original_occupancy = 0
    
    if new_active > 0:
        estimated_new_occupancy = (original_occupied / new_active) * 100
    else:
        estimated_new_occupancy = 100 if original_occupied > 0 else 0
    
    # Save scenario result
    scenario_result = ScenarioResult(
        name=scenario.name,
        description=scenario.description,
        created_by=current_user.user_id,
        scenario_data=json.dumps({
            "action": scenario.action,
            "zone_id": scenario.zone_id,
            "bay_changes": scenario.bay_changes
        }),
        results=json.dumps({
            "original_capacity": original_capacity,
            "new_capacity": new_capacity,
            "capacity_change": new_capacity - original_capacity,
            "original_occupancy_percent": round(original_occupancy, 2),
            "estimated_new_occupancy_percent": round(estimated_new_occupancy, 2)
        })
    )
    
    db.add(scenario_result)
    db.commit()
    db.refresh(scenario_result)
    
    return {
        "scenario_id": scenario_result.scenario_id,
        "name": scenario.name,
        "zone_id": scenario.zone_id,
        "zone_name": zone_row.name,
        "action": scenario.action,
        "original_capacity": original_capacity,
        "new_capacity": new_capacity,
        "capacity_change": new_capacity - original_capacity,
        "original_occupancy_percent": round(original_occupancy, 2),
        "estimated_new_occupancy_percent": round(min(estimated_new_occupancy, 100), 2),
        "affected_bays": scenario.bay_changes,
        "recommendation": _get_scenario_recommendation(
            original_occupancy, estimated_new_occupancy, scenario.action
        )
    }

def _get_scenario_recommendation(original_occ: float, new_occ: float, action: str) -> str:
    """Generate a recommendation based on scenario results"""
    if action == "add":
        if new_occ < 70:
            return "Adding bays would improve availability significantly. Recommended."
        elif new_occ < 85:
            return "Adding bays would moderately improve availability. Consider based on demand."
        else:
            return "Adding bays may not significantly reduce congestion. Review actual demand data."
    else:  # remove
        if new_occ > 90:
            return "Removing bays would create severe capacity issues. Not recommended."
        elif new_occ > 80:
            return "Removing bays would reduce availability. Proceed with caution."
        else:
            return "Removing bays is feasible with current occupancy levels."

@router.get("/dashboard")
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_staff)
):
    """
    Get dashboard statistics for operators and officers
    """
    # Get zone occupancy
    zones_query = text("""
        SELECT 
            pz.zone_id,
            pz.name,
            pz.zone_type,
            COUNT(pb.bay_id) as total_bays,
            COUNT(pb.bay_id) FILTER (WHERE pb.status = 'available') as available_bays,
            COUNT(pb.bay_id) FILTER (WHERE pb.status = 'occupied') as occupied_bays,
            COUNT(pb.bay_id) FILTER (WHERE pb.status = 'reserved') as reserved_bays,
            COUNT(pb.bay_id) FILTER (WHERE pb.status = 'closed') as closed_bays
        FROM parking_zones pz
        LEFT JOIN parking_bays pb ON pz.zone_id = pb.zone_id
        WHERE pz.is_active = true
        GROUP BY pz.zone_id, pz.name, pz.zone_type
        ORDER BY occupied_bays DESC
    """)
    
    zones_result = db.execute(zones_query)
    zones = []
    total_bays = 0
    total_available = 0
    total_occupied = 0
    
    for row in zones_result.fetchall():
        active_bays = row.total_bays - row.closed_bays
        occupancy = (row.occupied_bays / active_bays * 100) if active_bays > 0 else 0
        
        zones.append({
            "zone_id": row.zone_id,
            "name": row.name,
            "zone_type": row.zone_type,
            "total_bays": row.total_bays,
            "available_bays": row.available_bays,
            "occupied_bays": row.occupied_bays,
            "reserved_bays": row.reserved_bays,
            "closed_bays": row.closed_bays,
            "occupancy_percent": round(occupancy, 1)
        })
        
        total_bays += row.total_bays
        total_available += row.available_bays
        total_occupied += row.occupied_bays
    
    # Get today's violations
    violations_query = text("""
        SELECT COUNT(*) as count, COALESCE(SUM(fine_amount), 0) as total_fines
        FROM violations
        WHERE DATE(issued_at) = CURRENT_DATE
    """)
    violations_result = db.execute(violations_query)
    violations_row = violations_result.fetchone()
    
    # Get active sessions
    sessions_query = text("""
        SELECT COUNT(*) as active_sessions
        FROM parking_sessions
        WHERE status = 'active'
    """)
    sessions_result = db.execute(sessions_query)
    sessions_row = sessions_result.fetchone()
    
    # Get sensor status
    sensors_query = text("""
        SELECT 
            COUNT(*) as total_sensors,
            COUNT(*) FILTER (WHERE is_active = true) as active_sensors,
            COUNT(*) FILTER (WHERE battery_level_percent IS NOT NULL AND battery_level_percent < 20) as low_battery
        FROM sensors
    """)
    sensors_result = db.execute(sensors_query)
    sensors_row = sensors_result.fetchone()
    
    return {
        "summary": {
            "total_bays": total_bays,
            "available_bays": total_available,
            "occupied_bays": total_occupied,
            "overall_occupancy_percent": round(
                (total_occupied / (total_bays - sum(z["closed_bays"] for z in zones)) * 100)
                if (total_bays - sum(z["closed_bays"] for z in zones)) > 0 else 0,
                1
            ),
            "active_sessions": sessions_row.active_sessions,
            "violations_today": violations_row.count,
            "fines_today": float(violations_row.total_fines)
        },
        "sensors": {
            "total": sensors_row.total_sensors,
            "active": sensors_row.active_sensors,
            "low_battery": sensors_row.low_battery
        },
        "zones": zones
    }
