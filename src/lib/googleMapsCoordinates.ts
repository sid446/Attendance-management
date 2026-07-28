import { Coordinates, isValidLatitude, isValidLongitude } from '@/lib/geoDistance';

const MAX_REDIRECT_HOPS = 5;

const NUM = String.raw`-?\d+(?:\.\d+)?`;

/**
 * Ordered by how faithfully each pattern represents the *pinned* location.
 *
 * `!3d/!4d` is the place's own coordinate from Maps' data payload and is the
 * only exact source. `@lat,lng` is the map camera centre, which can sit tens of
 * metres off the pin, so it is the last resort rather than the first match.
 */
const COORDINATE_PATTERNS: RegExp[] = [
  // Canonical place coordinate: ...!8m2!3d<lat>!4d<lng>
  new RegExp(String.raw`!8m2!3d(${NUM})!4d(${NUM})`),
  // Any other !3d/!4d data pair (place, waypoint, marker)
  new RegExp(String.raw`!3d(${NUM})!4d(${NUM})`),
  // Explicit query coordinates, optionally prefixed with "loc:"
  new RegExp(String.raw`[?&](?:q|query|destination|daddr|saddr)=(?:loc:)?(${NUM}),\s*(${NUM})`),
  // Legacy/embedded viewport params that still carry an explicit point
  new RegExp(String.raw`[?&](?:ll|sll|center|cbll)=(${NUM}),\s*(${NUM})`),
  // Separate marker lat/lon params used by some share links
  new RegExp(String.raw`[?&]mlat=(${NUM})(?:&|.)*?[?&]mlon=(${NUM})`),
  // Path-embedded coordinates: /search/lat,lng  /place/lat,lng  /dir/lat,lng
  new RegExp(String.raw`/(?:search|place|dir)/(${NUM}),\s*(${NUM})`),
  // geo: URI
  new RegExp(String.raw`geo:(${NUM}),\s*(${NUM})`),
  // Map camera centre — least precise, checked last
  new RegExp(String.raw`@(${NUM}),(${NUM})`),
];

export function isShortGoogleMapsLink(link: string): boolean {
  return (
    link.includes('goo.gl/maps') ||
    link.includes('maps.app.goo.gl') ||
    link.includes('g.co/kgs')
  );
}

/**
 * Percent-decoding matters because share links often wrap the real Maps URL in
 * a `continue=` / consent redirect where commas arrive as `%2C`.
 */
function decodeVariants(link: string): string[] {
  const variants = [link];
  let current = link;
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      variants.push(decoded);
      current = decoded;
    } catch {
      break;
    }
  }
  return variants;
}

function matchCoordinates(text: string): Coordinates | null {
  for (const pattern of COORDINATE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    // parseFloat keeps every digit the link carries — no rounding is applied.
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (isValidLatitude(lat) && isValidLongitude(lng)) {
      return { lat, lng };
    }
  }
  return null;
}

export function extractCoordinatesFromUrl(link: string): Coordinates | null {
  if (!link || typeof link !== 'string') return null;
  for (const variant of decodeVariants(link)) {
    const coordinates = matchCoordinates(variant);
    if (coordinates) return coordinates;
  }
  return null;
}

async function followRedirect(url: string): Promise<string | null> {
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const response = await fetch(url, { method, redirect: 'manual' });
      const location = response.headers.get('location');
      if (location) {
        return new URL(location, url).toString();
      }
    } catch {
      // Try the next method, then give up on this hop.
    }
  }
  return null;
}

/** Every URL seen while expanding a short link; later hops are more specific. */
async function resolveUrlChain(link: string): Promise<string[]> {
  const chain = [link];
  let current = link;

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    const next = await followRedirect(current);
    if (!next || chain.includes(next)) break;
    chain.push(next);
    current = next;
  }

  return chain;
}

/** Last resort: Maps embeds the pin's !3d/!4d pair in the page markup too. */
async function extractFromPageBody(url: string): Promise<Coordinates | null> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        // Without a browser UA, Maps serves a stripped page with no coordinates.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
      },
    });

    const fromFinalUrl = extractCoordinatesFromUrl(response.url);
    if (fromFinalUrl) return fromFinalUrl;

    const body = await response.text();
    const match = body.match(new RegExp(String.raw`!3d(${NUM})!4d(${NUM})`));
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (isValidLatitude(lat) && isValidLongitude(lng)) return { lat, lng };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Resolves a Google Maps link to its exact coordinates, preserving every digit
 * of precision the link provides.
 */
export async function extractCoordinatesFromGoogleMapsLink(
  link: string,
): Promise<Coordinates | null> {
  const direct = extractCoordinatesFromUrl(link);
  if (direct) return direct;

  const chain = await resolveUrlChain(link);
  // Walk backwards: the fully expanded URL carries the place data payload.
  for (let i = chain.length - 1; i >= 0; i--) {
    const coordinates = extractCoordinatesFromUrl(chain[i]);
    if (coordinates) return coordinates;
  }

  return extractFromPageBody(chain[chain.length - 1]);
}
