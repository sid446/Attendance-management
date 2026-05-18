import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import ScheduleTemplate from '@/models/ScheduleTemplate';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertCanReadEmployees, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import { createDefaultDailySchedule } from '@/lib/defaultDailySchedule';
import type { DailySchedule } from '@/types/ui';

function normalizeDaily(daily: unknown): DailySchedule | null {
  if (!daily || typeof daily !== 'object') return null;
  return daily as DailySchedule;
}

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const effective = effectiveFromDoc(operatorEmail, permDoc);
    const readDenied = assertCanReadEmployees(effective);
    if (readDenied) return readDenied;

    const docs = await ScheduleTemplate.find({}).sort({ name: 1 }).lean();
    const data = docs.map((d) => ({
      _id: String(d._id),
      name: d.name,
      daily: d.daily,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching schedule templates:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch schedule templates' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const effective = effectiveFromDoc(operatorEmail, permDoc);
    if (effective.sections.employees !== 'edit' || effective.employeeTabs.schedule !== 'edit') {
      return NextResponse.json({ success: false, error: 'Not allowed to edit schedule templates' }, { status: 403 });
    }

    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const daily = normalizeDaily(body.daily) ?? createDefaultDailySchedule();

    if (!name) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    }

    const existing = await ScheduleTemplate.findOne({ name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    if (existing) {
      return NextResponse.json({ success: false, error: 'A template with this name already exists' }, { status: 400 });
    }

    const created = await ScheduleTemplate.create({ name, daily });
    return NextResponse.json({
      success: true,
      data: { _id: String(created._id), name: created.name, daily: created.daily },
    });
  } catch (error) {
    console.error('Error creating schedule template:', error);
    return NextResponse.json({ success: false, error: 'Failed to create schedule template' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await connectToDatabase();

    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const effective = effectiveFromDoc(operatorEmail, permDoc);
    if (effective.sections.employees !== 'edit' || effective.employeeTabs.schedule !== 'edit') {
      return NextResponse.json({ success: false, error: 'Not allowed to edit schedule templates' }, { status: 403 });
    }

    const body = await request.json();
    const id = typeof body._id === 'string' ? body._id.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const daily = normalizeDaily(body.daily);

    if (!id) {
      return NextResponse.json({ success: false, error: 'Template id is required' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    }
    if (!daily) {
      return NextResponse.json({ success: false, error: 'Daily schedule is required' }, { status: 400 });
    }

    const duplicate = await ScheduleTemplate.findOne({
      _id: { $ne: id },
      name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (duplicate) {
      return NextResponse.json({ success: false, error: 'A template with this name already exists' }, { status: 400 });
    }

    const updated = await ScheduleTemplate.findByIdAndUpdate(id, { name, daily }, { new: true }).lean();
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: { _id: String(updated._id), name: updated.name, daily: updated.daily },
    });
  } catch (error) {
    console.error('Error updating schedule template:', error);
    return NextResponse.json({ success: false, error: 'Failed to update schedule template' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await connectToDatabase();

    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const effective = effectiveFromDoc(operatorEmail, permDoc);
    if (effective.sections.employees !== 'edit' || effective.employeeTabs.schedule !== 'edit') {
      return NextResponse.json({ success: false, error: 'Not allowed to delete schedule templates' }, { status: 403 });
    }

    const body = await request.json();
    const id = typeof body._id === 'string' ? body._id.trim() : '';

    if (!id) {
      return NextResponse.json({ success: false, error: 'Template id is required' }, { status: 400 });
    }

    const deleted = await ScheduleTemplate.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    console.error('Error deleting schedule template:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete schedule template' }, { status: 500 });
  }
}
