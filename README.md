# Smart City Parking Management System

A comprehensive **Web-GIS** application for managing urban parking infrastructure. This system provides real-time parking availability, enforcement workflows, and spatial analysis tools for city planners.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)

## 🚀 Quick Start

### Prerequisites

- [Docker](https://www.docker.com/get-started) (v20+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2+)

### One-Command Startup

```bash
# Clone and start
git clone <repository-url>
cd code

# Start all services
docker-compose up --build
```

### Access the Application

| Service | URL | Description |
|---------|-----|-------------|
| **Web App** | http://localhost:3000 | Main application |
| **Public Parking Finder** | http://localhost:3000/find-parking | Public parking search (no login required) |
| **API Docs** | http://localhost:8000/docs | Swagger/OpenAPI documentation |
| **Database** | localhost:5432 | PostgreSQL + PostGIS |

### Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Driver | driver@example.com | password123 |
| Operator | operator@example.com | password123 |
| Officer | officer@example.com | password123 |
| Admin | admin@example.com | password123 |

## 📋 Features

### 🚗 Driver Experience (Public)
- **Find Parking** - Search for available parking spots near any location
- **Real-time Availability** - See which bays are available, occupied, or reserved
- **Filters** - Filter by EV charging, accessible parking, radius
- **Directions** - Get driving directions to selected parking bays
- **Session Management** - Start, monitor, and end parking sessions (requires login)
- **Vehicle Management** - Register and manage multiple vehicles
- **History** - View past parking sessions and spending

### 🔧 Operator Dashboard
- **Live Map** - Interactive map with all parking zones, bays, and sensors
- **Zone Management** - CRUD operations for parking zones with geometry editing
- **Bay Management** - Add, edit, and manage individual parking bays
- **Sensor Monitoring** - View sensor status and battery levels
- **Terminal Management** - Manage payment terminals
- **Occupancy Dashboard** - Real-time occupancy statistics by zone

### 👮 Enforcement (Officer)
- **Violation Recording** - Record parking violations with location
- **Session Lookup** - Check active sessions for any bay
- **Photo Evidence** - Attach evidence to violations
- **Violation History** - Search and filter violations

### 📊 Analysis Tools (Planner)
- **Occupancy Heatmaps** - Visualize parking demand patterns
- **Violation Hotspots** - Identify areas with frequent violations
- **Accessibility Analysis** - Find parking near destinations
- **Scenario Testing** - Model impact of adding/removing bays

### ⚙️ Administration
- **User Management** - Create and manage user accounts
- **Role Assignment** - Assign roles (driver, operator, officer, admin)
- **System Settings** - Configure system parameters
- **Tariff Management** - Set parking rates by zone

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web Browser                               │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                React + MapLibre GL JS                       ││
│  │  • Public: /find-parking                                    ││
│  │  • Driver: /driver/*                                        ││
│  │  • Staff: / (dashboard, map, zones, bays, etc.)            ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Python)                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐│
│  │   Auth      │ │   CRUD      │ │  Analysis   │ │ GeoJSON    ││
│  │   (JWT)     │ │  Endpoints  │ │  Endpoints  │ │ Endpoints  ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘│
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │           SQLAlchemy + GeoAlchemy2 (ORM)                    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              PostgreSQL 17 + PostGIS 3.5                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │   Zones     │ │    Bays     │ │  Sessions   │ ...           │
│  │  (Polygon)  │ │   (Point)   │ │  (FK refs)  │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
│                    Spatial Indexes (GiST)                        │
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
code/
├── docker-compose.yml          # Container orchestration
├── .env                        # Environment variables
├── apps/
│   ├── api/                    # FastAPI backend
│   │   ├── main.py            # App entry point
│   │   ├── models.py          # SQLAlchemy models
│   │   ├── schemas.py         # Pydantic schemas
│   │   ├── auth.py            # JWT authentication
│   │   ├── geo_utils.py       # Spatial utilities
│   │   └── routers/           # API endpoints
│   │       ├── auth.py
│   │       ├── zones.py
│   │       ├── bays.py
│   │       ├── sessions.py
│   │       ├── violations.py
│   │       └── analysis.py
│   └── web/                    # React frontend
│       ├── src/
│       │   ├── App.tsx        # Routing & RBAC
│       │   ├── pages/         # Page components
│       │   │   ├── FindParking.tsx    # Public parking finder
│       │   │   ├── DriverDashboard.tsx
│       │   │   ├── Dashboard.tsx      # Staff dashboard
│       │   │   ├── MapView.tsx
│       │   │   ├── Analysis.tsx
│       │   │   └── ...
│       │   ├── components/
│       │   │   ├── Layout.tsx         # Staff layout
│       │   │   └── DriverLayout.tsx   # Driver layout
│       │   ├── store/         # Zustand state
│       │   └── lib/           # API client
│       └── index.html
└── db/
    └── init/                   # Database initialization
        ├── 01_extensions.sql   # PostGIS extension
        ├── 02_schema.sql       # Table definitions
        ├── 03_validation.sql   # Triggers & functions
        └── 04_seed.sql         # Sample data
```

## 🛠️ Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS |
| **Mapping** | MapLibre GL JS (free, no API key required) |
| **State** | Zustand with persist middleware |
| **Backend** | FastAPI (Python 3.12), Uvicorn |
| **ORM** | SQLAlchemy 2.0 + GeoAlchemy2 |
| **Database** | PostgreSQL 17 + PostGIS 3.5 |
| **Auth** | JWT with bcrypt password hashing |
| **Containers** | Docker, Docker Compose |

## 🔐 Role-Based Access Control

| Route | Driver | Operator | Officer | Admin |
|-------|--------|----------|---------|-------|
| `/find-parking` | ✅ Public | ✅ Public | ✅ Public | ✅ Public |
| `/driver/*` | ✅ | ❌ | ❌ | ✅ |
| `/` (Dashboard) | ❌ | ✅ | ✅ | ✅ |
| `/map` | ❌ | ✅ | ✅ | ✅ |
| `/zones`, `/bays` | ❌ | ✅ | ❌ | ✅ |
| `/violations` | ❌ | ❌ | ✅ | ✅ |
| `/analysis` | ❌ | ✅ | ❌ | ✅ |
| `/settings` | ❌ | ❌ | ❌ | ✅ |

## 🗺️ GIS Features

### Spatial Data Types
- **Zones**: Polygons defining parking areas
- **Bays**: Points or small polygons for individual spaces
- **Streets**: LineStrings for road segments
- **Sensors/Terminals**: Points for infrastructure

### Spatial Queries
- `ST_DWithin` - Find bays within radius of a point
- `ST_Contains` - Check if point is within zone
- `ST_Distance` - Calculate distances
- `ST_MakeEnvelope` - Grid-based heatmaps
- `ST_Intersects` - Spatial joins

### Coordinate System
- SRID 4326 (WGS84) for all geometry storage
- Compatible with GPS coordinates and web mapping

## 📡 API Endpoints

### Authentication
- `POST /auth/login` - Login with email/password
- `GET /auth/me` - Get current user
- `POST /auth/refresh` - Refresh JWT token

### Zones
- `GET /zones` - List all zones
- `GET /zones/geojson` - GeoJSON feature collection
- `GET /zones/near?lat=&lng=&radius=` - Find zones near point
- `GET /zones/{id}/occupancy` - Zone occupancy stats

### Bays
- `GET /bays` - List bays (filterable)
- `GET /bays/geojson` - GeoJSON feature collection
- `GET /bays/near?lat=&lng=&radius=&status=` - Find nearby bays
- `PATCH /bays/{id}/status` - Update bay status

### Sessions
- `POST /sessions/start` - Start parking session
- `POST /sessions/{id}/end` - End session
- `GET /sessions/active` - List active sessions

### Analysis
- `GET /analysis/occupancy-heatmap` - Occupancy heatmap data
- `GET /analysis/violation-hotspots` - Violation clustering
- `GET /analysis/accessibility` - Parking near destination
- `POST /analysis/scenario` - Run scenario simulation

See full API documentation at http://localhost:8000/docs

## 🧪 Development

### Running Locally (without Docker)

```bash
# Backend
cd apps/api
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd apps/web
npm install
npm run dev
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Database
POSTGRES_USER=parking
POSTGRES_PASSWORD=parking_secret_2024
POSTGRES_DB=parking_db

# API
SECRET_KEY=your-secret-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Frontend
VITE_API_URL=http://localhost:8000
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
