#!/usr/bin/env python3
"""
OSM Import Pipeline Orchestrator
Main entry point for importing Vienna parking data from OpenStreetMap
"""
import argparse
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def run_fetch():
    """Fetch data from Overpass API"""
    logger.info("="*60)
    logger.info("STEP 1: Fetching data from OpenStreetMap via Overpass API")
    logger.info("="*60)
    
    from fetch_vienna import fetch_and_save_all
    
    saved_files = fetch_and_save_all()
    return len(saved_files) > 0


def run_load():
    """Load GeoJSON files into PostGIS staging tables"""
    logger.info("\n" + "="*60)
    logger.info("STEP 2: Loading GeoJSON data into PostGIS staging tables")
    logger.info("="*60)
    
    from load_postgis import load_all_from_files
    
    results = load_all_from_files()
    return bool(results)


def run_transform():
    """Transform staging data into application tables"""
    logger.info("\n" + "="*60)
    logger.info("STEP 3: Transforming OSM data into parking zones")
    logger.info("="*60)
    
    from transform_zones import transform_parking_to_zones, get_zone_stats
    
    results = transform_parking_to_zones()
    
    logger.info("\nZone statistics after transform:")
    stats = get_zone_stats()
    for source, types in stats.items():
        logger.info(f"  Source: {source}")
        for zone_type, data in types.items():
            logger.info(f"    {zone_type}: {data['count']} zones")
    
    return results.get('zones_created', 0) > 0


def run_generate_bays(clear: bool = False):
    """Generate parking bays inside zones"""
    logger.info("\n" + "="*60)
    logger.info("STEP 4: Generating parking bays inside zones")
    logger.info("="*60)
    
    from generate_bays import generate_all_bays, get_bay_stats
    
    results = generate_all_bays(clear_existing=clear)
    
    logger.info("\nBay statistics after generation:")
    stats = get_bay_stats()
    for key, value in sorted(stats.items()):
        logger.info(f"  {key}: {value}")
    
    return results.get('bays_generated', 0) > 0


def run_import_roads():
    """Import roads into street_segments"""
    logger.info("\n" + "="*60)
    logger.info("STEP 5: Importing roads into street segments")
    logger.info("="*60)
    
    from import_roads import import_roads_to_streets, import_pois, get_street_stats
    
    street_results = import_roads_to_streets()
    poi_results = import_pois()
    
    logger.info("\nStreet statistics after import:")
    stats = get_street_stats()
    for source, types in stats.items():
        logger.info(f"  Source: {source}")
        for road_type, data in types.items():
            logger.info(f"    {road_type}: {data['count']} segments, {data['total_km']} km")
    
    return street_results.get('streets_created', 0) > 0


def run_full_pipeline(skip_fetch: bool = False, clear_bays: bool = False):
    """Run the full import pipeline"""
    start_time = datetime.now()
    
    logger.info("="*70)
    logger.info("  VIENNA OSM PARKING DATA IMPORT PIPELINE")
    logger.info("="*70)
    logger.info(f"Started at: {start_time}")
    logger.info("")
    
    steps = []
    
    # Step 1: Fetch
    if not skip_fetch:
        success = run_fetch()
        steps.append(('Fetch from Overpass', success))
        if not success:
            logger.warning("Fetch failed, but continuing with existing data if available...")
    else:
        logger.info("Skipping fetch step (using existing data)")
        steps.append(('Fetch from Overpass', 'skipped'))
    
    # Step 2: Load
    success = run_load()
    steps.append(('Load to PostGIS', success))
    if not success:
        logger.error("Load step failed, cannot continue")
        return False
    
    # Step 3: Transform
    success = run_transform()
    steps.append(('Transform to zones', success))
    
    # Step 4: Generate bays
    success = run_generate_bays(clear=clear_bays)
    steps.append(('Generate bays', success))
    
    # Step 5: Import roads
    success = run_import_roads()
    steps.append(('Import roads', success))
    
    # Summary
    end_time = datetime.now()
    duration = end_time - start_time
    
    logger.info("\n" + "="*70)
    logger.info("  IMPORT PIPELINE COMPLETE")
    logger.info("="*70)
    logger.info(f"Duration: {duration}")
    logger.info("\nStep Results:")
    for step_name, result in steps:
        status = "✓ Success" if result == True else ("○ Skipped" if result == 'skipped' else "✗ Failed")
        logger.info(f"  {status}: {step_name}")
    logger.info("="*70)
    
    return all(r != False for r in [s[1] for s in steps])


