import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { reconcilePendingAttendanceForUser } from '@/lib/reconcilePendingAttendance';
import User, { IUser } from '@/models/User';
import {
  applyManagedEffectiveHistories,
  MANAGED_EFFECTIVE_FIELDS,
  ManagedEffectiveField,
  normalizeManagedFieldValue,
} from '@/lib/userFieldHistory';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import {
  assertCanApplyUserPutBody,
  assertHrSection,
  collectUserFieldKeysFromEmployeeRecords,
  effectiveFromDoc,
} from '@/lib/hrConsolePermissionUtils';

type UploadMode = 'update' | 'add';

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseDate(value: unknown): Date | undefined {
  const text = normalizeText(value);
  if (!text) return undefined;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const DEFAULT_BASELINE_EFFECTIVE_FROM = new Date('2025-12-31T00:00:00.000Z');

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const effective = effectiveFromDoc(operatorEmail, permDoc);
    const sec = assertHrSection(effective, 'employeeMasterUpload', 'edit');
    if (sec) return sec;

    const body = await request.json();
    const employees = Array.isArray(body?.employees) ? body.employees : [];
    const mode: UploadMode = body?.mode === 'add' ? 'add' : 'update';
    const parsedEffectiveFrom = parseDate(body?.effectiveFrom);
    const effectiveFrom = parsedEffectiveFrom || new Date();

    if (!employees.length) {
      return NextResponse.json({ success: false, error: 'No employee data provided' }, { status: 400 });
    }

    const bulkDenied = assertCanApplyUserPutBody(collectUserFieldKeysFromEmployeeRecords(employees), effective);
    if (bulkDenied) return bulkDenied;

    const stats = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: [] as string[],
      mode,
      effectiveFrom: effectiveFrom.toISOString().split('T')[0],
    };

    const existingUsers = await User.find({});

    const mapByCode = new Map<string, IUser>();
    const mapByName = new Map<string, IUser>();

    existingUsers.forEach((u) => {
      const code = normalizeText((u as any).employeeCode).toLowerCase();
      if (code) mapByCode.set(code, u);
      const name = normalizeText((u as any).name).toLowerCase();
      if (name) {
        mapByName.set(name, u);
        mapByName.set(name.replace(/\./g, ' '), u);
      }
    });

    const findUserByName = (name: string) => {
      const key = normalizeText(name).toLowerCase();
      if (!key) return undefined;
      return mapByName.get(key) || mapByName.get(key.replace(/\s+/g, '.')) || mapByName.get(key.replace(/\./g, ' '));
    };

    for (const emp of employees) {
      try {
        const name = normalizeText(emp?.name);
        const employeeCode = normalizeText(emp?.employeeCode);
        if (!name) {
          stats.failed++;
          stats.errors.push('Row skipped: Missing Name');
          continue;
        }

        const codeKey = employeeCode.toLowerCase();
        const nameKey = name.toLowerCase();
        let matchedUser: IUser | undefined = undefined;

        if (codeKey) {
          matchedUser = mapByCode.get(codeKey);
        }

        if (!matchedUser) {
          matchedUser = mapByName.get(nameKey) || mapByName.get(nameKey.replace(/\s+/g, '.'));
        }

        const updateData: any = {
          registrationNo: emp.registrationNo,
          employeeCode: employeeCode || undefined,
          paidFrom: emp.paidFrom,
          designation: emp.designation,
          category: emp.category,
          employmentType: emp.category === 'Article' ? 'article' : emp.employmentType,
          tallyName: emp.tallyName,
          gender: emp.gender,
          email: emp.email,
          parentName: emp.parentName,
          parentOccupation: emp.parentOccupation,
          mobileNumber: emp.mobileNumber,
          alternateMobileNumber: emp.alternateMobileNumber,
          alternateEmail: emp.alternateEmail,
          address1: emp.address1,
          address2: emp.address2,
          emergencyContactNo: emp.emergencyContactNo,
          emergencyContactRelation: emp.emergencyContactRelation,
          anniversaryDate: parseDate(emp.anniversaryDate),
          bankName: emp.bankName,
          branchName: emp.branchName,
          accountNumber: emp.accountNumber,
          ifscCode: emp.ifscCode,
          accountType: emp.accountType,
          accountHolderName: emp.accountHolderName,
          aadhaarNumber: emp.aadhaarNumber,
          panNumber: emp.panNumber,
          basicSalary: emp.basicSalary,
          laptopAllowance: emp.laptopAllowance,
          totalSalaryPerMonth: emp.totalSalaryPerMonth,
          totalSalaryPerAnnum: emp.totalSalaryPerAnnum,
          pf: emp.pf,
          esi: emp.esi,
          gratuity: emp.gratuity,
          joiningDate: parseDate(emp.joiningDate),
          articleshipStartDate: parseDate(emp.articleshipStartDate),
          transferCase: emp.transferCase,
          firstYearArticleship: emp.firstYearArticleship,
          secondYearArticleship: emp.secondYearArticleship,
          thirdYearArticleship: emp.thirdYearArticleship,
          filledScholarship: emp.filledScholarship,
          qualificationLevel: emp.qualificationLevel,
          nextAttemptDueDate: parseDate(emp.nextAttemptDueDate),
          registeredUnderPartner: emp.registeredUnderPartner,
          workingUnderPartner: emp.workingUnderPartner,
        };

        const attendanceApprover = normalizeText(emp.attendanceEmail);
        if (attendanceApprover) {
          if (attendanceApprover.includes('@')) {
            updateData.attendanceEmail = attendanceApprover;
          } else {
            const approverUser = findUserByName(attendanceApprover);
            if (approverUser) {
              updateData.attendanceEmail = (approverUser as any).attendanceEmail || (approverUser as any).email;
            }
          }
        }

        Object.keys(updateData).forEach((key) => {
          if (updateData[key] === undefined || updateData[key] === null || updateData[key] === '') {
            delete updateData[key];
          }
        });

        if (mode === 'update') {
          if (!matchedUser) {
            stats.failed++;
            stats.errors.push(`Not found for update: ${name}${employeeCode ? ` (${employeeCode})` : ''}`);
            continue;
          }

          const managedIncoming: Partial<Record<ManagedEffectiveField, unknown>> = {};
          const priorManaged: Partial<Record<ManagedEffectiveField, string>> = {};
          for (const field of MANAGED_EFFECTIVE_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(updateData, field) && updateData[field as keyof typeof updateData] !== undefined) {
              managedIncoming[field] = updateData[field as keyof typeof updateData] as unknown;
              priorManaged[field] = normalizeManagedFieldValue(matchedUser[field as keyof IUser]);
            }
          }

          Object.assign(matchedUser, updateData);

          if (Object.keys(managedIncoming).length > 0) {
            const fieldChangedAt: Partial<Record<ManagedEffectiveField, Date>> = {};
            for (const f of Object.keys(managedIncoming) as ManagedEffectiveField[]) {
              fieldChangedAt[f] = effectiveFrom;
            }
            applyManagedEffectiveHistories(matchedUser as any, managedIncoming, {
              changedAt: new Date(),
              source: 'basic-master-upload',
              baselineEffectiveFrom: DEFAULT_BASELINE_EFFECTIVE_FROM,
              fieldChangedAt,
              priorValues: priorManaged,
            });
            matchedUser.markModified('fieldHistories');
          }

          await matchedUser.save();
          stats.updated++;
          continue;
        }

        // mode === 'add'
        if (matchedUser) {
          stats.failed++;
          stats.errors.push(`Already exists, skipped add: ${name}${employeeCode ? ` (${employeeCode})` : ''}`);
          continue;
        }

        const cleanName = name.replace(/\s+/g, '.');
        const email = normalizeText(updateData.email) || `${cleanName.toLowerCase().replace(/[^a-z0-9.]/g, '')}@asija.com`;
        const odId = employeeCode || `OD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const newUser = new User({
          odId,
          name: cleanName,
          email,
          attendanceEmail: updateData.attendanceEmail || email,
          joiningDate: updateData.joiningDate || new Date(),
          isActive: true,
          ...updateData,
        });

        const managedIncomingNew: Partial<Record<ManagedEffectiveField, unknown>> = {};
        for (const field of MANAGED_EFFECTIVE_FIELDS) {
          if (Object.prototype.hasOwnProperty.call(updateData, field) && updateData[field as keyof typeof updateData] !== undefined) {
            managedIncomingNew[field] = updateData[field as keyof typeof updateData] as unknown;
          }
        }
        if (Object.keys(managedIncomingNew).length > 0) {
          applyManagedEffectiveHistories(newUser as any, managedIncomingNew, {
            changedAt: effectiveFrom,
            source: 'basic-master-upload',
            baselineEffectiveFrom: effectiveFrom,
          });
          newUser.markModified('fieldHistories');
        }

        await newUser.save();
        try {
          await reconcilePendingAttendanceForUser(String(newUser._id));
        } catch (reconErr) {
          console.error('reconcilePendingAttendanceForUser (basic-master-upload):', reconErr);
        }
        stats.created++;
      } catch (e) {
        stats.failed++;
        stats.errors.push(`Failed row ${normalizeText(emp?.name) || '(unknown)'}: ${(e as Error).message}`);
      }
    }

    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('Basic master upload error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process basic master upload' }, { status: 500 });
  }
}
