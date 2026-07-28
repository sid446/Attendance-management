import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ClientPlace from '@/models/ClientPlace';
import { extractCoordinatesFromGoogleMapsLink } from '@/lib/googleMapsCoordinates';
import { Coordinates, isValidCoordinates } from '@/lib/geoDistance';

const COORDINATE_EXTRACTION_ERROR =
  'Could not extract coordinates from the Google Maps link. Open the place in Google Maps, use "Share > Copy link", and paste the full URL.';

const COORDINATE_REQUIRED_ERROR =
  'Provide exact latitude and longitude, or a Google Maps link to extract them.';

/**
 * Prefer explicit lat/lng (highest fidelity — no extraction). Fall back to Maps link.
 * Values are kept as full-precision numbers; nothing is rounded.
 */
async function resolveCoordinates(body: {
  coordinates?: unknown;
  lat?: unknown;
  lng?: unknown;
  googleMapsLink?: unknown;
}): Promise<{ coordinates: Coordinates; error?: undefined } | { coordinates?: undefined; error: string }> {
  const toNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return parseFloat(value.trim());
    return undefined;
  };

  let lat: number | undefined;
  let lng: number | undefined;

  if (body.coordinates && typeof body.coordinates === 'object') {
    lat = toNumber((body.coordinates as { lat?: unknown }).lat);
    lng = toNumber((body.coordinates as { lng?: unknown }).lng);
  } else {
    lat = toNumber(body.lat);
    lng = toNumber(body.lng);
  }

  const hasAnyManual = lat !== undefined || lng !== undefined;
  if (hasAnyManual) {
    if (lat === undefined || lng === undefined || Number.isNaN(lat) || Number.isNaN(lng)) {
      return { error: 'Both latitude and longitude are required as valid numbers.' };
    }
    const candidate = { lat, lng };
    if (!isValidCoordinates(candidate)) {
      return {
        error:
          'Invalid coordinates. Latitude must be between -90 and 90, longitude between -180 and 180.',
      };
    }
    return { coordinates: candidate };
  }

  const link = typeof body.googleMapsLink === 'string' ? body.googleMapsLink.trim() : '';
  if (link) {
    const extracted = await extractCoordinatesFromGoogleMapsLink(link);
    if (!extracted) return { error: COORDINATE_EXTRACTION_ERROR };
    return { coordinates: extracted };
  }

  return { error: COORDINATE_REQUIRED_ERROR };
}

// GET - List all client places
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const employeeId = searchParams.get('employeeId');
    
    let query: any = {};
    
    if (!includeInactive) {
      query.isActive = true;
    }
    
    // If employeeId is provided, only show client places assigned to that employee
    if (employeeId) {
      query.assignedEmployees = employeeId;
    }
    
    const clientPlaces = await ClientPlace.find(query)
      .populate('assignedEmployees', 'name email employeeCode')
      .sort({ createdAt: -1 });
    
    return NextResponse.json({ success: true, data: clientPlaces });
  } catch (error: any) {
    console.error('Error fetching client places:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST - Create new client place
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    
    const body = await req.json();
    const { name, address, googleMapsLink, radiusMeters, assignedEmployees } = body;
    
    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      );
    }

    const resolved = await resolveCoordinates(body);
    if (!resolved.coordinates) {
      return NextResponse.json(
        { success: false, error: resolved.error },
        { status: 400 }
      );
    }
    
    const clientPlace = new ClientPlace({
      name,
      address: address || name,
      googleMapsLink: typeof googleMapsLink === 'string' ? googleMapsLink.trim() : '',
      coordinates: { lat: resolved.coordinates.lat, lng: resolved.coordinates.lng },
      radiusMeters: radiusMeters || 500,
      assignedEmployees: assignedEmployees || []
    });
    
    await clientPlace.save();
    
    // Populate assigned employees for response
    await clientPlace.populate('assignedEmployees', 'name email employeeCode');
    
    return NextResponse.json({ success: true, data: clientPlace }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating client place:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT - Update client place
export async function PUT(req: NextRequest) {
  try {
    await connectDB();
    
    const body = await req.json();
    const { id, name, address, googleMapsLink, radiusMeters, assignedEmployees, isActive, coordinates, lat, lng } = body;
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Client place ID is required' },
        { status: 400 }
      );
    }
    
    const updateData: any = {};
    
    if (name !== undefined) updateData.name = name;
    if (address !== undefined) updateData.address = address;
    if (radiusMeters !== undefined) updateData.radiusMeters = radiusMeters;
    if (assignedEmployees !== undefined) updateData.assignedEmployees = assignedEmployees;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (googleMapsLink !== undefined) {
      updateData.googleMapsLink = typeof googleMapsLink === 'string' ? googleMapsLink.trim() : '';
    }

    const wantsCoordinateUpdate =
      coordinates !== undefined ||
      lat !== undefined ||
      lng !== undefined ||
      (typeof googleMapsLink === 'string' && googleMapsLink.trim().length > 0);

    if (wantsCoordinateUpdate) {
      const resolved = await resolveCoordinates(body);
      if (!resolved.coordinates) {
        return NextResponse.json(
          { success: false, error: resolved.error },
          { status: 400 }
        );
      }
      updateData.coordinates = {
        lat: resolved.coordinates.lat,
        lng: resolved.coordinates.lng,
      };
    }
    
    const clientPlace = await ClientPlace.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    ).populate('assignedEmployees', 'name email employeeCode');
    
    if (!clientPlace) {
      return NextResponse.json(
        { success: false, error: 'Client place not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: clientPlace });
  } catch (error: any) {
    console.error('Error updating client place:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE - Soft delete (deactivate) client place
export async function DELETE(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const permanent = searchParams.get('permanent') === 'true';

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Client place ID is required' },
        { status: 400 }
      );
    }

    if (permanent) {
      // Permanently delete
      const deleted = await ClientPlace.findByIdAndDelete(id);
      if (!deleted) {
        return NextResponse.json(
          { success: false, error: 'Client place not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, message: 'Client place permanently deleted' });
    } else {
      // Soft delete (deactivate)
      const clientPlace = await ClientPlace.findByIdAndUpdate(
        id,
        { $set: { isActive: false } },
        { new: true }
      );
      if (!clientPlace) {
        return NextResponse.json(
          { success: false, error: 'Client place not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, message: 'Client place deactivated successfully' });
    }
  } catch (error: any) {
    console.error('Error deleting client place:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
