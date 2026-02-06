"""
Fetch Vienna parking, roads, and POI data from OpenStreetMap via Overpass API
"""
import json
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

from config import OVERPASS_QUERIES, config

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Output directory for cached GeoJSON files
OUTPUT_DIR = Path(__file__).parent / 'data'


def fetch_overpass(query_type: str) -> Optional[Dict[str, Any]]:
    """
    Fetch data from Overpass API
    
    Args:
        query_type: One of 'parking', 'roads', 'pois'
        
    Returns:
        Raw Overpass JSON response or None if error
    """
    if query_type not in OVERPASS_QUERIES:
        logger.error(f"Unknown query type: {query_type}")
        return None
    
    query = OVERPASS_QUERIES[query_type].format(
        timeout=config.overpass_timeout,
        bbox=config.bbox_string
    )
    
    logger.info(f"Fetching {query_type} data from Overpass API...")
    logger.debug(f"Query:\n{query}")
    
    try:
        response = requests.post(
            config.overpass_url,
            data={'data': query},
            timeout=config.overpass_timeout + 30,
            headers={'User-Agent': 'ViennaParkingImporter/1.0'}
        )
        response.raise_for_status()
        
        data = response.json()
        element_count = len(data.get('elements', []))
        logger.info(f"Received {element_count} elements for {query_type}")
        
        return data
        
    except requests.Timeout:
        logger.error(f"Timeout fetching {query_type} data")
        return None
    except requests.RequestException as e:
        logger.error(f"Request error fetching {query_type}: {e}")
        return None
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}")
        return None


def elements_to_geojson(elements: List[Dict], element_type: str) -> Dict:
    """
    Convert Overpass elements to GeoJSON FeatureCollection
    
    Args:
        elements: List of Overpass elements
        element_type: Type of feature ('parking', 'roads', 'pois')
        
    Returns:
        GeoJSON FeatureCollection
    """
    features = []
    
    # Build node lookup for ways
    nodes = {}
    for el in elements:
        if el['type'] == 'node':
            nodes[el['id']] = (el['lon'], el['lat'])
    
    for el in elements:
        if el['type'] == 'node' and 'tags' in el:
            # Point feature
            feature = {
                'type': 'Feature',
                'id': el['id'],
                'properties': {
                    'osm_id': el['id'],
                    'osm_type': 'node',
                    **el.get('tags', {})
                },
                'geometry': {
                    'type': 'Point',
                    'coordinates': [el['lon'], el['lat']]
                }
            }
            features.append(feature)
            
        elif el['type'] == 'way' and 'tags' in el:
            # Get way coordinates
            coords = []
            for node_id in el.get('nodes', []):
                if node_id in nodes:
                    coords.append(nodes[node_id])
            
            if len(coords) < 2:
                continue
            
            # Determine geometry type
            if element_type == 'roads':
                # Roads are always LineStrings
                geom = {
                    'type': 'LineString',
                    'coordinates': coords
                }
            else:
                # Parking/POIs: check if closed polygon
                if coords[0] == coords[-1] and len(coords) >= 4:
                    geom = {
                        'type': 'Polygon',
                        'coordinates': [coords]
                    }
                else:
                    # Treat as LineString if not closed
                    geom = {
                        'type': 'LineString',
                        'coordinates': coords
                    }
            
            feature = {
                'type': 'Feature',
                'id': el['id'],
                'properties': {
                    'osm_id': el['id'],
                    'osm_type': 'way',
                    **el.get('tags', {})
                },
                'geometry': geom
            }
            features.append(feature)
    
    return {
        'type': 'FeatureCollection',
        'features': features,
        'metadata': {
            'source': 'OpenStreetMap via Overpass API',
            'area': 'Vienna, Austria',
            'bbox': list(config.vienna_bbox),
            'fetched_at': datetime.utcnow().isoformat(),
            'feature_count': len(features),
            'license': 'ODbL 1.0 - Data © OpenStreetMap contributors'
        }
    }


def save_geojson(geojson: Dict, filename: str) -> Path:
    """Save GeoJSON to file"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filepath = OUTPUT_DIR / filename
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, indent=2, ensure_ascii=False)
    
    logger.info(f"Saved {len(geojson['features'])} features to {filepath}")
    return filepath


def fetch_and_save_all() -> Dict[str, Path]:
    """
    Fetch all data types and save as GeoJSON files
    
    Returns:
        Dictionary of {type: filepath} for saved files
    """
    saved_files = {}
    
    for query_type in ['parking', 'roads', 'pois']:
        logger.info(f"\n{'='*50}")
        logger.info(f"Processing: {query_type}")
        logger.info('='*50)
        
        # Fetch from Overpass
        raw_data = fetch_overpass(query_type)
        if not raw_data:
            logger.warning(f"Failed to fetch {query_type}, skipping...")
            continue
        
        # Convert to GeoJSON
        geojson = elements_to_geojson(
            raw_data.get('elements', []),
            query_type
        )
        
        # Save to file
        filename = f"vienna_{query_type}.geojson"
        filepath = save_geojson(geojson, filename)
        saved_files[query_type] = filepath
        
        # Rate limiting - be nice to Overpass API
        logger.info("Waiting 5 seconds before next query (rate limiting)...")
        time.sleep(5)
    
    return saved_files


def fetch_parking() -> Optional[Path]:
    """Fetch only parking data"""
    raw_data = fetch_overpass('parking')
    if not raw_data:
        return None
    
    geojson = elements_to_geojson(raw_data.get('elements', []), 'parking')
    return save_geojson(geojson, 'vienna_parking.geojson')


def fetch_roads() -> Optional[Path]:
    """Fetch only roads data"""
    raw_data = fetch_overpass('roads')
    if not raw_data:
        return None
    
    geojson = elements_to_geojson(raw_data.get('elements', []), 'roads')
    return save_geojson(geojson, 'vienna_roads.geojson')


def fetch_pois() -> Optional[Path]:
    """Fetch only POIs data"""
    raw_data = fetch_overpass('pois')
    if not raw_data:
        return None
    
    geojson = elements_to_geojson(raw_data.get('elements', []), 'pois')
    return save_geojson(geojson, 'vienna_pois.geojson')


if __name__ == '__main__':
    print("="*60)
    print("Vienna OSM Data Fetcher")
    print(f"Bounding box: {config.bbox_string}")
    print(f"Overpass URL: {config.overpass_url}")
    print("="*60)
    
    # Check for specific type argument
    if len(sys.argv) > 1:
        fetch_type = sys.argv[1].lower()
        if fetch_type == 'parking':
            fetch_parking()
        elif fetch_type == 'roads':
            fetch_roads()
        elif fetch_type == 'pois':
            fetch_pois()
        else:
            print(f"Unknown type: {fetch_type}")
            print("Usage: python fetch_vienna.py [parking|roads|pois]")
            sys.exit(1)
    else:
        # Fetch all
        saved = fetch_and_save_all()
        print("\n" + "="*60)
        print("Fetch complete!")
        print(f"Saved {len(saved)} files:")
        for ft, fp in saved.items():
            print(f"  - {ft}: {fp}")
        print("="*60)
