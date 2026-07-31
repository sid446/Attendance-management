/** JSON shape returned after OTP verify / session restore. */
export function employeeAuthUserPayload(user: {
  _id: unknown;
  name?: unknown;
  email?: unknown;
  odId?: unknown;
  team?: unknown;
  workingUnderPartner?: unknown;
  employmentType?: unknown;
  schedules?: unknown;
  seasonalSchedules?: unknown;
  scheduleInOutTime?: unknown;
  scheduleInOutTimeSat?: unknown;
  scheduleInOutTimeMonth?: unknown;
}) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    odId: user.odId,
    team: user.team,
    workingUnderPartner: user.workingUnderPartner,
    employmentType: user.employmentType,
    // Needed so WFH / outstation / client-place hour requests use that day's schedule
    schedules: user.schedules,
    seasonalSchedules: user.seasonalSchedules,
    scheduleInOutTime: user.scheduleInOutTime,
    scheduleInOutTimeSat: user.scheduleInOutTimeSat,
    scheduleInOutTimeMonth: user.scheduleInOutTimeMonth,
  };
}
