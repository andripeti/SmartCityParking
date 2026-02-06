"""
Automated API Tests for Geometry Validation
Tests geometry type enforcement, spatial containment rules, and GeoJSON output format

Run with: pytest apps/api/tests/test_geometry_validation.py -v
"""
import pytest
from fastapi.testclient import TestClient
from decimal import Decimal
import json

# Import the FastAPI app
import sys
sys.path.insert(0, '/app')

from main import app

client = TestClient(app)

# Test data - Vienna coordinates
VIENNA_CENTER = [16.3738, 48.2082]

# Valid geometries
VALID_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[16.373, 48.208], [16.374, 48.208], [16.374, 48.209], [16.373, 48.209], [16.373, 48.208]]]
}

VALID_SMALL_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[16.3731, 48.2081], [16.3732, 48.2081], [16.3732, 48.2082], [16.3731, 48.2082], [16.3731, 48.2081]]]
}

VALID_POINT = {
    "type": "Point",
    "coordinates": [16.3731, 48.2081]
}

VALID_LINESTRING = {
    "type": "LineString",
    "coordinates": [[16.373, 48.208], [16.374, 48.208], [16.375, 48.209]]
}

# Invalid geometries (wrong types)
POINT_WHERE_POLYGON_EXPECTED = {
    "type": "Point",
    "coordinates": [16.3738, 48.2082]
}

POLYGON_WHERE_POINT_EXPECTED = {
    "type": "Polygon",
    "coordinates": [[[16.373, 48.208], [16.374, 48.208], [16.374, 48.209], [16.373, 48.209], [16.373, 48.208]]]
}

LINESTRING_WHERE_POLYGON_EXPECTED = {
    "type": "LineString",
    "coordinates": [[16.373, 48.208], [16.374, 48.208]]
}

POLYGON_WHERE_LINESTRING_EXPECTED = {
    "type": "Polygon",
    "coordinates": [[[16.373, 48.208], [16.374, 48.208], [16.374, 48.209], [16.373, 48.209], [16.373, 48.208]]]
}

# Invalid coordinates
INVALID_LONGITUDE = {
    "type": "Point",
    "coordinates": [200, 48.2082]  # Longitude > 180
}

INVALID_LATITUDE = {
    "type": "Point",
    "coordinates": [16.3738, 100]  # Latitude > 90
}

UNCLOSED_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[16.373, 48.208], [16.374, 48.208], [16.374, 48.209], [16.373, 48.209]]]  # Not closed
}

# Point outside the bay (for violation testing)
POINT_OUTSIDE_BAY = {
    "type": "Point",
    "coordinates": [16.5, 48.5]  # Far from Vienna center
}


def get_auth_token(email: str = "admin@vienna.at", password: str = "password123") -> str:
    """Get authentication token for API requests"""
    response = client.post("/auth/login", json={"email": email, "password": password})
    if response.status_code == 200:
        return response.json()["access_token"]
    return None


def get_auth_headers(token: str = None) -> dict:
    """Get authorization headers"""
    if token is None:
        token = get_auth_token()
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


