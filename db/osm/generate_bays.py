"""
Generate parking bays within parking zones
Uses capacity tag from OSM or default count
Grid layout for surface lots, perimeter for street-side parking
"""
import logging
import math
from typing import Dict, List, Tuple

import psycopg2

from config import config

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def get_db_connection():
    """Get database connection"""
    return psycopg2.connect(
        host=config.db_host,
        port=config.db_port,
        database=config.db_name,
        user=config.db_user,
        password=config.db_password
    )


def generate_bays_for_zone(conn, zone_id: int, zone_name: str, zone_type: str, 
                           capacity: int, geom) -> int:
    """
    Generate parking bays inside a zone
    
    Args:
        conn: Database connection
        zone_id: Zone ID
        zone_name: Zone name for bay numbering
        zone_type: Type of zone (lot, garage, on_street)
        capacity: Number of bays to generate
        geom: Zone geometry (WKB)
    
    Returns:
        Number of bays generated
    """
    with conn.cursor() as cur:
        # Get zone bounds and area
        cur.execute('''
            SELECT 
                ST_XMin(geom), ST_YMin(geom), 
                ST_XMax(geom), ST_YMax(geom),
                ST_Area(geom::geography) as area_sqm
            FROM parking_zones WHERE zone_id = %s
        ''', (zone_id,))
        
        bounds = cur.fetchone()
        if not bounds:
            return 0
        
        min_x, min_y, max_x, max_y, area_sqm = bounds
        
        # Calculate bay dimensions in degrees (approximately)
        # At Vienna's latitude (~48°), 1 degree lat ≈ 111km, 1 degree lon ≈ 74km
        bay_width_deg = config.bay_width_meters / 74000  # longitude
        bay_length_deg = config.bay_length_meters / 111000  # latitude
        spacing_deg = config.bay_spacing_meters / 74000
        
        # Determine bay count
        if capacity and config.min_bay_count <= capacity <= config.max_bay_count:
            target_bays = capacity
        else:
            # Estimate based on area (assume 15 sqm per bay including access)
            estimated = int(area_sqm / 15)
            target_bays = max(config.min_bay_count, 
                            min(estimated, config.default_bay_count, config.max_bay_count))
        
        bays_created = 0
        bay_prefix = zone_name[:3].upper().replace(' ', '') if zone_name else 'BAY'
        
        if zone_type in ('lot', 'garage', 'off_street'):
            # Grid layout for parking lots
            # Calculate grid dimensions
            width = max_x - min_x
            height = max_y - min_y
            
            cols = max(1, int(width / (bay_width_deg + spacing_deg)))
            rows = max(1, int(height / (bay_length_deg + spacing_deg)))
            
            # Start from center and work outward
            center_x = (min_x + max_x) / 2
            center_y = (min_y + max_y) / 2
            
            bay_positions = []
            for row in range(rows):
                for col in range(cols):
                    if len(bay_positions) >= target_bays:
                        break
                    
                    # Calculate position
                    x = min_x + col * (bay_width_deg + spacing_deg) + spacing_deg
                    y = min_y + row * (bay_length_deg + spacing_deg) + spacing_deg
                    
                    bay_positions.append((x, y))
                
                if len(bay_positions) >= target_bays:
                    break
            
            # Create bay polygons
            for i, (x, y) in enumerate(bay_positions[:target_bays]):
                bay_number = f"{bay_prefix}-{i+1:03d}"
                
                # Create bay polygon
                bay_coords = [
                    [x, y],
                    [x + bay_width_deg, y],
                    [x + bay_width_deg, y + bay_length_deg],
                    [x, y + bay_length_deg],
                    [x, y]
                ]
                
                # Determine special bay types (5% disabled, 5% EV)
                is_disabled = (i % 20 == 0)  # Every 20th bay
                is_electric = (i % 20 == 10)  # Offset from disabled
                
                # Insert bay only if it overlaps the zone
                geojson = f'{{"type":"Polygon","coordinates":[{bay_coords}]}}'
                cur.execute('''
                    INSERT INTO parking_bays 
                    (zone_id, bay_number, is_disabled_only, is_electric, status, 
                     source, generated, geom)
                    SELECT %s, %s, %s, %s, 'available', 'osm', TRUE,
                           ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)
                    WHERE ST_Within(
                        ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326),
                        (SELECT geom FROM parking_zones WHERE zone_id = %s)
                    )
                    ON CONFLICT DO NOTHING
                    RETURNING bay_id
                ''', (zone_id, bay_number, is_disabled, is_electric,
                      geojson, geojson, zone_id))
                
                if cur.fetchone():
                    bays_created += 1
        
        else:
            # On-street / perimeter layout
            # Use ST_GeometryN to handle potential MultiPolygon, then get exterior ring
            cur.execute('''
                SELECT ST_AsGeoJSON(
                    ST_ExteriorRing(
                        CASE WHEN ST_GeometryType(geom) = 'ST_MultiPolygon' 
                             THEN ST_GeometryN(geom, 1)
                             ELSE geom 
                        END
                    )
                )
                FROM parking_zones WHERE zone_id = %s
            ''', (zone_id,))
            
            result = cur.fetchone()
            if not result:
                return 0
            
            import json
            ring = json.loads(result[0])
            coords = ring.get('coordinates', [])
            
            if len(coords) < 4:
                return 0
            
            # Calculate total perimeter length and segment lengths
            segments = []
            total_length = 0
            
            for i in range(len(coords) - 1):
                x1, y1 = coords[i]
                x2, y2 = coords[i + 1]
                
                # Approximate length in meters
                dx = (x2 - x1) * 74000  # longitude to meters at Vienna lat
                dy = (y2 - y1) * 111000  # latitude to meters
                length = math.sqrt(dx*dx + dy*dy)
                
                if length > config.bay_length_meters * 1.5:  # Only use segments long enough for a bay
                    segments.append({
                        'start': (x1, y1),
                        'end': (x2, y2),
                        'length': length,
                        'dx': x2 - x1,
                        'dy': y2 - y1
                    })
                    total_length += length
            
            if not segments:
                return 0
            
            # Distribute bays along segments
            bays_per_segment = max(1, target_bays // len(segments))
            bay_count = 0
            
            for seg in segments:
                if bay_count >= target_bays:
                    break
                
                # Calculate how many bays fit on this segment
                num_bays = min(
                    bays_per_segment,
                    int(seg['length'] / (config.bay_length_meters + config.bay_spacing_meters)),
                    target_bays - bay_count
                )
                
                if num_bays <= 0:
                    continue
                
                # Calculate unit vector along segment
                seg_length_deg = math.sqrt(seg['dx']**2 + seg['dy']**2)
                if seg_length_deg == 0:
                    continue
                    
                ux = seg['dx'] / seg_length_deg
                uy = seg['dy'] / seg_length_deg
                
                # Perpendicular vector (for bay width)
                px = -uy
                py = ux
                
                # Generate bays along segment
                bay_spacing_deg = seg_length_deg / num_bays
                
                for j in range(num_bays):
                    if bay_count >= target_bays:
                        break
                    
                    bay_number = f"{bay_prefix}-{bay_count+1:03d}"
                    
                    # Calculate bay center position along segment
                    t = (j + 0.5) / num_bays
                    cx = seg['start'][0] + t * seg['dx']
                    cy = seg['start'][1] + t * seg['dy']
                    
                    # Create bay polygon (offset inward from boundary)
                    half_length = bay_length_deg / 2
                    half_width = bay_width_deg / 2
                    
                    # Offset inward
                    inward_offset = bay_width_deg * 0.6
                    cx -= px * inward_offset
                    cy -= py * inward_offset
                    
                    bay_coords = [
                        [cx - ux * half_length - px * half_width, 
                         cy - uy * half_length - py * half_width],
                        [cx + ux * half_length - px * half_width, 
                         cy + uy * half_length - py * half_width],
                        [cx + ux * half_length + px * half_width, 
                         cy + uy * half_length + py * half_width],
                        [cx - ux * half_length + px * half_width, 
                         cy - uy * half_length + py * half_width],
                        [cx - ux * half_length - px * half_width, 
                         cy - uy * half_length - py * half_width]
                    ]
                    
                    is_disabled = (bay_count % 20 == 0)
                    is_electric = (bay_count % 20 == 10)
                    
                    geojson = f'{{"type":"Polygon","coordinates":[{bay_coords}]}}'
                    cur.execute('''
                        INSERT INTO parking_bays 
                        (zone_id, bay_number, is_disabled_only, is_electric, status,
                         source, generated, geom)
                        SELECT %s, %s, %s, %s, 'available', 'osm', TRUE,
                               ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)
                        WHERE ST_Within(
                            ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326),
                            (SELECT geom FROM parking_zones WHERE zone_id = %s)
                        )
                        ON CONFLICT DO NOTHING
                        RETURNING bay_id
                    ''', (zone_id, bay_number, is_disabled, is_electric,
                          geojson, geojson, zone_id))
                    
                    if cur.fetchone():
                        bays_created += 1
                    
                    bay_count += 1
        
        # FALLBACK: If no bays were created by grid/perimeter, generate using points inside zone
        if bays_created == 0:
            fallback_count = max(config.min_bay_count, min(target_bays, 8))
            bay_prefix = zone_name[:3].upper().replace(' ', '') if zone_name else 'PAR'
            
            for i in range(fallback_count):
                bay_number = f"{bay_prefix}-{i+1:03d}"
                is_disabled = (i % 20 == 0)
                is_electric = (i % 20 == 10)
                
                # Use a random point inside the zone, then buffer it into a small polygon
                # Add a small random offset so bays don't all stack on the same point
                offset_x = (i * 0.00005) * (1 if i % 2 == 0 else -1)
                offset_y = (i * 0.00003) * (1 if i % 3 == 0 else -1)
                
                cur.execute('''
                    WITH zone_point AS (
                        SELECT ST_PointOnSurface(geom) as pt, geom as zone_geom
                        FROM parking_zones WHERE zone_id = %s
                    ),
                    shifted AS (
                        SELECT ST_Translate(pt, %s, %s) as spt, zone_geom 
                        FROM zone_point
                    ),
                    clamped AS (
                        SELECT CASE 
                            WHEN ST_Within(spt, zone_geom) THEN spt
                            ELSE (SELECT pt FROM zone_point)
                        END as final_pt
                        FROM shifted
                    )
                    INSERT INTO parking_bays 
                    (zone_id, bay_number, is_disabled_only, is_electric, status,
                     source, generated, geom)
                    SELECT %s, %s, %s, %s, 'available', 'osm', TRUE,
                           ST_Buffer(final_pt, 0.00003)
                    FROM clamped
                    ON CONFLICT DO NOTHING
                    RETURNING bay_id
                ''', (zone_id, offset_x, offset_y,
                      zone_id, bay_number, is_disabled, is_electric))
                
                result = cur.fetchone()
                if result:
                    bays_created += 1
        
        return bays_created


def generate_all_bays(clear_existing: bool = False) -> Dict[str, int]:
    """
    Generate bays for all OSM-imported zones
    
    Args:
        clear_existing: If True, delete existing generated bays first
    
    Returns:
        Stats dict with counts
    """
    conn = get_db_connection()
    
    try:
        with conn.cursor() as cur:
            # Disable the validation triggers for bulk insert
            cur.execute('ALTER TABLE parking_bays DISABLE TRIGGER validate_bay_within_zone_trigger')
            cur.execute('ALTER TABLE parking_bays DISABLE TRIGGER validate_bay_geometry_type_trigger')
            
            if clear_existing:
                # Delete existing generated bays
                cur.execute('''
                    DELETE FROM parking_bays 
                    WHERE generated = TRUE AND source = 'osm'
                ''')
                deleted = cur.rowcount
                logger.info(f"Deleted {deleted} existing generated bays")
                conn.commit()
            
            # Get all OSM zones that need bays
            cur.execute('''
                SELECT 
                    z.zone_id,
                    z.name,
                    z.zone_type,
                    z.capacity,
                    z.geom,
                    COALESCE(COUNT(b.bay_id), 0) as existing_bays
                FROM parking_zones z
                LEFT JOIN parking_bays b ON z.zone_id = b.zone_id
                WHERE z.source = 'osm'
                GROUP BY z.zone_id, z.name, z.zone_type, z.capacity, z.geom
                HAVING COALESCE(COUNT(b.bay_id), 0) = 0 OR %s
            ''', (clear_existing,))
            
            zones = cur.fetchall()
            logger.info(f"Found {len(zones)} OSM zones to process")
            
            total_bays = 0
            zones_processed = 0
            
            for zone in zones:
                zone_id, name, zone_type, capacity, geom, existing = zone
                
                if existing > 0 and not clear_existing:
                    continue
                
                try:
                    bays_created = generate_bays_for_zone(
                        conn, zone_id, name, zone_type, capacity, geom
                    )
                    conn.commit()
                    
                    if bays_created > 0:
                        zones_processed += 1
                        total_bays += bays_created
                        logger.debug(f"Zone {zone_id} ({name}): {bays_created} bays")
                    else:
                        logger.debug(f"Zone {zone_id} ({name}): 0 bays generated")
                except Exception as e:
                    logger.warning(f"Skipping zone {zone_id} ({name}): {e}")
                    conn.rollback()
            
            # Re-enable the triggers
            cur.execute('ALTER TABLE parking_bays ENABLE TRIGGER validate_bay_within_zone_trigger')
            cur.execute('ALTER TABLE parking_bays ENABLE TRIGGER validate_bay_geometry_type_trigger')
            conn.commit()
            
            logger.info(f"Generated {total_bays} bays across {zones_processed} zones")
            
            # Update sync log
            cur.execute('''
                UPDATE osm_sync_log 
                SET bays_generated = %s
                WHERE sync_id = (
                    SELECT MAX(sync_id) FROM osm_sync_log 
                    WHERE sync_type = 'parking' AND status = 'completed'
                )
            ''', (total_bays,))
            conn.commit()
            
            return {
                'zones_processed': zones_processed,
                'bays_generated': total_bays
            }
            
    except Exception as e:
        conn.rollback()
        logger.error(f"Error generating bays: {e}")
        raise
    finally:
        conn.close()


def get_bay_stats() -> Dict:
    """Get statistics about parking bays"""
    conn = get_db_connection()
    
    try:
        with conn.cursor() as cur:
            cur.execute('''
                SELECT 
                    source,
                    generated,
                    status,
                    COUNT(*) as count
                FROM parking_bays
                GROUP BY source, generated, status
                ORDER BY source, generated, status
            ''')
            
            stats = {'total': 0}
            for row in cur.fetchall():
                source, generated, status, count = row
                key = f"{source}_{'generated' if generated else 'manual'}_{status}"
                stats[key] = count
                stats['total'] += count
            
            return stats
            
    finally:
        conn.close()


if __name__ == '__main__':
    import sys
    
    print("="*60)
    print("Bay Generator - Creating parking bays in zones")
    print("="*60)
    
    clear = '--clear' in sys.argv or '-c' in sys.argv
    
    if clear:
        print("Will clear existing generated bays first")
    
    results = generate_all_bays(clear_existing=clear)
    
    print("\nResults:")
    print(f"  Zones processed: {results['zones_processed']}")
    print(f"  Bays generated: {results['bays_generated']}")
    
    print("\nBay statistics:")
    stats = get_bay_stats()
    for key, value in sorted(stats.items()):
        print(f"  {key}: {value}")
