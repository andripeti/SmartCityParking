"""
Import OSM roads into street_segments table
"""
import logging
from typing import Dict

import psycopg2

from config import HIGHWAY_TYPE_MAP, config

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


def import_roads_to_streets() -> Dict[str, int]:
    """
    Transform osm_roads_raw entries into street_segments
    
    Returns:
        Stats dict with counts
    """
    conn = get_db_connection()
    
    try:
        streets_created = 0
        streets_updated = 0
        
        with conn.cursor() as cur:
            # Get roads with names (skip unnamed small roads)
            cur.execute('''
                SELECT 
                    osm_id,
                    osm_type,
                    name,
                    highway_type,
                    maxspeed,
                    tags,
                    geom
                FROM osm_roads_raw
                WHERE name IS NOT NULL 
                  AND name != ''
                  AND highway_type IN ('primary', 'secondary', 'tertiary', 
                                       'residential', 'living_street', 'unclassified')
            ''')
            
            roads = cur.fetchall()
            logger.info(f"Found {len(roads)} named roads to import")
            
            for row in roads:
                osm_id, osm_type, name, highway_type, maxspeed, tags, geom = row
                
                # Map highway type to our road_type
                road_type = HIGHWAY_TYPE_MAP.get(highway_type, 'local')
                
                # Parse speed limit
                speed_limit = None
                if maxspeed:
                    try:
                        # Handle formats like "50", "50 km/h", "30;50"
                        speed_str = maxspeed.split(';')[0].split()[0]
                        speed_limit = int(speed_str)
                    except (ValueError, IndexError):
                        pass
                
                # Default speed limits by road type
                if not speed_limit:
                    speed_limit = {
                        'primary': 50,
                        'secondary': 50,
                        'local': 30
                    }.get(road_type, 30)
                
                # Insert or update street segment
                # Check if exists first
                cur.execute('SELECT street_id FROM street_segments WHERE osm_id = %s', (osm_id,))
                existing = cur.fetchone()
                
                if existing:
                    cur.execute('''
                        UPDATE street_segments SET
                            name = %s,
                            road_type = %s,
                            speed_limit_kph = %s,
                            highway_type = %s,
                            last_osm_sync = NOW(),
                            geom = %s
                        WHERE osm_id = %s
                    ''', (name, road_type, speed_limit, highway_type, geom, osm_id))
                    streets_updated += 1
                else:
                    cur.execute('''
                        INSERT INTO street_segments 
                        (name, road_type, speed_limit_kph, osm_id, osm_type, source, 
                         highway_type, last_osm_sync, geom)
                        VALUES (%s, %s, %s, %s, %s, 'osm', %s, NOW(), %s)
                    ''', (name, road_type, speed_limit, osm_id, osm_type, highway_type, geom))
                    streets_created += 1
            
            # Also import major unnamed roads with generated names
            cur.execute('''
                SELECT 
                    osm_id,
                    osm_type,
                    highway_type,
                    maxspeed,
                    geom
                FROM osm_roads_raw
                WHERE (name IS NULL OR name = '')
                  AND highway_type IN ('primary', 'secondary', 'tertiary')
            ''')
            
            unnamed_roads = cur.fetchall()
            logger.info(f"Found {len(unnamed_roads)} major unnamed roads to import")
            
            for row in unnamed_roads:
                osm_id, osm_type, highway_type, maxspeed, geom = row
                
                road_type = HIGHWAY_TYPE_MAP.get(highway_type, 'local')
                name = f"{highway_type.title()} Road {osm_id}"
                
                speed_limit = None
                if maxspeed:
                    try:
                        speed_limit = int(maxspeed.split()[0])
                    except (ValueError, IndexError):
                        pass
                
                if not speed_limit:
                    speed_limit = 50 if road_type == 'primary' else 40
                
                # Check if exists
                cur.execute('SELECT street_id FROM street_segments WHERE osm_id = %s', (osm_id,))
                if not cur.fetchone():
                    cur.execute('''
                        INSERT INTO street_segments 
                        (name, road_type, speed_limit_kph, osm_id, osm_type, source,
                         highway_type, last_osm_sync, geom)
                        VALUES (%s, %s, %s, %s, %s, 'osm', %s, NOW(), %s)
                    ''', (name, road_type, speed_limit, osm_id, osm_type, highway_type, geom))
                    streets_created += 1
        
        conn.commit()
        logger.info(f"Import complete: {streets_created} streets created, {streets_updated} updated")
        
        return {
            'streets_created': streets_created,
            'streets_updated': streets_updated
        }
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Error importing roads: {e}")
        raise
    finally:
        conn.close()


