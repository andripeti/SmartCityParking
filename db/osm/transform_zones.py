"""
Transform OSM parking data into application parking_zones table
"""
import logging
from typing import Dict, List, Tuple

import psycopg2

from config import PARKING_TYPE_MAP, VIENNA_TARIFFS, config

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


def ensure_tariffs_exist(conn) -> Dict[str, int]:
    """
    Ensure Vienna tariff schedules exist and return their IDs
    """
    tariff_ids = {}
    
    with conn.cursor() as cur:
        # Premium tariff (inner districts)
        cur.execute('''
            INSERT INTO tariff_schedules (name, hourly_rate, currency, valid_from_time, valid_to_time, valid_days, notes)
            VALUES (%s, %s, 'EUR', '09:00', '22:00', 'Mon-Fri', 'Vienna Kurzparkzone - Inner Districts (Bezirk 1-9)')
            ON CONFLICT DO NOTHING
            RETURNING tariff_schedule_id
        ''', (VIENNA_TARIFFS['premium']['name'], VIENNA_TARIFFS['premium']['hourly_rate']))
        
        result = cur.fetchone()
        if result:
            tariff_ids['premium'] = result[0]
        else:
            # Get existing
            cur.execute("SELECT tariff_schedule_id FROM tariff_schedules WHERE name = %s", 
                       (VIENNA_TARIFFS['premium']['name'],))
            result = cur.fetchone()
            if result:
                tariff_ids['premium'] = result[0]
            else:
                tariff_ids['premium'] = 3  # Fallback to seed data premium
        
        # Standard tariff (outer districts)
        cur.execute('''
            INSERT INTO tariff_schedules (name, hourly_rate, currency, valid_from_time, valid_to_time, valid_days, notes)
            VALUES (%s, %s, 'EUR', '09:00', '22:00', 'Mon-Fri', 'Vienna Kurzparkzone - Outer Districts (Bezirk 10-23)')
            ON CONFLICT DO NOTHING
            RETURNING tariff_schedule_id
        ''', (VIENNA_TARIFFS['standard']['name'], VIENNA_TARIFFS['standard']['hourly_rate']))
        
        result = cur.fetchone()
        if result:
            tariff_ids['standard'] = result[0]
        else:
            cur.execute("SELECT tariff_schedule_id FROM tariff_schedules WHERE name = %s",
                       (VIENNA_TARIFFS['standard']['name'],))
            result = cur.fetchone()
            if result:
                tariff_ids['standard'] = result[0]
            else:
                tariff_ids['standard'] = 1  # Fallback to seed data standard
    
    conn.commit()
    logger.info(f"Tariff IDs: {tariff_ids}")
    return tariff_ids


