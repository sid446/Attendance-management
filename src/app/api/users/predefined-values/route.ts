import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import PredefinedValues from '@/models/PredefinedValues';

export async function GET() {
  try {
    await connectToDatabase();

    const allValues = await PredefinedValues.getAllValues();

    return NextResponse.json({
      success: true,
      data: allValues
    });
  } catch (error) {
    console.error('Error fetching predefined values:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch predefined values' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();
    const { type, value } = await request.json();

    if (!type || !value) {
      return NextResponse.json(
        { success: false, error: 'Type and value are required' },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes = ['teams', 'designations', 'paidFrom', 'categories'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid type' },
        { status: 400 }
      );
    }

    // Check if value already exists
    const existingValues = await PredefinedValues.getValuesByType(type);
    if (existingValues.some(v => v.toLowerCase() === value.toLowerCase().trim())) {
      return NextResponse.json(
        { success: false, error: 'Value already exists' },
        { status: 400 }
      );
    }

    // Add the value
    const success = await PredefinedValues.addValue(type, value.trim());
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Failed to add value' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Value added successfully'
    });
  } catch (error) {
    console.error('Error adding predefined value:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add predefined value' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await connectToDatabase();
    const { type, value } = await request.json();

    if (!type || !value) {
      return NextResponse.json(
        { success: false, error: 'Type and value are required' },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes = ['teams', 'designations', 'paidFrom', 'categories'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid type' },
        { status: 400 }
      );
    }

    // Remove the value
    const success = await PredefinedValues.removeValue(type, value);
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Value not found or already removed' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Value removed successfully'
    });
  } catch (error) {
    console.error('Error removing predefined value:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove predefined value' },
      { status: 500 }
    );
  }
}