def import_pois() -> Dict[str, int]:
    """
    Import POIs from osm_pois_raw to points_of_interest
    
    Returns:
        Stats dict with counts
    """
    conn = get_db_connection()
    
    try:
        pois_created = 0
        
        # POI type mapping
        poi_type_map = {
            'school': 'education',
            'university': 'education',
            'hospital': 'healthcare',
            'clinic': 'healthcare',
            'doctors': 'healthcare',
            'bus_station': 'transport',
            'townhall': 'government',
            'courthouse': 'government',
            'police': 'government'
        }
        
        with conn.cursor() as cur:
            # Import amenity-based POIs
            cur.execute('''
                SELECT 
                    osm_id,
                    name,
                    amenity,
                    tags,
                    geom
                FROM osm_pois_raw
                WHERE amenity IS NOT NULL 
                  AND amenity != ''
                  AND name IS NOT NULL
                  AND name != ''
            ''')
            
            pois = cur.fetchall()
            logger.info(f"Found {len(pois)} named POIs to import")
            
            for row in pois:
                osm_id, name, amenity, tags, geom = row
                
                poi_type = poi_type_map.get(amenity, 'other')
                address = tags.get('addr:street', '') if tags else ''
                if tags and tags.get('addr:housenumber'):
                    address = f"{address} {tags.get('addr:housenumber')}"
                
                cur.execute('''
                    INSERT INTO points_of_interest (name, poi_type, address, geom)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    RETURNING poi_id
                ''', (name, poi_type, address.strip(), geom))
                
                if cur.fetchone():
                    pois_created += 1
            
            # Import railway stations
            cur.execute('''
                SELECT 
                    osm_id,
                    name,
                    railway,
                    tags,
                    geom
                FROM osm_pois_raw
                WHERE railway IS NOT NULL 
                  AND railway IN ('station', 'halt')
                  AND name IS NOT NULL
                  AND name != ''
            ''')
            
            stations = cur.fetchall()
            logger.info(f"Found {len(stations)} railway stations to import")
            
            for row in stations:
                osm_id, name, railway, tags, geom = row
                
                cur.execute('''
                    INSERT INTO points_of_interest (name, poi_type, address, geom)
                    VALUES (%s, 'transport', '', %s)
                    ON CONFLICT DO NOTHING
                    RETURNING poi_id
                ''', (name, geom))
                
                if cur.fetchone():
                    pois_created += 1
        
        conn.commit()
        logger.info(f"Imported {pois_created} POIs")
        
        return {'pois_created': pois_created}
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Error importing POIs: {e}")
        raise
    finally:
        conn.close()


def get_street_stats() -> Dict:
    """Get statistics about street segments"""
    conn = get_db_connection()
    
    try:
        with conn.cursor() as cur:
            cur.execute('''
                SELECT 
                    source,
                    road_type,
                    COUNT(*) as count,
                    SUM(ST_Length(geom::geography)) / 1000 as total_km
                FROM street_segments
                GROUP BY source, road_type
                ORDER BY source, road_type
            ''')
            
            stats = {}
            for row in cur.fetchall():
                source, road_type, count, km = row
                if source not in stats:
                    stats[source] = {}
                stats[source][road_type] = {
                    'count': count,
                    'total_km': round(km, 2) if km else 0
                }
            
            return stats
            
    finally:
        conn.close()


if __name__ == '__main__':
    print("="*60)
    print("Import OSM Roads to Street Segments")
    print("="*60)
    
    # Import streets
    street_results = import_roads_to_streets()
    print("\nStreet Results:")
    print(f"  Created: {street_results['streets_created']}")
    print(f"  Updated: {street_results['streets_updated']}")
    
    # Import POIs
    poi_results = import_pois()
    print("\nPOI Results:")
    print(f"  Created: {poi_results['pois_created']}")
    
    print("\nStreet statistics:")
    stats = get_street_stats()
    for source, types in stats.items():
        print(f"\n  Source: {source}")
        for road_type, data in types.items():
            print(f"    {road_type}: {data['count']} segments, {data['total_km']} km")