def transform_parking_to_zones() -> Dict[str, int]:
    """
    Transform osm_parking_raw entries into parking_zones
    
    Returns:
        Stats dict with counts
    """
    conn = get_db_connection()
    
    try:
        tariff_ids = ensure_tariffs_exist(conn)
        
        zones_created = 0
        zones_updated = 0
        
        with conn.cursor() as cur:
            # Get all parking features that are polygons
            cur.execute('''
                SELECT 
                    osm_id,
                    osm_type,
                    name,
                    parking_type,
                    access_type,
                    capacity,
                    fee,
                    operator,
                    opening_hours,
                    tags,
                    geom,
                    ST_GeometryType(geom) as geom_type
                FROM osm_parking_raw
                WHERE ST_GeometryType(geom) IN ('ST_Polygon', 'ST_MultiPolygon')
                  AND (access_type IS NULL OR access_type NOT IN ('private', 'no'))
            ''')
            
            parking_features = cur.fetchall()
            logger.info(f"Found {len(parking_features)} polygon parking features to transform")
            
            for row in parking_features:
                (osm_id, osm_type, name, parking_type, access_type, capacity,
                 fee, operator, opening_hours, tags, geom, geom_type) = row
                
                # Determine zone name
                zone_name = name if name else f"Parking {osm_id}"
                if operator and not name:
                    zone_name = f"{operator} Parking"
                
                # Determine zone type
                zone_type = PARKING_TYPE_MAP.get(parking_type, 'on_street')
                
                # Determine max duration based on zone type and location
                if zone_type == 'garage':
                    max_duration = 480  # 8 hours for garages
                elif zone_type == 'lot':
                    max_duration = 240  # 4 hours for lots
                else:
                    max_duration = 120  # 2 hours for on-street
                
                # Get tariff based on location
                cur.execute('''
                    SELECT get_vienna_tariff_by_location(%s)
                ''', (geom,))
                tariff_result = cur.fetchone()
                tariff_id = tariff_result[0] if tariff_result else tariff_ids['standard']
                
                # Ensure geometry is valid polygon
                cur.execute('''
                    SELECT ST_IsValid(%s), ST_Area(%s::geography)
                ''', (geom, geom))
                is_valid, area = cur.fetchone()
                
                if not is_valid or area < 50:  # Skip invalid or tiny polygons
                    logger.debug(f"Skipping invalid/tiny polygon: osm_id={osm_id}, area={area}")
                    continue
                
                # Insert or update zone
                # First check if zone with this osm_id exists
                cur.execute('''
                    SELECT zone_id FROM parking_zones WHERE osm_id = %s
                ''', (osm_id,))
                existing = cur.fetchone()
                
                if existing:
                    # Update existing zone
                    cur.execute('''
                        UPDATE parking_zones SET
                            name = %s,
                            zone_type = %s,
                            max_duration_minutes = %s,
                            capacity = %s,
                            last_osm_sync = NOW(),
                            geom = %s
                        WHERE osm_id = %s
                    ''', (zone_name, zone_type, max_duration, capacity, geom, osm_id))
                    zones_updated += 1
                else:
                    # Insert new zone
                    cur.execute('''
                        INSERT INTO parking_zones 
                        (name, zone_type, max_duration_minutes, tariff_schedule_id, is_active, 
                         osm_id, osm_type, source, capacity, last_osm_sync, geom)
                        VALUES (%s, %s, %s, %s, TRUE, %s, %s, 'osm', %s, NOW(), %s)
                    ''', (zone_name, zone_type, max_duration, tariff_id,
                          osm_id, osm_type, capacity, geom))
                    zones_created += 1
            
            # Handle point parking features - create small buffer polygons
            cur.execute('''
                SELECT 
                    osm_id,
                    osm_type,
                    name,
                    parking_type,
                    access_type,
                    capacity,
                    operator,
                    geom
                FROM osm_parking_raw
                WHERE ST_GeometryType(geom) = 'ST_Point'
                  AND (access_type IS NULL OR access_type NOT IN ('private', 'no'))
            ''')
            
            point_features = cur.fetchall()
            logger.info(f"Found {len(point_features)} point parking features to transform")
            
            for row in point_features:
                (osm_id, osm_type, name, parking_type, access_type, capacity, operator, geom) = row
                
                zone_name = name if name else f"Parking {osm_id}"
                if operator and not name:
                    zone_name = f"{operator} Parking"
                
                zone_type = PARKING_TYPE_MAP.get(parking_type, 'on_street')
                max_duration = 120 if zone_type == 'on_street' else 240
                
                # Get tariff based on location
                cur.execute('SELECT get_vienna_tariff_by_location(%s)', (geom,))
                tariff_id = cur.fetchone()[0]
                
                # Check if zone already exists
                cur.execute('SELECT zone_id FROM parking_zones WHERE osm_id = %s', (osm_id,))
                existing = cur.fetchone()
                
                if existing:
                    cur.execute('''
                        UPDATE parking_zones SET name = %s, last_osm_sync = NOW()
                        WHERE osm_id = %s
                    ''', (zone_name, osm_id))
                else:
                    # Create a ~30m buffer polygon around the point
                    cur.execute('''
                        INSERT INTO parking_zones 
                        (name, zone_type, max_duration_minutes, tariff_schedule_id, is_active,
                         osm_id, osm_type, source, capacity, last_osm_sync, geom)
                        VALUES (%s, %s, %s, %s, TRUE, %s, %s, 'osm', %s, NOW(),
                                ST_SetSRID(ST_Buffer(%s::geography, 30)::geometry, 4326))
                    ''', (zone_name, zone_type, max_duration, tariff_id,
                          osm_id, osm_type, capacity, geom))
                    zones_created += 1
        
        conn.commit()
        
        logger.info(f"Transformation complete: {zones_created} zones created, {zones_updated} zones updated")
        return {
            'zones_created': zones_created,
            'zones_updated': zones_updated
        }
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Error transforming zones: {e}")
        raise
    finally:
        conn.close()


def get_zone_stats() -> Dict:
    """Get statistics about parking zones"""
    conn = get_db_connection()
    
    try:
        with conn.cursor() as cur:
            cur.execute('''
                SELECT 
                    source,
                    zone_type,
                    COUNT(*) as count,
                    SUM(capacity) as total_capacity
                FROM parking_zones
                GROUP BY source, zone_type
                ORDER BY source, zone_type
            ''')
            
            stats = {}
            for row in cur.fetchall():
                source, zone_type, count, capacity = row
                if source not in stats:
                    stats[source] = {}
                stats[source][zone_type] = {
                    'count': count,
                    'capacity': capacity or 0
                }
            
            return stats
            
    finally:
        conn.close()


if __name__ == '__main__':
    print("="*60)
    print("Transform OSM Parking to Zones")
    print("="*60)
    
    results = transform_parking_to_zones()
    
    print("\nResults:")
    print(f"  Zones created: {results['zones_created']}")
    print(f"  Zones updated: {results['zones_updated']}")
    
    print("\nCurrent zone statistics:")
    stats = get_zone_stats()
    for source, types in stats.items():
        print(f"\n  Source: {source}")
        for zone_type, data in types.items():
            print(f"    {zone_type}: {data['count']} zones, capacity: {data['capacity']}")
