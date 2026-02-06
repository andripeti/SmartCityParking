/**
 * Geometry Validation Utilities for MapLibre GL JS
 * 
 * Provides client-side validation for GeoJSON geometries before sending to API
 * Enforces geometry type requirements per PDF specification:
 *   - ParkingZone: Polygon
 *   - ParkingBay: Polygon
 *   - StreetSegment: LineString
 *   - Sensor: Point
 *   - PaymentTerminal: Point
 *   - Violation: Point
 */

// Geometry type requirements per entity
export const GEOMETRY_REQUIREMENTS: Record<string, string> = {
  parking_zone: 'Polygon',
  parking_bay: 'Polygon',
  street_segment: 'LineString',
  sensor: 'Point',
  payment_terminal: 'Point',
  violation: 'Point',
  point_of_interest: 'Point'
}

// MapLibre Draw mode per entity
export const DRAW_MODES: Record<string, string> = {
  parking_zone: 'draw_polygon',
  parking_bay: 'draw_polygon',
  street_segment: 'draw_line_string',
  sensor: 'simple_select', // Use marker placement, not draw
  payment_terminal: 'simple_select',
  violation: 'simple_select',
  point_of_interest: 'simple_select'
}

export interface GeoJSONGeometry {
  type: string
  coordinates: any
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate that a geometry matches the expected type for an entity
 */
export function validateGeometryType(
  geometry: GeoJSONGeometry | null | undefined, 
  entityType: string
): ValidationResult {
  if (!geometry) {
    return { valid: false, error: 'Geometry is required' }
  }

  const expectedType = GEOMETRY_REQUIREMENTS[entityType]
  if (!expectedType) {
    return { valid: false, error: `Unknown entity type: ${entityType}` }
  }

  if (geometry.type !== expectedType) {
    return { 
      valid: false, 
      error: `${entityType.replace('_', ' ')} requires ${expectedType} geometry, got ${geometry.type}` 
    }
  }

  return { valid: true }
}

/**
 * Validate Point geometry coordinates
 */
export function validatePointCoordinates(coordinates: number[]): ValidationResult {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return { valid: false, error: 'Point must have [longitude, latitude] coordinates' }
  }

  const [lng, lat] = coordinates
  
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    return { valid: false, error: 'Coordinates must be numbers' }
  }

  if (lng < -180 || lng > 180) {
    return { valid: false, error: `Longitude must be between -180 and 180, got ${lng}` }
  }

  if (lat < -90 || lat > 90) {
    return { valid: false, error: `Latitude must be between -90 and 90, got ${lat}` }
  }

  return { valid: true }
}

/**
 * Validate Polygon geometry
 */
export function validatePolygonGeometry(geometry: GeoJSONGeometry): ValidationResult {
  if (geometry.type !== 'Polygon') {
    return { valid: false, error: `Expected Polygon, got ${geometry.type}` }
  }

  const coords = geometry.coordinates
  
  if (!Array.isArray(coords) || coords.length < 1) {
    return { valid: false, error: 'Polygon must have at least one ring' }
  }

  // Check exterior ring
  const exteriorRing = coords[0]
  if (!Array.isArray(exteriorRing) || exteriorRing.length < 4) {
    return { valid: false, error: 'Polygon ring must have at least 4 coordinates' }
  }

  // Check if ring is closed
  const first = exteriorRing[0]
  const last = exteriorRing[exteriorRing.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return { valid: false, error: 'Polygon ring must be closed (first and last coordinates must match)' }
  }

  // Validate each coordinate
  for (let i = 0; i < exteriorRing.length; i++) {
    const result = validatePointCoordinates(exteriorRing[i])
    if (!result.valid) {
      return { valid: false, error: `Invalid coordinate at position ${i}: ${result.error}` }
    }
  }

  return { valid: true }
}

/**
 * Validate LineString geometry
 */
