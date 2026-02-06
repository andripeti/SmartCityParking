"""
Load GeoJSON files into PostGIS staging tables
"""
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import psycopg2
from psycopg2.extras import execute_values

from config import config

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / 'data'


def get_db_connection():
    """Get database connection"""
    return psycopg2.connect(
        host=config.db_host,
        port=config.db_port,
        database=config.db_name,
        user=config.db_user,
        password=config.db_password
    )


def load_geojson(filename: str) -> Optional[Dict]:
    """Load GeoJSON file from data directory"""
    filepath = DATA_DIR / filename
    if not filepath.exists():
        logger.error(f"File not found: {filepath}")
        return None
    
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def start_sync_log(conn, sync_type: str, query_used: str = None) -> int:
    """Create sync log entry and return sync_id"""
    with conn.cursor() as cur:
        cur.execute('''
            INSERT INTO osm_sync_log (sync_type, area_name, bbox_wkt, query_used, status)
            VALUES (%s, %s, %s, %s, 'running')
            RETURNING sync_id
        ''', (sync_type, 'Vienna', config.bbox_wkt, query_used))
        sync_id = cur.fetchone()[0]
        conn.commit()
        return sync_id


def complete_sync_log(conn, sync_id: int, records_fetched: int, records_inserted: int, 
                      records_updated: int = 0, zones_created: int = 0, bays_generated: int = 0):
    """Mark sync as completed"""
    with conn.cursor() as cur:
        cur.execute('''
            UPDATE osm_sync_log 
            SET completed_at = NOW(), 
                status = 'completed',
                records_fetched = %s,
                records_inserted = %s,
                records_updated = %s,
                zones_created = %s,
                bays_generated = %s
            WHERE sync_id = %s
        ''', (records_fetched, records_inserted, records_updated, zones_created, bays_generated, sync_id))
        conn.commit()


def fail_sync_log(conn, sync_id: int, error_message: str):
    """Mark sync as failed"""
    with conn.cursor() as cur:
        cur.execute('''
            UPDATE osm_sync_log 
            SET completed_at = NOW(), 
                status = 'failed',
                error_message = %s
            WHERE sync_id = %s
        ''', (error_message, sync_id))
        conn.commit()


def load_parking_to_postgis(geojson: Dict) -> Dict[str, int]:
    """
    Load parking GeoJSON into osm_parking_raw table
    
    Returns:
        Stats dict with counts
    """
    features = geojson.get('features', [])
    if not features:
        logger.warning("No features to load")
        return {'fetched': 0, 'inserted': 0, 'updated': 0}
    
    conn = get_db_connection()
    sync_id = start_sync_log(conn, 'parking')
    
    try:
        inserted = 0
        updated = 0
        
        with conn.cursor() as cur:
            for feature in features:
                props = feature.get('properties', {})
                geom = feature.get('geometry')
                
                if not geom:
                    continue
                
                osm_id = props.get('osm_id')
                osm_type = props.get('osm_type', 'way')
                
                # Extract relevant tags
                name = props.get('name', '')
                parking_type = props.get('parking', props.get('parking:type'))
                access_type = props.get('access', 'public')
                capacity = props.get('capacity')
                if capacity:
                    try:
                        capacity = int(capacity)
                    except (ValueError, TypeError):
                        capacity = None
                
                fee = props.get('fee', '')
                operator = props.get('operator', '')
                opening_hours = props.get('opening_hours', '')
                surface = props.get('surface', '')
                
                # Remove special keys from tags before storing
                tags = {k: v for k, v in props.items() 
                       if k not in ['osm_id', 'osm_type']}
                
                geom_json = json.dumps(geom)
                
                try:
                    cur.execute('''
                        INSERT INTO osm_parking_raw 
                        (osm_id, osm_type, name, parking_type, access_type, capacity, 
                         fee, operator, opening_hours, surface, tags, geom)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 
                                ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))
                        ON CONFLICT (osm_id, osm_type) 
                        DO UPDATE SET
                            name = EXCLUDED.name,
                            parking_type = EXCLUDED.parking_type,
                            access_type = EXCLUDED.access_type,
                            capacity = EXCLUDED.capacity,
                            fee = EXCLUDED.fee,
                            operator = EXCLUDED.operator,
                            opening_hours = EXCLUDED.opening_hours,
                            surface = EXCLUDED.surface,
                            tags = EXCLUDED.tags,
                            geom = EXCLUDED.geom,
                            imported_at = NOW()
                    ''', (osm_id, osm_type, name, parking_type, access_type, capacity,
                          fee, operator, opening_hours, surface, json.dumps(tags), geom_json))
                    
                    if cur.rowcount > 0:
                        inserted += 1
                        
                except Exception as e:
                    logger.warning(f"Error inserting parking feature {osm_id}: {e}")
                    continue
        
        conn.commit()
        complete_sync_log(conn, sync_id, len(features), inserted, updated)
        logger.info(f"Loaded {inserted} parking features to osm_parking_raw")
        
        return {'fetched': len(features), 'inserted': inserted, 'updated': updated}
        
    except Exception as e:
        fail_sync_log(conn, sync_id, str(e))
        conn.rollback()
        raise
    finally:
        conn.close()


