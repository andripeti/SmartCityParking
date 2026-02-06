# User Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Driver Guide](#driver-guide)
3. [Operator Guide](#operator-guide)
4. [Officer Guide](#officer-guide)
5. [Administrator Guide](#administrator-guide)

---

## Getting Started

### Accessing the System

Open your web browser and navigate to:
- **Main Application**: http://localhost:3000
- **Public Parking Finder**: http://localhost:3000/find-parking

### Logging In

1. Click "Sign In" or navigate to `/login`
2. Enter your email and password
3. Click "Sign in"

You will be redirected to the appropriate dashboard based on your role.

### Demo Accounts

For testing purposes, use these demo accounts:

| Role | Email | Password |
|------|-------|----------|
| Driver | driver@example.com | password123 |
| Operator | operator@example.com | password123 |
| Officer | officer@example.com | password123 |
| Admin | admin@example.com | password123 |

---

## Driver Guide

As a driver, you can search for parking, manage your vehicles, and track your parking history.

### Finding Parking (No Login Required)

1. Go to `/find-parking` or click "Find parking without signing in" on the login page
2. Click **"Find Parking Near Me"** to search near your current location
3. Or click anywhere on the map to search that area
4. Use filters to narrow results:
   - **Search Radius**: 200m to 2km
   - **Available only**: Show only available spaces
   - **EV**: Show only EV charging bays
   - **Accessible**: Show only accessible parking

### Understanding Bay Status

| Color | Status | Meaning |
|-------|--------|---------|
| 🟢 Green | Available | You can park here |
| 🔴 Red | Occupied | Currently in use |
| 🟡 Amber | Reserved | Reserved for specific use |
| ⚫ Gray | Closed | Not available |

### Starting a Parking Session

1. Find an available bay on the map
2. Click the bay marker to see details
3. Click **"Start Parking Session"** (login required)
4. Select your vehicle from the list
5. Choose your expected duration
6. Review the estimated cost
7. Click **"Start Parking Session"**

### Managing Your Session

From the Driver Dashboard (`/driver`):
- View your **active sessions** with real-time duration
- Click **"End Session"** when you're done
- Click the location icon to get directions back to your car

### Vehicle Management

1. Go to **My Vehicles** (`/driver/vehicles`)
2. Click **"Add Vehicle"** to register a new vehicle
3. Enter:
   - License plate number
   - Vehicle type
   - Whether it's an EV
   - Set as default (optional)
4. Use the star icon to set a vehicle as default
5. Edit or delete vehicles as needed

### Viewing History

1. Go to **History** (`/driver/history`)
2. Select a month to view
3. Filter by status (completed, cancelled, overstay)
4. View summary statistics:
   - Total sessions
   - Total spent
   - Total parking time

---

## Operator Guide

As an operator, you manage parking infrastructure and monitor occupancy.

### Dashboard Overview

The main dashboard (`/`) shows:
- **Total Bays**: Overall count of parking spaces
- **Occupancy Rate**: Current parking utilization
- **Active Sessions**: Number of ongoing sessions
- **Sensor Status**: Active sensors and low battery alerts

### Interactive Map

Navigate to **Map** (`/map`) to:
- View all zones, bays, sensors, and terminals
- Toggle layers on/off using the layer control
- Click on features to see details
- Use the drawing tools to measure distances

### Managing Zones

1. Go to **Zones** (`/zones`)
2. View all parking zones with occupancy stats
3. Click a zone to see detailed occupancy
4. To create a new zone:
   - Click **"Add Zone"**
   - Draw the zone boundary on the map
   - Enter zone details (name, type, tariff)
   - Save

### Managing Bays

1. Go to **Bays** (`/bays`)
2. Filter by zone or status
3. Click a bay to edit:
   - Change status manually
   - Update bay properties
4. To add a new bay:
   - Click **"Add Bay"**
   - Select the zone
   - Click on the map to place the bay
   - Enter bay details

### Changing Bay Status

Quick status updates:
1. Find the bay in the list
2. Click the status dropdown
3. Select new status
4. Status updates immediately

### Analysis Tools

Navigate to **Analysis** (`/analysis`) for:

#### Occupancy Heatmap
- Visualize parking demand patterns
- Identify high-demand areas
- Plan capacity improvements

#### Violation Hotspots
- See where violations occur most
- Set date range for analysis
- Adjust grid size for detail

#### Accessibility Analysis
- Enter a destination point
- See parking options within range
- Identify accessible and EV bays

#### Scenario Testing
- Model adding/removing bays
- See projected impact on occupancy
- Plan infrastructure changes

---

## Officer Guide

As an enforcement officer, you record violations and verify parking.

### Dashboard

Your dashboard shows:
- Today's violation count
- Total fines issued
- Quick access to violation tools

### Recording a Violation

1. Go to **Violations** (`/violations`)
2. Click **"New Violation"**
3. Select the bay (or click on map)
4. Choose violation type:
   - Overstay
   - No payment
   - Wrong zone
   - Disabled bay misuse
   - Other
5. Enter fine amount
6. Add notes (optional)
7. Save violation

### Searching Violations

1. Use the filter panel to narrow results
2. Filter by:
   - Date range
   - Violation type
   - Zone
3. View violation statistics summary

### Verifying Sessions

To check if a vehicle is legally parked:
1. Go to **Sessions** (`/sessions`)
2. Search by bay number or vehicle
3. Verify session is active and valid

---

## Administrator Guide

As an administrator, you have full system access.

### User Management

1. Go to **Settings** (`/settings`)
2. Select **Users** tab
3. View all user accounts
4. Create new users:
   - Full name
   - Email
   - Role
   - Initial password
5. Edit or deactivate users

### System Configuration

In Settings, you can configure:

#### Tariff Schedules
- Set hourly rates by zone type
- Configure daily maximums
- Set free parking periods

#### Notification Settings
- Configure email alerts
- Set low battery thresholds
- Enable/disable notifications

#### Map Settings
- Default map center
- Default zoom level
- Base map style

### Monitoring

Administrators can access all features:
- View all dashboards
- Access all analysis tools
- See system-wide statistics

### Switching to Driver Mode

Administrators can test the driver experience:
1. Click **"Driver Mode"** in the sidebar
2. Use the driver interface
3. Click **"Admin Panel"** to return

---

## Tips and Tricks

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Esc` | Close modal |
| `Enter` | Submit form |

### Map Navigation

- **Pan**: Click and drag
- **Zoom**: Scroll wheel or +/- buttons
- **Rotate**: Right-click and drag
- **Reset**: Double-click

### Mobile Usage

The application is fully responsive:
- Use the hamburger menu on mobile
- Map gestures work with touch
- Forms are optimized for mobile input

### Troubleshooting

**Can't log in?**
- Check your email and password
- Ensure the API is running (check http://localhost:8000/docs)
- Try a demo account

**Map not loading?**
- Check your internet connection
- Ensure browser allows location access
- Try refreshing the page

**Session won't start?**
- Verify the bay is available
- Check you have a registered vehicle
- Ensure you're logged in

---

## Support

For technical issues, contact your system administrator.

For feature requests, submit through the appropriate channels.
