# API Reference

## Base URL

- Development: `http://localhost:8000`
- API Documentation: `http://localhost:8000/docs` (Swagger UI)
- Alternative Docs: `http://localhost:8000/redoc` (ReDoc)

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

### Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "token_type": "bearer",
  "user": {
    "user_id": 1,
    "email": "admin@example.com",
    "full_name": "Admin User",
    "role": "admin"
  }
}
```

### Get Current User

```http
GET /auth/me
Authorization: Bearer <token>
```

---

## Zones

### List Zones

```http
GET /zones?is_active=true
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| is_active | boolean | Filter by active status |

### Get Zone GeoJSON

```http
GET /zones/geojson
```

**Response:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[4.89, 52.37], ...]]
      },
      "properties": {
        "zone_id": 1,
        "name": "City Center Zone A",
        "zone_type": "on-street",
        "is_active": true
      }
    }
  ]
}
```

### Find Zones Near Point

```http
GET /zones/near?lat=52.37&lng=4.89&radius=500
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| lat | float | required | Latitude |
| lng | float | required | Longitude |
| radius | float | 500 | Search radius in meters |

### Get Zone Occupancy

```http
GET /zones/{zone_id}/occupancy
```

**Response:**
```json
{
  "zone_id": 1,
  "zone_name": "City Center Zone A",
  "total_bays": 50,
  "available_bays": 20,
  "occupied_bays": 25,
  "reserved_bays": 3,
  "closed_bays": 2,
  "occupancy_percent": 50.0
}
```

### Create Zone

```http
POST /zones
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "New Zone",
  "zone_type": "on-street",
  "max_duration_minutes": 120,
  "tariff_schedule_id": 1,
  "is_active": true,
  "geom": {
    "type": "Polygon",
    "coordinates": [[[4.89, 52.37], [4.90, 52.37], [4.90, 52.38], [4.89, 52.38], [4.89, 52.37]]]
  }
}
```

---

## Bays

### List Bays

```http
GET /bays?zone_id=1&status=available
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| zone_id | integer | Filter by zone |
| status | string | Filter by status (available, occupied, reserved, closed) |

### Get Bay GeoJSON

```http
GET /bays/geojson?zone_id=1&status=available
```

### Find Bays Near Point

```http
GET /bays/near?lat=52.37&lng=4.89&radius=500&status=available&is_electric=true&is_disabled_only=false
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| lat | float | required | Latitude |
| lng | float | required | Longitude |
| radius | float | 500 | Search radius in meters |
| status | string | - | Filter by status |
| is_electric | boolean | - | Filter EV charging bays |
| is_disabled_only | boolean | - | Filter accessible bays |

**Response:**
```json
{
  "items": [
    {
      "bay_id": 1,
      "bay_number": "A001",
      "zone_id": 1,
      "zone_name": "City Center Zone A",
      "status": "available",
      "is_electric": false,
      "is_disabled_only": false,
      "distance_meters": 45.5,
      "geom": {
        "type": "Point",
        "coordinates": [4.891, 52.371]
      }
    }
  ],
  "total": 15,
  "search_point": {
    "lat": 52.37,
    "lng": 4.89
  }
}
```

### Update Bay Status

```http
PATCH /bays/{bay_id}/status?status=occupied
Authorization: Bearer <token>
```

---

## Sessions

### Start Session

```http
POST /sessions/start
Content-Type: application/json
Authorization: Bearer <token>

{
  "bay_id": 1,
  "vehicle_id": 1,
  "user_id": 1,
  "payment_method": "card",
  "expected_duration_hours": 2
}
```

### End Session

```http
POST /sessions/{session_id}/end
Content-Type: application/json
Authorization: Bearer <token>

{
  "amount_paid": 5.00
}
```

### List Active Sessions

```http
GET /sessions/active
Authorization: Bearer <token>
```

### List User Sessions

```http
GET /sessions?user_id=1&status=completed&start_time_from=2026-01-01&limit=20
Authorization: Bearer <token>
```

---

## Violations

### Create Violation

```http
POST /violations
Content-Type: application/json
Authorization: Bearer <token>

{
  "bay_id": 1,
  "session_id": null,
  "officer_id": 3,
  "violation_type": "overstay",
  "fine_amount": 65.00,
  "notes": "Vehicle overstayed by 45 minutes",
  "geom": {
    "type": "Point",
    "coordinates": [4.891, 52.371]
  }
}
```

### Search Violations (Spatial)

