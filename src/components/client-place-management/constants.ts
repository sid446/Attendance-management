export const CLIENT_PLACE_WORKFLOW_STEPS = [
  'Add place (lat/long or Maps link)',
  'Assign employees',
  'Deactivate when no longer needed',
] as const;

export const EMPTY_NEW_PLACE = {
  name: '',
  address: '',
  googleMapsLink: '',
  lat: '',
  lng: '',
  radiusMeters: 500,
};