def print_stats():
    """Print current database statistics"""
    logger.info("="*60)
    logger.info("  CURRENT DATABASE STATISTICS")
    logger.info("="*60)
    
    from transform_zones import get_zone_stats
    from generate_bays import get_bay_stats
    from import_roads import get_street_stats
    
    print("\nParking Zones:")
    zone_stats = get_zone_stats()
    for source, types in zone_stats.items():
        print(f"  Source: {source}")
        for zone_type, data in types.items():
            print(f"    {zone_type}: {data['count']} zones, capacity: {data['capacity']}")
    
    print("\nParking Bays:")
    bay_stats = get_bay_stats()
    for key, value in sorted(bay_stats.items()):
        print(f"  {key}: {value}")
    
    print("\nStreet Segments:")
    street_stats = get_street_stats()
    for source, types in street_stats.items():
        print(f"  Source: {source}")
        for road_type, data in types.items():
            print(f"    {road_type}: {data['count']} segments, {data['total_km']} km")


def main():
    parser = argparse.ArgumentParser(
        description='Vienna OSM Parking Data Import Pipeline',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  python run_import.py --all              # Run full pipeline (fetch + load + transform)
  python run_import.py --all --skip-fetch # Use existing GeoJSON files
  python run_import.py --fetch            # Only fetch from Overpass API
  python run_import.py --load             # Only load GeoJSON to PostGIS
  python run_import.py --transform        # Only transform to zones
  python run_import.py --generate-bays    # Only generate parking bays
  python run_import.py --import-roads     # Only import roads
  python run_import.py --stats            # Show current database statistics
        '''
    )
    
    parser.add_argument('--all', '-a', action='store_true',
                       help='Run full import pipeline')
    parser.add_argument('--fetch', '-f', action='store_true',
                       help='Fetch data from Overpass API')
    parser.add_argument('--load', '-l', action='store_true',
                       help='Load GeoJSON files to PostGIS')
    parser.add_argument('--transform', '-t', action='store_true',
                       help='Transform OSM data to parking zones')
    parser.add_argument('--generate-bays', '-g', action='store_true',
                       help='Generate parking bays inside zones')
    parser.add_argument('--import-roads', '-r', action='store_true',
                       help='Import roads to street_segments')
    parser.add_argument('--stats', '-s', action='store_true',
                       help='Show current database statistics')
    parser.add_argument('--skip-fetch', action='store_true',
                       help='Skip fetch step when using --all')
    parser.add_argument('--clear-bays', action='store_true',
                       help='Clear existing generated bays before regenerating')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Verbose output')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # If no action specified, show help
    if not any([args.all, args.fetch, args.load, args.transform, 
                args.generate_bays, args.import_roads, args.stats]):
        parser.print_help()
        return 1
    
    try:
        if args.stats:
            print_stats()
            return 0
        
        if args.all:
            success = run_full_pipeline(
                skip_fetch=args.skip_fetch,
                clear_bays=args.clear_bays
            )
            return 0 if success else 1
        
        # Individual steps
        if args.fetch:
            run_fetch()
        
        if args.load:
            run_load()
        
        if args.transform:
            run_transform()
        
        if args.generate_bays:
            run_generate_bays(clear=args.clear_bays)
        
        if args.import_roads:
            run_import_roads()
        
        return 0
        
    except KeyboardInterrupt:
        logger.info("\nImport cancelled by user")
        return 130
    except Exception as e:
        logger.error(f"Import failed: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