def load_roads_to_postgis(geojson: Dict) -> Dict[str, int]:
    """
    Load roads GeoJSON into osm_roads_raw table
    
    Returns:
        Stats dict with counts
    """
    features = geojson.get('features', [])
    if not features:
        logger.warning("No features to load")
        return {'fetched': 0, 'inserted': 0, 'updated': 0}
    
    conn = get_db_connection()
    sync_id = start_sync_log(conn, 'roads')
    
    try:
        inserted = 0
        
        with conn.cursor() as cur:
            for feature in features:
                props = feature.get('properties', {})
                geom = feature.get('geometry')
                
                if not geom or geom.get('type') != 'LineString':
                    continue
                
                osm_id = props.get('osm_id')
                osm_type = props.get('osm_type', 'way')
                
                name = props.get('name', '')
                highway_type = props.get('highway', 'unclassified')
                maxspeed = props.get('maxspeed', '')
                surface = props.get('surface', '')
                oneway = props.get('oneway', '')
                lanes = props.get('lanes')
                if lanes:
                    try:
                        lanes = int(lanes)
                    except (ValueError, TypeError):
                        lanes = None
                
                tags = {k: v for k, v in props.items() 
                       if k not in ['osm_id', 'osm_type']}
                
                geom_json = json.dumps(geom)
                
                try:
                    cur.execute('''
                        INSERT INTO osm_roads_raw 
                        (osm_id, osm_type, name, highway_type, maxspeed, surface, oneway, lanes, tags, geom)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 
                                ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))
                        ON CONFLICT (osm_id, osm_type) 
                        DO UPDATE SET
                            name = EXCLUDED.name,
                            highway_type = EXCLUDED.highway_type,
                            maxspeed = EXCLUDED.maxspeed,
                            surface = EXCLUDED.surface,
                            oneway = EXCLUDED.oneway,
                            lanes = EXCLUDED.lanes,
                            tags = EXCLUDED.tags,
                            geom = EXCLUDED.geom,
                            imported_at = NOW()
                    ''', (osm_id, osm_type, name, highway_type, maxspeed, surface, 
                          oneway, lanes, json.dumps(tags), geom_json))
                    
                    if cur.rowcount > 0:
                        inserted += 1
                        
                except Exception as e:
                    logger.warning(f"Error inserting road feature {osm_id}: {e}")
                    continue
        
        conn.commit()
        complete_sync_log(conn, sync_id, len(features), inserted, 0)
        logger.info(f"Loaded {inserted} road features to osm_roads_raw")
        
        return {'fetched': len(features), 'inserted': inserted, 'updated': 0}
        
    except Exception as e:
        fail_sync_log(conn, sync_id, str(e))
        conn.rollback()
        raise
    finally:
        conn.close()