class TestGeometryTypeValidation:
    """Test that API rejects wrong geometry types"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.headers = get_auth_headers()
    
    def test_zone_rejects_point_geometry(self):
        """Zone creation should reject Point geometry (requires Polygon)"""
        response = client.post(
            "/zones/",
            headers=self.headers,
            json={
                "name": "Test Zone",
                "zone_type": "on_street",
                "geom": POINT_WHERE_POLYGON_EXPECTED
            }
        )
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
        assert "Polygon" in response.text or "polygon" in response.text.lower()
    
    def test_zone_rejects_linestring_geometry(self):
        """Zone creation should reject LineString geometry (requires Polygon)"""
        response = client.post(
            "/zones/",
            headers=self.headers,
            json={
                "name": "Test Zone",
                "zone_type": "on_street",
                "geom": LINESTRING_WHERE_POLYGON_EXPECTED
            }
        )
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
    
    def test_bay_rejects_point_geometry(self):
        """Bay creation should reject Point geometry (requires Polygon)"""
        response = client.post(
            "/bays/",
            headers=self.headers,
            json={
                "zone_id": 1,
                "bay_number": "TEST-001",
                "geom": POINT_WHERE_POLYGON_EXPECTED
            }
        )
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
    
    def test_sensor_rejects_polygon_geometry(self):
        """Sensor creation should reject Polygon geometry (requires Point)"""
        response = client.post(
            "/sensors/",
            headers=self.headers,
            json={
                "sensor_type": "in_ground",
                "geom": POLYGON_WHERE_POINT_EXPECTED
            }
        )
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
        assert "Point" in response.text or "point" in response.text.lower()
    
    def test_violation_rejects_polygon_geometry(self):
        """Violation creation should reject Polygon geometry (requires Point)"""
        response = client.post(
            "/violations/",
            headers=self.headers,
            json={
                "bay_id": 1,
                "violation_type": "no_payment",
                "fine_amount": 50.00,
                "geom": POLYGON_WHERE_POINT_EXPECTED
            }
        )
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
    
    def test_street_rejects_polygon_geometry(self):
        """Street segment creation should reject Polygon geometry (requires LineString)"""
        response = client.post(
            "/streets/",
            headers=self.headers,
            json={
                "name": "Test Street",
                "road_type": "local",
                "geom": POLYGON_WHERE_LINESTRING_EXPECTED
            }
        )
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"


class TestCoordinateValidation:
    """Test that API validates coordinate ranges"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.headers = get_auth_headers()
    
    def test_sensor_rejects_invalid_longitude(self):
        """Sensor should reject longitude outside -180 to 180"""
        response = client.post(
            "/sensors/",
            headers=self.headers,
            json={
                "sensor_type": "in_ground",
                "geom": INVALID_LONGITUDE
            }
        )
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
        assert "longitude" in response.text.lower() or "180" in response.text
    
    def test_sensor_rejects_invalid_latitude(self):
        """Sensor should reject latitude outside -90 to 90"""
        response = client.post(
            "/sensors/",
            headers=self.headers,
            json={
                "sensor_type": "in_ground",
                "geom": INVALID_LATITUDE
            }
        )
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
        assert "latitude" in response.text.lower() or "90" in response.text
    
    def test_zone_rejects_unclosed_polygon(self):
        """Zone should reject polygon with unclosed ring"""
        response = client.post(
            "/zones/",
            headers=self.headers,
            json={
                "name": "Test Zone",
                "zone_type": "on_street",
                "geom": UNCLOSED_POLYGON
            }
        )
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
        assert "closed" in response.text.lower() or "ring" in response.text.lower()


