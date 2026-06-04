/** JSON shape returned after OTP verify / session restore. */
export function employeeAuthUserPayload(user: {
  _id: unknown;
  name?: unknown;
  email?: unknown;
  odId?: unknown;
  team?: unknown;
  workingUnderPartner?: unknown;
}) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    odId: user.odId,
    team: user.team,
    workingUnderPartner: user.workingUnderPartner,
  };
}