def load_pois_to_postgis(geojson: Dict) -> Dict[str, int]:
    """
    Load POIs GeoJSON into osm_pois_raw table
    
    Returns:
        Stats dict with counts
    """
    features = geojson.get('features', [])
    if not features:
        logger.warning("No features to load")
        return {'fetched': 0, 'inserted': 0, 'updated': 0}
    
    conn = get_db_connection()
    sync_id = start_sync_log(conn, 'pois')
    
    try:
        inserted = 0
        
        with conn.cursor() as cur:
            for feature in features:
                props = feature.get('properties', {})
                geom = feature.get('geometry')
                
                if not geom:
                    continue
                
                # Convert non-point geometries to centroid
                if geom.get('type') != 'Point':
                    geom_json = json.dumps(geom)
                    cur.execute('''
                        SELECT ST_AsGeoJSON(ST_Centroid(ST_GeomFromGeoJSON(%s)))::json
                    ''', (geom_json,))
                    result = cur.fetchone()
                    if result:
                        geom = result[0]
                    else:
                        continue
                
                osm_id = props.get('osm_id')
                osm_type = props.get('osm_type', 'node')
                
                name = props.get('name', '')
                amenity = props.get('amenity', '')
                railway = props.get('railway', '')
                public_transport = props.get('public_transport', '')
                
                tags = {k: v for k, v in props.items() 
                       if k not in ['osm_id', 'osm_type']}
                
                geom_json = json.dumps(geom)
                
                try:
                    cur.execute('''
                        INSERT INTO osm_pois_raw 
                        (osm_id, osm_type, name, amenity, railway, public_transport, tags, geom)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, 
                                ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))
                        ON CONFLICT (osm_id, osm_type) 
                        DO UPDATE SET
                            name = EXCLUDED.name,
                            amenity = EXCLUDED.amenity,
                            railway = EXCLUDED.railway,
                            public_transport = EXCLUDED.public_transport,
                            tags = EXCLUDED.tags,
                            geom = EXCLUDED.geom,
                            imported_at = NOW()
                    ''', (osm_id, osm_type, name, amenity, railway, public_transport, 
                          json.dumps(tags), geom_json))
                    
                    if cur.rowcount > 0:
                        inserted += 1
                        
                except Exception as e:
                    logger.warning(f"Error inserting POI feature {osm_id}: {e}")
                    continue
        
        conn.commit()
        complete_sync_log(conn, sync_id, len(features), inserted, 0)
        logger.info(f"Loaded {inserted} POI features to osm_pois_raw")
        
        return {'fetched': len(features), 'inserted': inserted, 'updated': 0}
        
    except Exception as e:
        fail_sync_log(conn, sync_id, str(e))
        conn.rollback()
        raise
    finally:
        conn.close()


def load_all_from_files() -> Dict[str, Dict[str, int]]:
    """Load all GeoJSON files from data directory"""
    results = {}
    
    # Load parking
    parking_geojson = load_geojson('vienna_parking.geojson')
    if parking_geojson:
        results['parking'] = load_parking_to_postgis(parking_geojson)
    
    # Load roads
    roads_geojson = load_geojson('vienna_roads.geojson')
    if roads_geojson:
        results['roads'] = load_roads_to_postgis(roads_geojson)
    
    # Load POIs
    pois_geojson = load_geojson('vienna_pois.geojson')
    if pois_geojson:
        results['pois'] = load_pois_to_postgis(pois_geojson)
    
    return results


if __name__ == '__main__':
    import sys
    
    print("="*60)
    print("PostGIS Loader - Loading GeoJSON to Database")
    print(f"Database: {config.db_host}:{config.db_port}/{config.db_name}")
    print("="*60)
    
    if len(sys.argv) > 1:
        load_type = sys.argv[1].lower()
        
        if load_type == 'parking':
            geojson = load_geojson('vienna_parking.geojson')
            if geojson:
                load_parking_to_postgis(geojson)
        elif load_type == 'roads':
            geojson = load_geojson('vienna_roads.geojson')
            if geojson:
                load_roads_to_postgis(geojson)
        elif load_type == 'pois':
            geojson = load_geojson('vienna_pois.geojson')
            if geojson:
                load_pois_to_postgis(geojson)
        else:
            print(f"Unknown type: {load_type}")
            print("Usage: python load_postgis.py [parking|roads|pois]")
            sys.exit(1)
    else:
        results = load_all_from_files()
        print("\n" + "="*60)
        print("Load complete!")
        for data_type, stats in results.items():
            print(f"  {data_type}: {stats}")
        print("="*60)
