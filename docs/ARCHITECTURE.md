# System Architecture

## Overview

The Smart City Parking Management System is a **Web-GIS** application built with a modern three-tier architecture. It provides spatial data management, real-time parking availability, and analysis tools for urban parking infrastructure.

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │   Drivers   │  │  Operators  │  │  Officers   │  │     Admins      │ │
│  │  (Public)   │  │  (Staff)    │  │ (Enforce)   │  │   (Full Access) │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         PRESENTATION LAYER                                │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    React Web Application                            │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │ │
│  │  │ MapLibre GL  │  │   Zustand    │  │      React Router        │ │ │
│  │  │   (Maps)     │  │   (State)    │  │        (RBAC)            │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           API LAYER                                       │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      FastAPI Application                            │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │ │
│  │  │   Auth   │  │  CRUD    │  │  Spatial │  │    Analysis      │  │ │
│  │  │  (JWT)   │  │ Routers  │  │ Queries  │  │   Algorithms     │  │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │ │
│  │  ┌────────────────────────────────────────────────────────────┐  │ │
│  │  │           SQLAlchemy + GeoAlchemy2 (ORM)                   │  │ │
│  │  └────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          DATA LAYER                                       │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                PostgreSQL 17 + PostGIS 3.5                          │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │                    Spatial Tables                             │ │ │
│  │  │  parking_zones (Polygon) │ parking_bays (Point/Polygon)      │ │ │
│  │  │  street_segments (Line)  │ sensors (Point)                   │ │ │
│  │  │  payment_terminals (Point)│ violations (Point)               │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │                  Relational Tables                            │ │ │
│  │  │  users │ vehicles │ parking_sessions │ tariff_schedules      │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │           GiST Spatial Indexes (High Performance)            │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### Frontend (React Web Application)

**Technology Stack:**
- React 18 with TypeScript
- Vite 5 (build tool)
- Tailwind CSS 3.4 (styling)
- MapLibre GL JS 4.0 (mapping)
- Zustand 4.4 (state management)
- React Router 6 (routing)
- Axios (HTTP client)
- Lucide React (icons)
- date-fns (date utilities)

**Key Features:**
- Single Page Application (SPA)
- Role-based routing and UI
- Real-time map updates
- Responsive design
- Form validation

**Route Structure:**
```
/                       # Staff dashboard (operator, officer, admin)
/map                    # Interactive map view
/zones                  # Zone management
/bays                   # Bay management
/sessions               # Session monitoring
/violations             # Violation management
/analysis               # Analysis tools
/settings               # Admin settings

/find-parking           # Public parking finder (no auth)

/driver                 # Driver dashboard (auth required)
/driver/vehicles        # Vehicle management
/driver/history         # Session history
/driver/start-session/:id # Start new session
```

### Backend (FastAPI Application)

**Technology Stack:**
- Python 3.12
- FastAPI (web framework)
- Uvicorn (ASGI server)
- SQLAlchemy 2.0 (ORM)
- GeoAlchemy2 0.14 (spatial ORM)
- asyncpg (PostgreSQL driver)
- Pydantic 2.0 (validation)
- python-jose (JWT)
- bcrypt (password hashing)
- Shapely (geometry operations)

**Router Structure:**
```
/auth           # Authentication (login, me, refresh)
/users          # User management
/zones          # Parking zones CRUD + spatial queries
/bays           # Parking bays CRUD + spatial queries
/streets        # Street segments
/sensors        # Sensor management
/terminals      # Payment terminal management
/sessions       # Parking session lifecycle
/violations     # Violation recording
/analysis       # Heatmaps, hotspots, scenarios
```

**Authentication Flow:**
```
1. Client sends POST /auth/login with email/password
2. Server validates credentials against bcrypt hash
3. Server generates JWT with user_id, role, expiry
4. Client stores token in localStorage (Zustand persist)
5. Client sends token in Authorization header
6. Server validates token on protected routes
7. Server checks role permissions
```

### Database (PostgreSQL + PostGIS)

**Tables:**

| Table | Geometry | Description |
|-------|----------|-------------|
| parking_zones | Polygon | Parking zone boundaries |
| parking_bays | Point/Polygon | Individual parking spaces |
| street_segments | LineString | Road segments |
| sensors | Point | Parking sensors |
| payment_terminals | Point | Payment machines |
| violations | Point | Recorded violations |
| users | - | User accounts |
| vehicles | - | Registered vehicles |
| parking_sessions | - | Active/past sessions |
| tariff_schedules | - | Pricing rules |
| points_of_interest | Point | POIs for analysis |
| scenario_results | - | Analysis results |

