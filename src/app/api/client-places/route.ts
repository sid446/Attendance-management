import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ClientPlace from '@/models/ClientPlace';

// Helper function to check if URL is a shortened Google Maps link
function isShortGoogleMapsLink(link: string): boolean {
  return link.includes('goo.gl/maps') || link.includes('maps.app.goo.gl');
}

// Helper to expand shortened Google Maps URL by following redirect
async function expandShortenedUrl(shortUrl: string): Promise<string> {
  try {
    // Use fetch with redirect: 'manual' to get the redirect location
    const response = await fetch(shortUrl, {
      method: 'HEAD',
      redirect: 'manual'
    });
    
    // Get the Location header which contains the expanded URL
    const location = response.headers.get('location');
    if (location) {
      // Sometimes it redirects multiple times, follow once more if needed
      if (isShortGoogleMapsLink(location)) {
        const secondResponse = await fetch(location, {
          method: 'HEAD',
          redirect: 'manual'
        });
        return secondResponse.headers.get('location') || location;
      }
      return location;
    }
    
    // If HEAD doesn't work, try GET with redirect follow
    const getResponse = await fetch(shortUrl, {
      method: 'GET',
      redirect: 'follow'
    });
    return getResponse.url;
  } catch (e) {
    console.error('Error expanding shortened URL:', e);
    return shortUrl;
  }
}

// Helper function to extract coordinates from Google Maps link
function extractCoordinatesFromUrl(link: string): { lat: number; lng: number } | null {
  try {
    // Handle various Google Maps URL formats
    
    // Format 1: https://www.google.com/maps/place/.../@lat,lng,zoom
    // Format 2: https://www.google.com/maps?q=lat,lng
    // Format 3: https://maps.google.com/?ll=lat,lng
    // Format 4: https://www.google.com/maps/search/lat,lng
    // Format 5: https://www.google.com/maps/@lat,lng,zoom
    
    // Try to extract from @lat,lng pattern
    const atMatch = link.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (atMatch) {
      return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
    }
    
    // Try to extract from ?q=lat,lng pattern
    const qMatch = link.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (qMatch) {
      return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
    }
    
    // Try to extract from ?ll=lat,lng pattern
    const llMatch = link.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (llMatch) {
      return { lat: parseFloat(llMatch[1]), lng: parseFloat(llMatch[2]) };
    }
    
    // Try to extract from /search/lat,lng pattern
    const searchMatch = link.match(/\/search\/(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (searchMatch) {
      return { lat: parseFloat(searchMatch[1]), lng: parseFloat(searchMatch[2]) };
    }
    
    // Try to extract from place ID format with coordinates
    const placeMatch = link.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
    if (placeMatch) {
      return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) };
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

// Main function to extract coordinates - handles both short and full URLs
async function extractCoordinatesFromGoogleMapsLink(link: string): Promise<{ lat: number; lng: number } | null> {
  // First, try to extract from the original link
  let coordinates = extractCoordinatesFromUrl(link);
  if (coordinates) {
    return coordinates;
  }
  
  // If it's a shortened URL, expand it and try again
  if (isShortGoogleMapsLink(link)) {
    const expandedUrl = await expandShortenedUrl(link);
    console.log('Expanded URL:', expandedUrl);
    coordinates = extractCoordinatesFromUrl(expandedUrl);
    if (coordinates) {
      return coordinates;
    }
  }
  
  return null;
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
    
    if (!name || !googleMapsLink) {
      return NextResponse.json(
        { success: false, error: 'Name and Google Maps link are required' },
        { status: 400 }
      );
    }
    
    // Extract coordinates from Google Maps link
    const coordinates = await extractCoordinatesFromGoogleMapsLink(googleMapsLink);
    if (!coordinates) {
      return NextResponse.json(
        { success: false, error: 'Could not extract coordinates from the Google Maps link. Please ensure it contains location coordinates or try pasting the full URL instead of shortened link.' },
        { status: 400 }
      );
    }
    
    const clientPlace = new ClientPlace({
      name,
      address: address || name,
      googleMapsLink,
      coordinates,
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
    const { id, name, address, googleMapsLink, radiusMeters, assignedEmployees, isActive } = body;
    
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
    
    // If Google Maps link is updated, re-extract coordinates
    if (googleMapsLink) {
      const coordinates = await extractCoordinatesFromGoogleMapsLink(googleMapsLink);
      if (!coordinates) {
        return NextResponse.json(
          { success: false, error: 'Could not extract coordinates from the Google Maps link. Try pasting the full URL.' },
          { status: 400 }
        );
      }
      updateData.googleMapsLink = googleMapsLink;
      updateData.coordinates = coordinates;
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
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Client place ID is required' },
        { status: 400 }
      );
    }
    
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
  } catch (error: any) {
    console.error('Error deleting client place:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
