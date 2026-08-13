import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LocationAttendance from '@/models/LocationAttendance';
import ClientPlace from '@/models/ClientPlace';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { calculateSummary } from '@/lib/attendanceSummaryCalculation';
import { forbidUnlessSelf, requireEmployeeSession } from '@/lib/employeeRouteAuth';
import { istDateString, istTimeString } from '@/lib/attendanceRequestWindow';
import { geodesicDistanceMeters, isValidCoordinates } from '@/lib/geoDistance';
import { applyAttendanceEditSource } from '@/lib/daywiseAttendanceSource';
import {
  LOCATION_PUNCH_REMARK_PREFIX,
  LOCATION_PUNCH_SOURCE,
} from '@/lib/locationPunchAttendance';

// Helper to calculate total hours between two times
function calculateTotalHours(inTime: string, outTime: string): number {
  const [inH, inM] = inTime.split(':').map(Number);
  const [outH, outM] = outTime.split(':').map(Number);
  const inMinutes = inH * 60 + inM;
  const outMinutes = outH * 60 + outM;
  return (outMinutes - inMinutes) / 60;
}

// GET - Get location attendance records for an employee
export async function GET(req: NextRequest) {
  try {
    const auth = await requireEmployeeSession(req);
    if (auth instanceof NextResponse) return auth;

    await connectDB();
    
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const clientPlaceId = searchParams.get('clientPlaceId');
    const date = searchParams.get('date');
    const monthYear = searchParams.get('monthYear');
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    const forbidden = forbidUnlessSelf(auth.userId, userId);
    if (forbidden) return forbidden;
    
    const query: any = { userId };
    
    if (clientPlaceId) {
      query.clientPlaceId = clientPlaceId;
    }
    
    if (date) {
      query.date = date;
    } else if (monthYear) {
      // Filter by month-year (YYYY-MM)
      query.date = { $regex: `^${monthYear}` };
    }
    
    const records = await LocationAttendance.find(query)
      .populate('clientPlaceId', 'name address')
      .sort({ date: -1 });
    
    return NextResponse.json({ success: true, data: records });
  } catch (error: any) {
    console.error('Error fetching location attendance:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST - Mark in or out punch with location verification
export async function POST(req: NextRequest) {
  try {
    const auth = await requireEmployeeSession(req);
    if (auth instanceof NextResponse) return auth;

    await connectDB();
    
    const body = await req.json();
    const { userId, clientPlaceId, punchType, coordinates, accuracyMeters } = body;

    const forbidden = forbidUnlessSelf(auth.userId, userId);
    if (forbidden) return forbidden;
    
    if (!userId || !clientPlaceId || !punchType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: userId, clientPlaceId, punchType' },
        { status: 400 }
      );
    }

    // Checked by value/range rather than truthiness so that a genuine 0° reading is accepted.
    if (!isValidCoordinates(coordinates)) {
      return NextResponse.json(
        { success: false, error: 'Invalid coordinates. Latitude must be between -90 and 90 and longitude between -180 and 180.' },
        { status: 400 }
      );
    }
    
    if (!['in', 'out'].includes(punchType)) {
      return NextResponse.json(
        { success: false, error: 'punchType must be "in" or "out"' },
        { status: 400 }
      );
    }
    
    // Get the client place
    const clientPlace = await ClientPlace.findById(clientPlaceId);
    if (!clientPlace) {
      return NextResponse.json(
        { success: false, error: 'Client place not found' },
        { status: 404 }
      );
    }
    
    // Check if user is assigned to this client place
    const isAssigned = clientPlace.assignedEmployees.some(
      (empId: any) => empId.toString() === userId
    );
    if (!isAssigned) {
      return NextResponse.json(
        { success: false, error: 'You are not assigned to this client place' },
        { status: 403 }
      );
    }
    
    if (!isValidCoordinates(clientPlace.coordinates)) {
      return NextResponse.json(
        { success: false, error: `${clientPlace.name} has no valid coordinates saved. Ask your administrator to re-save its Google Maps link.` },
        { status: 409 }
      );
    }

    // WGS-84 geodesic distance, unrounded.
    const distance = geodesicDistanceMeters(
      coordinates.lat,
      coordinates.lng,
      clientPlace.coordinates.lat,
      clientPlace.coordinates.lng
    );
    
    const isWithinRadius = distance <= clientPlace.radiusMeters;
    
    // Don't allow marking attendance if outside the allowed range
    if (!isWithinRadius) {
      return NextResponse.json(
        { 
          success: false, 
          error: `You are ${distance.toFixed(1)} meters away from ${clientPlace.name}. You must be within ${clientPlace.radiusMeters} meters to mark attendance.`
        },
        { status: 403 }
      );
    }
    
    const now = new Date();
    const todayDate = istDateString(now);
    const currentTime = istTimeString(now);
    
    // Find or create today's location attendance record
    let record = await LocationAttendance.findOne({
      userId,
      clientPlaceId,
      date: todayDate
    });
    
    const punchData = {
      time: currentTime,
      timestamp: now,
      coordinates: {
        lat: coordinates.lat,
        lng: coordinates.lng
      },
      accuracyMeters:
        typeof accuracyMeters === 'number' && Number.isFinite(accuracyMeters)
          ? accuracyMeters
          : undefined,
      distanceFromClient: distance,
      isWithinRadius: true, // Always true now since we check above
      status: 'approved' as const // Always approved since we check above
    };
    
    if (!record) {
      // Create new record
      if (punchType === 'out') {
        return NextResponse.json(
          { success: false, error: 'You must mark in-time before marking out-time' },
          { status: 400 }
        );
      }
      
      record = new LocationAttendance({
        userId,
        clientPlaceId,
        date: todayDate,
        inPunch: punchData,
        status: 'partial'
      });
    } else {
      // Update existing record
      if (punchType === 'in') {
        // Check if in-time already marked
        if (record.inPunch) {
          return NextResponse.json(
            { success: false, error: 'In-time already marked for today. You can only mark out-time now.' },
            { status: 400 }
          );
        }
        record.inPunch = punchData;
        record.status = 'partial';
      } else {
        // Out punch
        if (!record.inPunch) {
          return NextResponse.json(
            { success: false, error: 'You must mark in-time before marking out-time' },
            { status: 400 }
          );
        }
        if (record.outPunch) {
          return NextResponse.json(
            { success: false, error: 'Out-time already marked for today' },
            { status: 400 }
          );
        }
        
        record.outPunch = punchData;
        
        // Calculate total hours
        if (record.inPunch.time) {
          record.totalHours = calculateTotalHours(record.inPunch.time, currentTime);
        }
        
        // Both punches are approved (since we check range at start), so mark as complete
        record.status = 'complete';
        
        // Also update the main attendance record since both punches are approved
        await updateMainAttendanceRecord(
          userId,
          todayDate,
          record.inPunch.time,
          currentTime,
          clientPlace.name
        );
      }
    }
    
    await record.save();
    await record.populate('clientPlaceId', 'name address');
    
    return NextResponse.json({
      success: true,
      data: record,
      message: `${punchType === 'in' ? 'In' : 'Out'}-time marked successfully! You are ${distance.toFixed(1)}m from ${clientPlace.name}.`
    });
  } catch (error: any) {
    console.error('Error marking location attendance:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Helper function to update main attendance record
async function updateMainAttendanceRecord(
  userId: string,
  date: string,
  inTime: string,
  outTime: string,
  clientPlaceName: string
) {
  try {
    const monthYear = date.substring(0, 7); // YYYY-MM
    
    // Find the main attendance record
    let attendance = await Attendance.findOne({ userId, monthYear });
    
    if (!attendance) {
      // Create new attendance record if doesn't exist
      attendance = new Attendance({
        userId,
        monthYear,
        records: {}
      });
    }
    
    // Update the record for this date
    const rec: Record<string, unknown> = {
      checkin: inTime,
      checkout: outTime,
      typeOfPresence: 'Present - client place',
      value: 1,
      halfDay: false,
      totalHour: 0, // Will be recalculated
      excessHour: 0,
      remarks: `${LOCATION_PUNCH_REMARK_PREFIX} ${clientPlaceName}`,
    };
    applyAttendanceEditSource(rec, { approvedBy: LOCATION_PUNCH_SOURCE });
    attendance.records.set(date, rec as any);

    const user = await User.findById(userId);
    if (user) {
      attendance.summary = calculateSummary(attendance.records, user);
    }

    await attendance.save();
  } catch (error) {
    console.error('Error updating main attendance record:', error);
    // Don't throw - this is a secondary operation
  }
}
