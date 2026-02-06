"""
OSM Ingestion Module for Vienna Parking Data
Configuration settings
"""
import os
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

@dataclass
class Config:
    """Configuration for OSM data import"""
    
    # Database connection - parse from DATABASE_URL or use individual vars
    def __post_init__(self):
        """Parse DATABASE_URL if provided"""
        database_url = os.getenv('DATABASE_URL')
        if database_url:
            parsed = urlparse(database_url)
            self.db_host = parsed.hostname or 'localhost'
            self.db_port = parsed.port or 5432
            self.db_name = parsed.path.lstrip('/') if parsed.path else 'parking_db'
            self.db_user = parsed.username or 'parking'
            self.db_password = parsed.password or 'parking_secret_2024'
    
    db_host: str = os.getenv('DB_HOST', 'localhost')
    db_port: int = int(os.getenv('DB_PORT', '5432'))
    db_name: str = os.getenv('POSTGRES_DB', 'parking_db')
    db_user: str = os.getenv('POSTGRES_USER', 'parking')
    db_password: str = os.getenv('POSTGRES_PASSWORD', 'parking_secret_2024')
    
    # Overpass API settings
    overpass_url: str = os.getenv('OVERPASS_URL', 'https://overpass-api.de/api/interpreter')
    overpass_timeout: int = int(os.getenv('OVERPASS_TIMEOUT', '180'))
    
    # Vienna bounding box (approximate city limits)
    # Format: [south, west, north, east]
    vienna_bbox: tuple = (48.12, 16.18, 48.32, 16.58)
    vienna_center: tuple = (48.2082, 16.3738)  # Stephansplatz
    
    # Bay generation settings
    default_bay_count: int = 8   # Default number of bays per zone if capacity unknown
    min_bay_count: int = 3       # Minimum bays to generate
    max_bay_count: int = 50      # Maximum bays to generate per zone
    bay_width_meters: float = 2.5
    bay_length_meters: float = 5.0
    bay_spacing_meters: float = 0.5
    
    # Import settings
    batch_size: int = 100
    
    @property
    def database_url(self) -> str:
        """Get PostgreSQL connection string"""
        return f"postgresql://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"
    
    @property
    def bbox_string(self) -> str:
        """Get bounding box as Overpass query string format (south,west,north,east)"""
        return f"{self.vienna_bbox[0]},{self.vienna_bbox[1]},{self.vienna_bbox[2]},{self.vienna_bbox[3]}"
    
    @property
    def bbox_wkt(self) -> str:
        """Get bounding box as WKT polygon"""
        s, w, n, e = self.vienna_bbox
        return f"POLYGON(({w} {s}, {e} {s}, {e} {n}, {w} {n}, {w} {s}))"

# Overpass queries for Vienna
OVERPASS_QUERIES = {
    # Parking facilities
    'parking': '''
[out:json][timeout:{timeout}];
(
  // Parking areas (amenity=parking)
  node["amenity"="parking"]({bbox});
  way["amenity"="parking"]({bbox});
  relation["amenity"="parking"]({bbox});
  
  // Individual parking spaces (rare but include)
  node["amenity"="parking_space"]({bbox});
  way["amenity"="parking_space"]({bbox});
);
out body;
>;
out skel qt;
''',

    # Roads for street context
    'roads': '''
[out:json][timeout:{timeout}];
(
  way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|pedestrian|service)$"]({bbox});
);
out body;
>;
out skel qt;
''',

    # POIs for accessibility analysis
    'pois': '''
[out:json][timeout:{timeout}];
(
  // Schools
  node["amenity"="school"]({bbox});
  way["amenity"="school"]({bbox});
  
  // Healthcare
  node["amenity"~"^(hospital|clinic|doctors)$"]({bbox});
  way["amenity"~"^(hospital|clinic|doctors)$"]({bbox});
  
  // Public transport
  node["railway"~"^(station|halt|tram_stop)$"]({bbox});
  node["amenity"="bus_station"]({bbox});
  node["public_transport"~"^(station|stop_position|platform)$"]({bbox});
  
  // Universities
  node["amenity"="university"]({bbox});
  way["amenity"="university"]({bbox});
  
  // Government offices
  node["amenity"~"^(townhall|courthouse|police)$"]({bbox});
  way["amenity"~"^(townhall|courthouse|police)$"]({bbox});
);
out body;
>;
out skel qt;
'''
}

# OSM tag mappings
PARKING_TYPE_MAP = {
    'surface': 'lot',
    'underground': 'garage', 
    'multi-storey': 'garage',
    'street_side': 'on_street',
    'lane': 'on_street',
    'on_street': 'on_street',
    None: 'on_street'
}

HIGHWAY_TYPE_MAP = {
    'motorway': 'primary',
    'motorway_link': 'primary',
    'trunk': 'primary',
    'trunk_link': 'primary',
    'primary': 'primary',
    'primary_link': 'primary',
    'secondary': 'secondary',
    'secondary_link': 'secondary',
    'tertiary': 'secondary',
    'tertiary_link': 'secondary',
    'residential': 'local',
    'living_street': 'local',
    'unclassified': 'local',
    'service': 'local',
    'pedestrian': 'local'
}

# Vienna Kurzparkzone tariffs
VIENNA_TARIFFS = {
    'premium': {  # Districts 1-9
        'name': 'Vienna Inner Districts (Bezirk 1-9)',
        'hourly_rate': 2.20,
        'max_duration': 120  # 2 hours
    },
    'standard': {  # Districts 10-23
        'name': 'Vienna Outer Districts (Bezirk 10-23)',
        'hourly_rate': 1.10,
        'max_duration': 180  # 3 hours
    }
}

config = Config()
