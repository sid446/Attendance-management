// WGS-84 ellipsoid parameters — the same datum GPS and Google Maps report in.
const WGS84_A = 6378137.0; // semi-major axis (meters)
const WGS84_F = 1 / 298.257223563; // flattening
const WGS84_B = WGS84_A * (1 - WGS84_F); // semi-minor axis (meters)

const VINCENTY_MAX_ITERATIONS = 200;
const VINCENTY_CONVERGENCE = 1e-12;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export interface Coordinates {
  lat: number;
  lng: number;
}

export function isValidLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== 'object') return false;
  const { lat, lng } = value as Partial<Coordinates>;
  return isValidLatitude(lat) && isValidLongitude(lng);
}

/**
 * Spherical fallback. Only used when Vincenty fails to converge, which happens
 * for near-antipodal points that never occur in an attendance radius check.
 */
function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371008.8; // mean Earth radius (meters)
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const dPhi = toRadians(lat2 - lat1);
  const dLambda = toRadians(lng2 - lng1);

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Vincenty inverse solution on the WGS-84 ellipsoid — accurate to well under a
 * millimeter, versus the ~0.5% error a spherical formula carries.
 */
export function geodesicDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  if (!isValidLatitude(lat1) || !isValidLatitude(lat2)) {
    throw new Error('Latitude must be a finite number between -90 and 90');
  }
  if (!isValidLongitude(lng1) || !isValidLongitude(lng2)) {
    throw new Error('Longitude must be a finite number between -180 and 180');
  }
  if (lat1 === lat2 && lng1 === lng2) return 0;

  const L = toRadians(lng2 - lng1);
  const U1 = Math.atan((1 - WGS84_F) * Math.tan(toRadians(lat1)));
  const U2 = Math.atan((1 - WGS84_F) * Math.tan(toRadians(lat2)));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let lambda = L;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let cos2SigmaM = 0;
  let cosSqAlpha = 0;
  let converged = false;

  for (let i = 0; i < VINCENTY_MAX_ITERATIONS; i++) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);

    const sinSigmaSq =
      (cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2;
    sinSigma = Math.sqrt(sinSigmaSq);
    if (sinSigma === 0) return 0; // coincident points

    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);

    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    // Equatorial line: cosSqAlpha === 0, cos2SigmaM is undefined so use 0.
    cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;

    const C = (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
    const lambdaPrev = lambda;
    lambda =
      L +
      (1 - C) *
        WGS84_F *
        sinAlpha *
        (sigma +
          C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));

    if (Math.abs(lambda - lambdaPrev) < VINCENTY_CONVERGENCE) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    return haversineDistanceMeters(lat1, lng1, lat2, lng2);
  }

  const uSq = (cosSqAlpha * (WGS84_A * WGS84_A - WGS84_B * WGS84_B)) / (WGS84_B * WGS84_B);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) *
            cos2SigmaM *
            (-3 + 4 * sinSigma * sinSigma) *
            (-3 + 4 * cos2SigmaM * cos2SigmaM)));

  return WGS84_B * A * (sigma - deltaSigma);
}

/** Full-precision coordinate rendering — never truncates significant digits. */
export function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? String(value) : '—';
}

/** Human-readable distance. Storage keeps the unrounded value. */
export function formatDistanceMeters(meters: number, fractionDigits = 1): string {
  if (!Number.isFinite(meters)) return '—';
  return `${meters.toFixed(fractionDigits)} m`;
}