**Spatial Indexes:**
All geometry columns have GiST indexes for fast spatial queries:
```sql
CREATE INDEX idx_parking_zones_geom ON parking_zones USING GIST (geom);
CREATE INDEX idx_parking_bays_geom ON parking_bays USING GIST (geom);
```

**Key Spatial Functions Used:**
- `ST_DWithin(geom, point, distance)` - Find features within radius
- `ST_Distance(geom1, geom2)` - Calculate distance between geometries
- `ST_Contains(polygon, point)` - Check point-in-polygon
- `ST_Intersects(geom1, geom2)` - Check geometry intersection
- `ST_AsGeoJSON(geom)` - Convert to GeoJSON
- `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` - Create point from coordinates
- `ST_MakeEnvelope(x1, y1, x2, y2, srid)` - Create bounding box

## Data Flow

### Finding Nearby Parking

```
1. User clicks "Find Parking Near Me"
2. Browser gets GPS coordinates via Geolocation API
3. Frontend sends GET /bays/near?lat=52.37&lng=4.89&radius=500&status=available
4. Backend executes spatial query:
   
   SELECT b.*, z.name as zone_name,
          ST_Distance(
            ST_Transform(b.geom, 3857),
            ST_Transform(ST_SetSRID(ST_MakePoint(4.89, 52.37), 4326), 3857)
          ) as distance_meters
   FROM parking_bays b
   JOIN parking_zones z ON b.zone_id = z.zone_id
   WHERE b.status = 'available'
     AND ST_DWithin(
           b.geom::geography,
           ST_SetSRID(ST_MakePoint(4.89, 52.37), 4326)::geography,
           500
         )
   ORDER BY distance_meters
   
5. Backend returns GeoJSON feature collection
6. Frontend adds markers to MapLibre GL map
7. User sees available parking bays on map
```

### Starting a Parking Session

```
1. User selects a bay and clicks "Start Session"
2. Frontend sends POST /sessions/start with bay_id, vehicle_id
3. Backend validates:
   - Bay exists and is available
   - User has registered vehicle
   - User doesn't have active session at this bay
4. Backend creates session record:
   - Sets start_time to now()
   - Sets status to 'active'
   - Updates bay status to 'occupied'
5. Backend returns session details
6. Frontend navigates to driver dashboard
7. Active session is displayed with timer
```

### Generating Occupancy Heatmap

```
1. Admin requests GET /analysis/occupancy-heatmap
2. Backend creates grid using ST_MakeEnvelope
3. For each grid cell:
   - Count total bays within cell
   - Count occupied bays
   - Calculate occupancy percentage
4. Backend returns GeoJSON with intensity values
5. Frontend renders as heatmap layer in MapLibre
```

## Security

### Authentication
- JWT tokens with configurable expiry (default 24 hours)
- bcrypt password hashing with salt
- Token refresh endpoint for long sessions

### Authorization
- Role-based access control (RBAC)
- Route-level protection in React
- API-level permission checks
- Roles: driver, operator, officer, admin

### Data Validation
- Pydantic schemas for all API inputs
- Geometry validation triggers in PostgreSQL
- SRID enforcement (4326 only)

## Scalability Considerations

### Current Architecture (Monolith)
- Single FastAPI instance
- Single PostgreSQL database
- Suitable for small to medium deployments

### Scaling Options
1. **Horizontal API Scaling**: Run multiple FastAPI instances behind load balancer
2. **Database Replication**: PostgreSQL read replicas for query distribution
3. **Caching**: Redis for session caching and API response caching
4. **CDN**: Cache static assets and map tiles
5. **Async Processing**: Celery for background tasks (reports, notifications)

## Deployment

### Docker Compose (Development/Small Production)
```yaml
services:
  db:      # PostgreSQL + PostGIS
  api:     # FastAPI
  web:     # React (Nginx in production)
```

### Production Recommendations
1. Use managed PostgreSQL with PostGIS extension
2. Deploy API on Kubernetes or similar
3. Serve React build via CDN/Nginx
4. Enable HTTPS with proper certificates
5. Set up monitoring (Prometheus, Grafana)
6. Configure log aggregation (ELK stack)
7. Implement backup strategy for database

## Integration Points

### Current Integrations
- **CARTO Basemaps**: Free vector tiles for map display
- **Browser Geolocation**: GPS positioning

### Potential Future Integrations
- **IoT Sensors**: Real-time occupancy from parking sensors
- **Payment Gateways**: Online payment processing
- **Notification Services**: SMS/Email for session reminders
- **GeoServer**: Advanced WMS/WFS services
- **Traffic APIs**: Real-time traffic data
- **Municipal Systems**: Integration with city databases