```http
POST /violations/search
Content-Type: application/json
Authorization: Bearer <token>

{
  "polygon": {
    "type": "Polygon",
    "coordinates": [[[4.89, 52.37], [4.90, 52.37], [4.90, 52.38], [4.89, 52.38], [4.89, 52.37]]]
  },
  "start_time": "2026-01-01T00:00:00",
  "end_time": "2026-01-31T23:59:59"
}
```

### Get Violation Statistics

```http
GET /violations/stats/summary
Authorization: Bearer <token>
```

**Response:**
```json
{
  "total_violations": 150,
  "total_fines": 8750.00,
  "by_type": {
    "overstay": 80,
    "no_payment": 45,
    "wrong_zone": 25
  },
  "today": {
    "count": 5,
    "fines": 325.00
  }
}
```

---

## Analysis

### Occupancy Heatmap

```http
GET /analysis/occupancy-heatmap
Authorization: Bearer <token>
```

**Response:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [4.89, 52.37]
      },
      "properties": {
        "intensity": 0.85,
        "total_bays": 10,
        "occupied_bays": 8
      }
    }
  ]
}
```

### Violation Hotspots

```http
GET /analysis/violation-hotspots?start_time=2026-01-01&end_time=2026-01-31&grid_size_meters=100
Authorization: Bearer <token>
```

### Accessibility Analysis

Find parking near a destination:

```http
GET /analysis/accessibility?dest_lat=52.37&dest_lng=4.89&radius_meters=500
Authorization: Bearer <token>
```

**Response:**
```json
{
  "destination": {
    "lat": 52.37,
    "lng": 4.89
  },
  "radius_meters": 500,
  "total_bays": 45,
  "available_bays": 12,
  "accessible_bays": 3,
  "ev_bays": 5,
  "nearest_available": {
    "bay_id": 15,
    "distance_meters": 85,
    "bay_number": "B003"
  },
  "zones_in_range": [
    {
      "zone_id": 1,
      "name": "City Center Zone A",
      "available_bays": 8
    }
  ]
}
```

### Scenario Testing

Model the impact of changes:

```http
POST /analysis/scenario
Content-Type: application/json
Authorization: Bearer <token>

{
  "scenario_type": "add_bays",
  "zone_id": 1,
  "bay_count_delta": 10,
  "location": {
    "type": "Point",
    "coordinates": [4.89, 52.37]
  }
}
```

**Response:**
```json
{
  "scenario_id": 1,
  "scenario_type": "add_bays",
  "current_state": {
    "total_bays": 50,
    "occupancy_percent": 80
  },
  "projected_state": {
    "total_bays": 60,
    "occupancy_percent": 66.7
  },
  "impact_analysis": {
    "demand_reduction": 15,
    "revenue_change": 250.00,
    "accessibility_improvement": 12
  }
}
```

### Dashboard Statistics

```http
GET /analysis/dashboard
Authorization: Bearer <token>
```

**Response:**
```json
{
  "summary": {
    "total_bays": 200,
    "available_bays": 45,
    "occupied_bays": 140,
    "overall_occupancy_percent": 70,
    "active_sessions": 140,
    "violations_today": 8,
    "fines_today": 520.00
  },
  "sensors": {
    "total": 180,
    "active": 175,
    "low_battery": 12
  },
  "zones": [
    {
      "zone_id": 1,
      "name": "City Center Zone A",
      "total_bays": 50,
      "available_bays": 10,
      "occupancy_percent": 80
    }
  ]
}
```

---

## Vehicles

### Get User Vehicles

```http
GET /users/{user_id}/vehicles
Authorization: Bearer <token>
```

### Create Vehicle

```http
POST /vehicles
Content-Type: application/json
Authorization: Bearer <token>

{
  "user_id": 1,
  "license_plate": "AB-123-CD",
  "type": "car",
  "is_ev": false,
  "is_default": true
}
```

### Update Vehicle

```http
PUT /vehicles/{vehicle_id}
Content-Type: application/json
Authorization: Bearer <token>

{
  "is_default": true
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "detail": "Error message here"
}
```

### Common Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing or invalid token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found |
| 422 | Validation Error |
| 500 | Internal Server Error |

---

## Rate Limiting

Currently no rate limiting is implemented. For production, consider adding rate limiting middleware.

## CORS

The API allows cross-origin requests from:
- `http://localhost:3000` (Web app)
- `http://localhost:5173` (Vite dev server)

Configure additional origins in `main.py`.
