import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import MachineFormat from '@/models/MachineFormat';

// GET /api/machine-formats - Get all active machine formats
export async function GET() {
  try {
    await dbConnect();

    const formats = await MachineFormat.find({ isActive: true })
      .sort({ createdAt: 1 })
      .select('machineId name description headers');

    return NextResponse.json({
      success: true,
      data: formats
    });
  } catch (error) {
    console.error('Error fetching machine formats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch machine formats' },
      { status: 500 }
    );
  }
}

// POST /api/machine-formats - Create a new machine format (admin only)
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { machineId, name, description, headers } = body;

    // Validate required fields
    if (!machineId || !name || !description || !headers || !Array.isArray(headers)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: machineId, name, description, headers' },
        { status: 400 }
      );
    }

    // Check if machineId already exists
    const existing = await MachineFormat.findOne({ machineId });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Machine ID already exists' },
        { status: 400 }
      );
    }

    const newFormat = new MachineFormat({
      machineId,
      name,
      description,
      headers
    });

    await newFormat.save();

    return NextResponse.json({
      success: true,
      data: newFormat
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating machine format:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create machine format' },
      { status: 500 }
    );
  }
}