export function validateLineStringGeometry(geometry: GeoJSONGeometry): ValidationResult {
  if (geometry.type !== 'LineString') {
    return { valid: false, error: `Expected LineString, got ${geometry.type}` }
  }

  const coords = geometry.coordinates
  
  if (!Array.isArray(coords) || coords.length < 2) {
    return { valid: false, error: 'LineString must have at least 2 coordinates' }
  }

  // Validate each coordinate
  for (let i = 0; i < coords.length; i++) {
    const result = validatePointCoordinates(coords[i])
    if (!result.valid) {
      return { valid: false, error: `Invalid coordinate at position ${i}: ${result.error}` }
    }
  }

  return { valid: true }
}

/**
 * Full geometry validation for any entity type
 */
export function validateGeometry(
  geometry: GeoJSONGeometry | null | undefined,
  entityType: string
): ValidationResult {
  // Check type matches requirements
  const typeResult = validateGeometryType(geometry, entityType)
  if (!typeResult.valid) {
    return typeResult
  }

  // Validate specific geometry type
  const expectedType = GEOMETRY_REQUIREMENTS[entityType]
  
  switch (expectedType) {
    case 'Point':
      return validatePointCoordinates(geometry!.coordinates)
    case 'Polygon':
      return validatePolygonGeometry(geometry!)
    case 'LineString':
      return validateLineStringGeometry(geometry!)
    default:
      return { valid: false, error: `Unsupported geometry type: ${expectedType}` }
  }
}

/**
 * Get allowed draw controls for an entity type
 */
export function getDrawControls(entityType: string): { polygon: boolean; line_string: boolean; point: boolean } {
  const expectedType = GEOMETRY_REQUIREMENTS[entityType]
  
  return {
    polygon: expectedType === 'Polygon',
    line_string: expectedType === 'LineString',
    point: expectedType === 'Point'
  }
}

/**
 * Create a valid empty GeoJSON for a given type
 */
export function createEmptyGeoJSON(geometryType: string): GeoJSONGeometry | null {
  switch (geometryType) {
    case 'Point':
      return { type: 'Point', coordinates: [0, 0] }
    case 'LineString':
      return { type: 'LineString', coordinates: [[0, 0], [0, 0]] }
    case 'Polygon':
      return { type: 'Polygon', coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] }
    default:
      return null
  }
}

/**
 * Convert a click position to Point GeoJSON
 */
export function clickToPoint(lng: number, lat: number): GeoJSONGeometry {
  return {
    type: 'Point',
    coordinates: [lng, lat]
  }
}

/**
 * Get user-friendly error message for geometry validation
 */
export function getGeometryErrorMessage(entityType: string, actualType: string): string {
  const expectedType = GEOMETRY_REQUIREMENTS[entityType]
  const entityName = entityType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  
  return `${entityName} requires ${expectedType} geometry. You drew a ${actualType}. Please use the ${expectedType.toLowerCase()} tool.`
}

/**
 * Calculate the centroid of a polygon for marker placement
 */
export function getPolygonCentroid(polygon: GeoJSONGeometry): [number, number] | null {
  if (polygon.type !== 'Polygon') return null
  
  const ring = polygon.coordinates[0]
  if (!ring || ring.length === 0) return null
  
  let sumLng = 0
  let sumLat = 0
  const count = ring.length - 1 // Exclude closing coordinate
  
  for (let i = 0; i < count; i++) {
    sumLng += ring[i][0]
    sumLat += ring[i][1]
  }
  
  return [sumLng / count, sumLat / count]
}

/**
 * Calculate the midpoint of a linestring for label placement
 */
export function getLineStringMidpoint(linestring: GeoJSONGeometry): [number, number] | null {
  if (linestring.type !== 'LineString') return null
  
  const coords = linestring.coordinates
  if (!coords || coords.length === 0) return null
  
  const midIndex = Math.floor(coords.length / 2)
  return [coords[midIndex][0], coords[midIndex][1]]
}

// Export default validation function
export default validateGeometry
