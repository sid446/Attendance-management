import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User, { IUser } from '@/models/User';

type IncomingSchedule = {
  name?: string;
  employeeCode?: string;
  inTime?: string;
  outTime?: string;
  outTimeSat?: string;
  dailyRanges?: {
    monday?: string;
    tuesday?: string;
    wednesday?: string;
    thursday?: string;
    friday?: string;
    saturday?: string;
    sunday?: string;
  };
};

type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseDate(value: unknown): Date | undefined {
  const text = normalizeText(value);
  if (!text) return undefined;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setHours(0, 0, 0, 0);
  return d;
}

function normalizeTime(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return '';
  if (/^\d{1,2}:\d{2}$/.test(text)) {
    const [h, m] = text.split(':');
    return `${String(Number(h)).padStart(2, '0')}:${m}`;
  }
  return text;
}

function parseRangeSlot(value: string): { inTime: string; outTime: string } | null {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  const offKeywords = ['off', 'holiday', 'weekoff', 'wo', '-', 'na', 'n/a'];
  if (offKeywords.includes(normalized.toLowerCase())) {
    return { inTime: '', outTime: '' };
  }

  const match = normalized.match(/^(\d{1,2}:\d{2})\s*[-–to]+\s*(\d{1,2}:\d{2})$/i);
  if (!match) {
    return null;
  }
  return {
    inTime: normalizeTime(match[1]),
    outTime: normalizeTime(match[2]),
  };
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const schedules = Array.isArray(body?.schedules) ? (body.schedules as IncomingSchedule[]) : [];
    const effectiveFrom = parseDate(body?.effectiveFrom) || new Date();

    if (!schedules.length) {
      return NextResponse.json({ success: false, error: 'No schedule data provided' }, { status: 400 });
    }

    const stats = {
      updated: 0,
      failed: 0,
      errors: [] as string[],
      effectiveFrom: effectiveFrom.toISOString().split('T')[0],
    };

    const users = await User.find({});
    const userMapByCode = new Map<string, IUser>();
    const userMapByName = new Map<string, IUser>();

    users.forEach((u) => {
      const code = normalizeText((u as any).employeeCode).toLowerCase();
      if (code) userMapByCode.set(code, u);

      const name = normalizeText((u as any).name).toLowerCase();
      if (name) {
        userMapByName.set(name, u);
        userMapByName.set(name.replace(/\./g, ' '), u);
      }
    });

    const effectiveFromKey = effectiveFrom.toISOString().split('T')[0];

    for (const row of schedules) {
      try {
        const name = normalizeText(row?.name);
        const employeeCode = normalizeText(row?.employeeCode);

        if (!name && !employeeCode) {
          stats.failed++;
          stats.errors.push('Row skipped: missing both Name and Employee Code');
          continue;
        }

        let user: IUser | undefined;
        if (employeeCode) {
          user = userMapByCode.get(employeeCode.toLowerCase());
        }

        if (!user && name) {
          const nameKey = name.toLowerCase();
          user = userMapByName.get(nameKey) || userMapByName.get(nameKey.replace(/\s+/g, '.'));
        }

        if (!user) {
          stats.failed++;
          stats.errors.push(`User not found: ${name || employeeCode}`);
          continue;
        }

        const inTime = normalizeTime(row.inTime);
        const outTime = normalizeTime(row.outTime);
        const outTimeSat = normalizeTime(row.outTimeSat) || outTime;

        const daily: Record<DayKey, any> = {
          monday: { inTime: '', outTime: '', isHoliday: true, isHalfDay: false },
          tuesday: { inTime: '', outTime: '', isHoliday: true, isHalfDay: false },
          wednesday: { inTime: '', outTime: '', isHoliday: true, isHalfDay: false },
          thursday: { inTime: '', outTime: '', isHoliday: true, isHalfDay: false },
          friday: { inTime: '', outTime: '', isHoliday: true, isHalfDay: false },
          saturday: { inTime: '', outTime: '', isHoliday: true, isHalfDay: true },
          sunday: { inTime: '', outTime: '', isHoliday: true, isHalfDay: false },
        };

        // Fallback template via Sch-In/Sch-Out if provided.
        if (inTime && outTime) {
          daily.monday = { inTime, outTime, isHoliday: false, isHalfDay: false };
          daily.tuesday = { inTime, outTime, isHoliday: false, isHalfDay: false };
          daily.wednesday = { inTime, outTime, isHoliday: false, isHalfDay: false };
          daily.thursday = { inTime, outTime, isHoliday: false, isHalfDay: false };
          daily.friday = { inTime, outTime, isHoliday: false, isHalfDay: false };
          daily.saturday = { inTime, outTime: outTimeSat, isHoliday: false, isHalfDay: true };
        }

        // Day-wise override: values like "10:00 - 17:00" or "off".
        const dayWise = row.dailyRanges || {};
        const days: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        let hasDayRange = false;
        for (const day of days) {
          const raw = normalizeText((dayWise as any)[day]);
          if (!raw) continue;
          hasDayRange = true;
          const slot = parseRangeSlot(raw);
          if (!slot) {
            stats.failed++;
            stats.errors.push(`Invalid ${day} schedule format for: ${name || employeeCode} (${raw})`);
            continue;
          }
          if (!slot.inTime || !slot.outTime) {
            daily[day] = { inTime: '', outTime: '', isHoliday: true, isHalfDay: false };
          } else {
            daily[day] = {
              inTime: slot.inTime,
              outTime: slot.outTime,
              isHoliday: false,
              isHalfDay: false,
            };
          }
        }

        if (!hasDayRange && !(inTime && outTime)) {
          stats.failed++;
          stats.errors.push(`Missing schedule values for: ${name || employeeCode}`);
          continue;
        }

        if (!Array.isArray((user as any).schedules)) {
          (user as any).schedules = [];
        }

        const schedulesArr = (user as any).schedules as Array<any>;
        const existingIndex = schedulesArr.findIndex((entry) => {
          const d = parseDate(entry?.effectiveFrom);
          return d && d.toISOString().split('T')[0] === effectiveFromKey;
        });

        const newEntry = {
          effectiveFrom,
          daily,
        };

        if (existingIndex >= 0) {
          schedulesArr[existingIndex] = newEntry;
        } else {
          schedulesArr.push(newEntry);
        }

        schedulesArr.sort((a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime());

        // Keep legacy schedule fields in sync for compatibility.
        const legacyWeekday = daily.monday;
        const legacySaturday = daily.saturday;
        if (legacyWeekday?.inTime && legacyWeekday?.outTime) {
          (user as any).scheduleInOutTime = {
            inTime: legacyWeekday.inTime,
            outTime: legacyWeekday.outTime,
            isHoliday: false,
            isHalfDay: false,
          };
        }
        if (legacySaturday?.inTime && legacySaturday?.outTime) {
          (user as any).scheduleInOutTimeSat = {
            inTime: legacySaturday.inTime,
            outTime: legacySaturday.outTime,
            isHoliday: false,
            isHalfDay: Boolean(legacySaturday.isHalfDay),
          };
        }

        await user.save();
        stats.updated++;
      } catch (error) {
        stats.failed++;
        stats.errors.push(`Failed schedule row ${normalizeText(row?.name) || '(unknown)'}: ${(error as Error).message}`);
      }
    }

    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('Basic schedule upload error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process schedule upload' }, { status: 500 });
  }
}
