import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Holiday from '@/models/Holiday';

// GET /api/holidays - Get all holidays, optionally filtered by year
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const activeOnly = searchParams.get('activeOnly') === 'true';

    let query: any = {};
    if (year) {
      query.year = parseInt(year);
    }
    if (activeOnly) {
      query.isActive = true;
    }

    const holidays = await Holiday.find(query).sort({ date: 1 });

    return NextResponse.json({
      success: true,
      data: holidays,
    });
  } catch (error) {
    console.error('Error fetching holidays:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch holidays',
      },
      { status: 500 }
    );
  }
}

// POST /api/holidays - Create a new holiday
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { date, name, type, description, year } = body;

    // Validate required fields
    if (!date || !name || !year) {
      return NextResponse.json(
        {
          success: false,
          error: 'Date, name, and year are required',
        },
        { status: 400 }
      );
    }

    // Check if holiday already exists for this date
    const existingHoliday = await Holiday.findOne({ date });
    if (existingHoliday) {
      return NextResponse.json(
        {
          success: false,
          error: 'Holiday already exists for this date',
        },
        { status: 400 }
      );
    }

    const holiday = new Holiday({
      date,
      name,
      type: type || 'national',
      description: description || '',
      year: parseInt(year),
      isActive: true,
    });

    const savedHoliday = await holiday.save();

    return NextResponse.json({
      success: true,
      data: savedHoliday,
    });
  } catch (error) {
    console.error('Error creating holiday:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create holiday',
      },
      { status: 500 }
    );
  }
}

// PUT /api/holidays/[id] - Update a holiday
export async function PUT(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Holiday ID is required',
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { date, name, type, description, year, isActive } = body;

    const updateData: any = {};
    if (date !== undefined) updateData.date = date;
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (description !== undefined) updateData.description = description;
    if (year !== undefined) updateData.year = parseInt(year);
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedHoliday = await Holiday.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedHoliday) {
      return NextResponse.json(
        {
          success: false,
          error: 'Holiday not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedHoliday,
    });
  } catch (error) {
    console.error('Error updating holiday:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update holiday',
      },
      { status: 500 }
    );
  }
}

// DELETE /api/holidays/[id] - Delete a holiday
export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Holiday ID is required',
        },
        { status: 400 }
      );
    }

    const deletedHoliday = await Holiday.findByIdAndDelete(id);

    if (!deletedHoliday) {
      return NextResponse.json(
        {
          success: false,
          error: 'Holiday not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: deletedHoliday,
    });
  } catch (error) {
    console.error('Error deleting holiday:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete holiday',
      },
      { status: 500 }
    );
  }
}