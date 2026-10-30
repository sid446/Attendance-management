export interface GpsFix {
  lat: number;
  lng: number;
  accuracyMeters: number | null;
}

export interface ClientPlace {
  _id: string;
  name: string;
  address: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  radiusMeters: number;
}

export interface LocationAttendanceRecord {
  _id: string;
  clientPlaceId: {
    _id: string;
    name: string;
    address: string;
  };
  date: string;
  inPunch?: {
    time: string;
    distanceFromClient: number;
    accuracyMeters?: number;
    isWithinRadius: boolean;
    status: string;
  };
  outPunch?: {
    time: string;
    distanceFromClient: number;
    accuracyMeters?: number;
    isWithinRadius: boolean;
    status: string;
  };
  totalHours?: number;
  status: string;
}

export interface LocationAttendanceSectionProps {
  userId: string;
  /**
   * When true, omit the outer “page card” chrome — parent provides the section frame
   * (e.g. employee Attendance tab “Client location punch” block).
   */
  embedded?: boolean;
}
