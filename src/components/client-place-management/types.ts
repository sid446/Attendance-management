export interface ClientPlace {
  _id: string;
  name: string;
  address: string;
  googleMapsLink?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  radiusMeters: number;
  assignedEmployees: Array<{
    _id: string;
    name: string;
    email: string;
    employeeCode?: string;
  }>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  employeeCode?: string;
  workingUnderPartner?: string;
  isActive?: boolean;
}

export interface ClientPlaceManagementProps {
  allUsers?: User[];
}

export type LocationInputMode = 'coordinates' | 'mapsLink';