class TestSpatialContainment:
    """Test spatial containment rules"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.headers = get_auth_headers()
    
    def test_bay_must_be_within_zone(self):
        """Bay creation should fail if bay is outside its zone"""
        # First create a zone in one location
        zone_geom = {
            "type": "Polygon",
            "coordinates": [[[16.373, 48.208], [16.374, 48.208], [16.374, 48.209], [16.373, 48.209], [16.373, 48.208]]]
        }
        
        # Try to create bay far outside the zone
        bay_geom = {
            "type": "Polygon",
            "coordinates": [[[16.5, 48.5], [16.51, 48.5], [16.51, 48.51], [16.5, 48.51], [16.5, 48.5]]]
        }
        
        # Get an existing zone
        zones = client.get("/zones/", headers=self.headers)
        if zones.status_code == 200 and len(zones.json()) > 0:
            zone_id = zones.json()[0]["zone_id"]
            
            response = client.post(
                "/bays/",
                headers=self.headers,
                json={
                    "zone_id": zone_id,
                    "bay_number": "OUT-001",
                    "geom": bay_geom
                }
            )
            # Should fail because bay is outside zone
            assert response.status_code == 400, f"Expected 400, got {response.status_code}"
            assert "contain" in response.text.lower() or "within" in response.text.lower()
    
    def test_violation_must_be_inside_bay(self):
        """Violation point must be inside the associated bay"""
        # Get an existing bay
        bays = client.get("/bays/?limit=1", headers=self.headers)
        if bays.status_code == 200 and len(bays.json()) > 0:
            bay = bays.json()[0]
            bay_id = bay["bay_id"]
            
            # Create violation far from the bay
            response = client.post(
                "/violations/",
                headers=self.headers,
                json={
                    "bay_id": bay_id,
                    "violation_type": "no_payment",
                    "fine_amount": 50.00,
                    "geom": POINT_OUTSIDE_BAY
                }
            )
            # Should fail because point is outside bay
            assert response.status_code == 400, f"Expected 400, got {response.status_code}"
            assert "inside" in response.text.lower() or "bay" in response.text.lower()


class TestGeoJSONOutputFormat:
    """Test that API returns correct GeoJSON geometry types"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.headers = get_auth_headers()
    
    def test_zones_return_polygon(self):
        """Zones endpoint should return Polygon geometries"""
        response = client.get("/zones/geojson", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["type"] == "FeatureCollection"
        
        for feature in data.get("features", [])[:5]:  # Check first 5
            assert feature["geometry"]["type"] == "Polygon", \
                f"Zone geometry should be Polygon, got {feature['geometry']['type']}"
    
    def test_bays_return_polygon(self):
        """Bays endpoint should return Polygon geometries"""
        response = client.get("/bays/geojson", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["type"] == "FeatureCollection"
        
        for feature in data.get("features", [])[:5]:  # Check first 5
            assert feature["geometry"]["type"] == "Polygon", \
                f"Bay geometry should be Polygon, got {feature['geometry']['type']}"
    
    def test_sensors_return_point(self):
        """Sensors endpoint should return Point geometries"""
        response = client.get("/sensors/geojson", headers=self.headers)
        if response.status_code == 200:
            data = response.json()
            assert data["type"] == "FeatureCollection"
            
            for feature in data.get("features", [])[:5]:  # Check first 5
                assert feature["geometry"]["type"] == "Point", \
                    f"Sensor geometry should be Point, got {feature['geometry']['type']}"
    
    def test_bays_near_returns_correct_types(self):
        """Bays near endpoint should return Polygon for full geometry, Point for centroid"""
        response = client.get(
            "/bays/near",
            params={"lat": 48.2082, "lng": 16.3738, "radius": 1000},
            headers=self.headers
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Features should have Polygon geometry (full bay shape)
            for feature in data.get("features", [])[:5]:
                assert feature["geometry"]["type"] == "Polygon", \
                    f"Bay feature geometry should be Polygon, got {feature['geometry']['type']}"
            
            # Items should have Point centroid for marker placement
            for item in data.get("items", [])[:5]:
                if "geom" in item:
                    assert item["geom"]["type"] == "Point", \
                        f"Bay item centroid should be Point, got {item['geom']['type']}"


class TestDistanceQueries:
    """Test distance-based spatial queries return correct geometry types"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.headers = get_auth_headers()
    
    def test_zones_near_returns_polygon(self):
        """Zones near query should return Polygon geometries"""
        response = client.get(
            "/zones/near",
            params={"lat": 48.2082, "lng": 16.3738, "radius": 500},
            headers=self.headers
        )
        
        if response.status_code == 200:
            data = response.json()
            assert data["type"] == "FeatureCollection"
            
            for feature in data.get("features", [])[:5]:
                assert feature["geometry"]["type"] == "Polygon", \
                    f"Zone geometry should be Polygon, got {feature['geometry']['type']}"


class TestEndToEndWorkflow:
    """Test complete workflows with geometry validation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.headers = get_auth_headers()
    
    def test_create_valid_zone_with_polygon(self):
        """Should successfully create zone with valid Polygon"""
        response = client.post(
            "/zones/",
            headers=self.headers,
            json={
                "name": "Test Valid Zone",
                "zone_type": "on_street",
                "is_active": True,
                "geom": VALID_POLYGON
            }
        )
        # May fail due to duplicate or other reason, but NOT due to geometry type
        if response.status_code in [400, 422]:
            assert "Polygon" not in response.text or "must be" not in response.text.lower()
    
    def test_create_valid_sensor_with_point(self):
        """Should successfully create sensor with valid Point"""
        response = client.post(
            "/sensors/",
            headers=self.headers,
            json={
                "sensor_type": "in_ground",
                "is_active": True,
                "geom": VALID_POINT
            }
        )
        # Should not fail due to geometry type
        if response.status_code in [400, 422]:
            assert "Point" not in response.text or "must be" not in response.text.lower()


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
