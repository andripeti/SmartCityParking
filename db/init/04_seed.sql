-- Minimal Seed Data for Smart City Parking Management System
-- Location: Vienna, Austria
-- NOTE: Parking zones, bays, streets, and POIs will come from OSM import (run: docker compose run --rm osm-import)
-- This file only contains data that cannot be sourced from OSM

-- ============================================
-- TARIFF SCHEDULES (Vienna Kurzparkzone pricing - not available in OSM)
-- ============================================
INSERT INTO tariff_schedules (name, hourly_rate, currency, valid_from_time, valid_to_time, valid_days, notes) VALUES
('Vienna Standard Weekday', 2.20, 'EUR', '09:00', '22:00', 'Mon-Fri', 'Vienna Kurzparkzone standard rate'),
('Vienna Weekend', 1.10, 'EUR', '09:00', '18:00', 'Sat', 'Reduced Saturday rate in outer districts'),
('Vienna Inner Districts (Bezirk 1-9)', 2.20, 'EUR', '09:00', '22:00', 'Mon-Sat', 'Premium rate for central districts, max 2 hours'),
('Vienna Outer Districts (Bezirk 10-23)', 1.10, 'EUR', '09:00', '22:00', 'Mon-Fri', 'Standard rate for outer districts, max 3 hours'),
('Garage Rate', 3.50, 'EUR', '00:00', '23:59', 'All', 'Covered parking garage rate');

-- ============================================
-- PARKING ZONES - REMOVED (will come from OSM)
-- Run: docker compose run --rm osm-import
-- ============================================
-- Manual zones commented out - real data will be imported from OpenStreetMap


-- ============================================
-- PARKING BAYS - REMOVED (will be auto-generated from OSM zones)
-- After OSM import, run: python generate_bays.py
-- Parking bays are generated algorithmically (grid for lots, perimeter for on-street)
-- ============================================

-- ============================================
-- STREET SEGMENTS - REMOVED (will come from OSM)
-- Real Vienna streets will be imported from OpenStreetMap
-- ============================================

-- ============================================
-- SENSORS - REMOVED (not in OSM, would be added later by operators)
-- ============================================

-- ============================================
-- PAYMENT TERMINALS - REMOVED (not in OSM, would be added later by operators)
-- ============================================

-- ============================================
-- USERS (Demo users for testing - Password: "password123")
-- ============================================
INSERT INTO users (full_name, email, phone_number, role, password_hash, is_active) VALUES
('Hans Müller', 'driver@example.com', '+43660123456', 'driver', '$2b$12$6L1X77JAycoF3Ho5SW/uE.6S5ElEgFYF63lJioCWLuvE0qTXuAH/u', true),
('Anna Schmidt', 'operator@example.com', '+43660234567', 'operator', '$2b$12$6L1X77JAycoF3Ho5SW/uE.6S5ElEgFYF63lJioCWLuvE0qTXuAH/u', true),
('Josef Wagner', 'officer@example.com', '+43660345678', 'officer', '$2b$12$6L1X77JAycoF3Ho5SW/uE.6S5ElEgFYF63lJioCWLuvE0qTXuAH/u', true),
('Maria Huber', 'admin@example.com', '+43660456789', 'admin', '$2b$12$6L1X77JAycoF3Ho5SW/uE.6S5ElEgFYF63lJioCWLuvE0qTXuAH/u', true);

-- ============================================
-- VEHICLES (Demo vehicles for testing)
-- ============================================
INSERT INTO vehicles (user_id, license_plate, vehicle_type, color) VALUES
(1, 'W-12345A', 'car', 'Blau'),
(1, 'W-67890B', 'motorcycle', 'Schwarz'),
(2, 'W-11111C', 'car', 'Rot'),
(3, 'W-22222D', 'van', 'Weiß'),
(4, 'W-33333E', 'car', 'Silber');

-- ============================================
-- PARKING SESSIONS - REMOVED
-- Will be created when users actually park after OSM zones/bays are imported
-- ============================================

-- ============================================
-- VIOLATIONS - REMOVED
-- Will be created by officers after OSM data is imported
-- ============================================

-- ============================================
-- POINTS OF INTEREST - REMOVED (will come from OSM)
-- Real Vienna POIs will be imported from OpenStreetMap
-- ============================================

-- Log seed data creation
DO $$
BEGIN
    RAISE NOTICE '==========================================================';
    RAISE NOTICE 'Vienna minimal seed data created successfully';
    RAISE NOTICE '==========================================================';
    RAISE NOTICE 'TARIFF SCHEDULES: 5 Vienna Kurzparkzone schedules created';
    RAISE NOTICE 'DEMO USERS: 4 test users created (password: password123)';
    RAISE NOTICE '  - driver@example.com (Driver role)';
    RAISE NOTICE '  - operator@example.com (Operator role)';
    RAISE NOTICE '  - officer@example.com (Officer role)';
    RAISE NOTICE '  - admin@example.com (Admin role)';
    RAISE NOTICE 'DEMO VEHICLES: 5 vehicles created';
    RAISE NOTICE '==========================================================';
    RAISE NOTICE 'TO GET REAL OSM DATA, RUN:';
    RAISE NOTICE '  docker compose run --rm osm-import';
    RAISE NOTICE '  OR: cd db/osm && python run_import.py --all';
    RAISE NOTICE '==========================================================';
END $$;
