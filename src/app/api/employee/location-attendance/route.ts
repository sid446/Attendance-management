import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LocationAttendance from '@/models/LocationAttendance';
import ClientPlace from '@/models/ClientPlace';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { calculateSummary } from '@/lib/attendanceSummaryCalculation';
import { calculateTotalHours, isValidPunchTime } from '@/lib/attendanceHours';
import { forbidUnlessSelf, requireEmployeeSession } from '@/lib/employeeRouteAuth';
import { istDateString, istTimeString } from '@/lib/attendanceRequestWindow';
import { geodesicDistanceMeters, isValidCoordinates } from '@/lib/geoDistance';
import { applyAttendanceEditSource } from '@/lib/daywiseAttendanceSource';
import {
  LOCATION_PUNCH_REMARK_PREFIX,
  LOCATION_PUNCH_SOURCE,
} from '@/lib/locationPunchAttendance';

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
      record = new LocationAttendance({
        userId,
        clientPlaceId,
        date: todayDate,
        ...(punchType === 'in' ? { inPunch: punchData } : { outPunch: punchData }),
        status: 'partial',
      });
    } else if (punchType === 'in') {
      if (record.inPunch) {
        return NextResponse.json(
          { success: false, error: 'In-time already marked for today at this location.' },
          { status: 400 }
        );
      }
      record.inPunch = punchData;
    } else {
      if (record.outPunch) {
        return NextResponse.json(
          { success: false, error: 'Out-time already marked for today at this location.' },
          { status: 400 }
        );
      }
      record.outPunch = punchData;
    }

    const gpsInTime = record.inPunch?.time ? String(record.inPunch.time) : '';
    const gpsOutTime = record.outPunch?.time ? String(record.outPunch.time) : '';
    if (record.inPunch && record.outPunch) {
      record.totalHours = calculateTotalHours(gpsInTime, gpsOutTime);
      record.status = 'complete';
    } else {
      record.status = 'partial';
      record.totalHours = undefined;
    }

    await mergeLocationPunchIntoAttendance(
      userId,
      todayDate,
      punchType,
      currentTime,
      clientPlace.name
    );

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

function existingPunchTime(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const t = String(candidate ?? '').trim();
    if (isValidPunchTime(t)) return t;
  }
  return '';
}

/** Write only the GPS side that was punched; keep the other side for later thumb upload. */
async function mergeLocationPunchIntoAttendance(
  userId: string,
  date: string,
  punchType: 'in' | 'out',
  punchTime: string,
  clientPlaceName: string
) {
  try {
    const monthYear = date.substring(0, 7); // YYYY-MM

    let attendance = await Attendance.findOne({ userId, monthYear });

    if (!attendance) {
      attendance = new Attendance({
        userId,
        monthYear,
        records: {},
      });
    }

    const existingRaw = attendance.records.get(date);
    const existing =
      existingRaw && typeof (existingRaw as { toObject?: () => Record<string, unknown> }).toObject === 'function'
        ? (existingRaw as { toObject: () => Record<string, unknown> }).toObject()
        : (existingRaw as Record<string, unknown> | undefined);
    let checkin = existingPunchTime(existing?.checkin);
    let checkout = existingPunchTime(existing?.checkout);
    let editedCheckin = existingPunchTime(existing?.editedCheckin, checkin);
    let editedCheckout = existingPunchTime(existing?.editedCheckout, checkout);

    if (punchType === 'in') {
      checkin = punchTime;
      editedCheckin = punchTime;
    } else {
      checkout = punchTime;
      editedCheckout = punchTime;
    }

    const workedHours = calculateTotalHours(editedCheckin, editedCheckout);
    const rec: Record<string, unknown> = {
      ...(existing || {}),
      checkin,
      checkout,
      editedCheckin,
      editedCheckout,
      typeOfPresence: 'Present - client place',
      value: workedHours > 0 ? 1 : 0,
      halfDay: false,
      totalHour: workedHours,
      excessHour: existing?.excessHour ?? 0,
      remarks: `${LOCATION_PUNCH_REMARK_PREFIX} ${clientPlaceName}`,
    };
    applyAttendanceEditSource(rec, { approvedBy: LOCATION_PUNCH_SOURCE });
    attendance.records.set(date, rec);

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
