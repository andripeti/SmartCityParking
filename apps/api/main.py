"""
Smart City Parking Management System - FastAPI Backend
Main application entry point
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import settings
from database import engine, Base, SessionLocal
from routers import auth, zones, bays, streets, sensors, terminals, sessions, violations, analysis, users, vehicles
from services.simulation import start_simulation, stop_simulation, SIMULATION_ENABLED

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    print("Starting Smart City Parking API...")
    print(f"  - Database: {settings.database_url.split('@')[-1] if settings.database_url else 'Not configured'}")
    print(f"  - Simulation enabled: {SIMULATION_ENABLED}")
    
    # Start occupancy simulation if enabled
    if SIMULATION_ENABLED:
        try:
            await start_simulation(SessionLocal)
            print("  - Occupancy simulation started")
        except Exception as e:
            print(f"  - Warning: Could not start simulation: {e}")
    
    yield
    
    # Shutdown
    print("Shutting down Smart City Parking API...")
    if SIMULATION_ENABLED:
        await stop_simulation()
        print("  - Occupancy simulation stopped")

app = FastAPI(
    title="Smart City Parking Management System",
    description="""
    A GIS-based web application for parking management.
    
    ## Features
    - **Drivers**: Find available parking bays near destinations
    - **Operators**: Manage parking zones, bays, sensors, and terminals
    - **Officers**: View and manage violations, enforcement workflows
    - **Planners**: Access analysis tools including heatmaps, hotspots, and scenario testing
    
    ## Spatial Features
    - All spatial data returned as GeoJSON
    - Distance queries using PostGIS
    - Spatial validation for geometry containment
    """,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/users", tags=["Users"])
app.include_router(vehicles.router, prefix="/vehicles", tags=["Vehicles"])
app.include_router(zones.router, prefix="/zones", tags=["Parking Zones"])
app.include_router(bays.router, prefix="/bays", tags=["Parking Bays"])
app.include_router(streets.router, prefix="/streets", tags=["Street Segments"])
app.include_router(sensors.router, prefix="/sensors", tags=["Sensors"])
app.include_router(terminals.router, prefix="/terminals", tags=["Payment Terminals"])
app.include_router(sessions.router, prefix="/sessions", tags=["Parking Sessions"])
app.include_router(violations.router, prefix="/violations", tags=["Violations"])
app.include_router(analysis.router, prefix="/analysis", tags=["Analysis"])

@app.get("/", tags=["Health"])
async def root():
    """API root endpoint"""
    return {
        "message": "Smart City Parking Management System API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "ok"
    }

@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "parking-api"}
