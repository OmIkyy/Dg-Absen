export interface Shift {
  id: string;
  name: string;
  start: string; // HH:MM
  end: string; // HH:MM
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  department: string;
  avatar: string;
  phone: string;
  activeShiftId: string;
  nik?: string; // NIK / ID Card Number (e.g. DG01112008)
  ktpPhoto?: string; // Base64 or URL of KTP/ID photo
}

export interface StoreLocation {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radius: number; // in meters, default 100
  isClosed?: boolean; // System state to close/open attendance
}

export type AttendanceStatus = 'Hadir' | 'Terlambat' | 'Istirahat' | 'Pulang' | 'Izin';

export interface AttendanceLog {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  shiftId: string;
  shiftName: string;
  clockIn: string; // HH:MM:SS
  clockOut?: string; // HH:MM:SS
  breakStart?: string; // HH:MM:SS
  breakEnd?: string; // HH:MM:SS
  status: AttendanceStatus;
  notes?: string;
  selfieUrl?: string; // Base64 data url or fallback url
  latitude?: number;
  longitude?: number;
  address?: string;
  workingHours?: number; // Hours worked
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: 'Sakit' | 'Cuti' | 'Izin';
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  reason: string;
  status: 'Pending' | 'Disetujui' | 'Ditolak';
  createdAt: string; // YYYY-MM-DD
  attachmentUrl?: string;
}

// Predefined Shifts
export const SHIFTS: Shift[] = [
  { id: 'S1', name: 'Shift Pagi (08:00 - 17:00)', start: '08:00', end: '17:00' },
  { id: 'S2', name: 'Shift Siang (13:00 - 22:00)', start: '13:00', end: '22:00' },
  { id: 'S3', name: 'Shift Malam (22:00 - 07:00)', start: '22:00', end: '07:00' }
];

// Default Store Location
export const DEFAULT_STORE_LOCATION: StoreLocation = {
  name: 'DG KOMPUTER',
  address: 'Betung',
  latitude: -6.211774,
  longitude: 106.844226,
  radius: 50, // 50 meters
  isClosed: false
};

// Realistic Sample Employees with Indonesian profile details
export const SAMPLE_EMPLOYEES: Employee[] = [];

// Realistic Pre-populated logs for the past 5 days
export const generateSampleLogs = (): AttendanceLog[] => {
  const logs: AttendanceLog[] = [];
  const employees = SAMPLE_EMPLOYEES;
  const today = new Date();
  
  // Create history for past 4 days
  for (let i = 4; i >= 1; i--) {
    const logDate = new Date();
    logDate.setDate(today.getDate() - i);
    const dateString = logDate.toISOString().split('T')[0];
    
    employees.forEach((emp) => {
      // Randomly skip Budi one day for leave simulation
      if (emp.id === 'EMP002' && i === 2) {
        return; // Budi was on leave
      }

      // Generate clock in details based on shift
      const shift = SHIFTS.find(s => s.id === emp.activeShiftId) || SHIFTS[0];
      const [shiftHour, shiftMin] = shift.start.split(':').map(Number);
      
      // Add random variation to check-in time (-15 to +20 minutes)
      const rMin = Math.floor(Math.random() * 35) - 15;
      const checkInHour = shiftHour + (rMin > 30 ? 1 : 0);
      const checkInMin = (shiftMin + rMin + 60) % 60;
      
      const clockInTime = `${String(checkInHour).padStart(2, '0')}:${String(checkInMin).padStart(2, '0')}:12`;
      const isLate = (checkInHour > shiftHour) || (checkInHour === shiftHour && checkInMin > shiftMin);
      
      // Randomize break and clock out
      const breakStart = '12:05:00';
      const breakEnd = '12:55:00';
      const clockOutHour = shiftHour + 9; // ~9 hours total including break
      const clockOutMin = Math.floor(Math.random() * 20);
      const clockOutTime = `${String(clockOutHour).padStart(2, '0')}:${String(clockOutMin).padStart(2, '0')}:45`;

      logs.push({
        id: `LOG-${emp.id}-${dateString}`,
        employeeId: emp.id,
        employeeName: emp.name,
        date: dateString,
        shiftId: shift.id,
        shiftName: shift.name,
        clockIn: clockInTime,
        clockOut: clockOutTime,
        breakStart,
        breakEnd,
        status: 'Hadir',
        notes: 'Datang tepat waktu',
        latitude: -6.211774 + (Math.random() * 0.0004 - 0.0002), // stays close to shop
        longitude: 106.844226 + (Math.random() * 0.0004 - 0.0002),
        address: 'Menara BCA Lt. 42, Grand Indonesia, Jakarta Pusat',
        selfieUrl: `https://images.unsplash.com/photo-${emp.id === 'EMP001' ? '1539571696357-5a69c17a67c6' : emp.id === 'EMP002' ? '1544005313-94ddf0286df2' : '1506794778202-cad84cf45f1d'}?w=100&h=100&fit=crop&crop=face`,
        workingHours: 8.2
      });
    });
  }

  // Generate some logs for today too (just clock-ins so some are active!)
  const todayString = today.toISOString().split('T')[0];
  
  // EMP001 clocked in early today
  logs.push({
    id: `LOG-EMP001-${todayString}`,
    employeeId: 'EMP001',
    employeeName: 'Noval Dyansyah Perdana',
    date: todayString,
    shiftId: 'S1',
    shiftName: 'Shift Pagi (08:00 - 17:00)',
    clockIn: '07:54:12',
    status: 'Hadir',
    latitude: -6.211774,
    longitude: 106.844226,
    address: 'Menara BCA, Jl. M.H. Thamrin No.1, Menteng, Jakarta Pusat',
    selfieUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&h=100&fit=crop&crop=face'
  });

  // EMP002 (Budi) clocked in today
  logs.push({
    id: `LOG-EMP002-${todayString}`,
    employeeId: 'EMP002',
    employeeName: 'Budi Santoso',
    date: todayString,
    shiftId: 'S1',
    shiftName: 'Shift Pagi (08:00 - 17:00)',
    clockIn: '08:14:32',
    status: 'Hadir',
    notes: 'Datang tepat waktu',
    latitude: -6.2118,
    longitude: 106.8443,
    address: 'Menara BCA, Jl. M.H. Thamrin No.1, Menteng, Jakarta Pusat',
    selfieUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face'
  });

  // EMP004 is currently on break
  logs.push({
    id: `LOG-EMP004-${todayString}`,
    employeeId: 'EMP004',
    employeeName: 'Ahmad Fauzi',
    date: todayString,
    shiftId: 'S2',
    shiftName: 'Shift Siang (13:00 - 22:00)',
    clockIn: '12:48:20',
    status: 'Hadir',
    latitude: -6.2117,
    longitude: 106.8442,
    address: 'Menara BCA, Jl. M.H. Thamrin No.1, Menteng, Jakarta Pusat',
    selfieUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face'
  });

  return logs;
};

// Past Leave Requests
export const SAMPLE_LEAVES: LeaveRequest[] = [];

export interface AdminNotification {
  id: string;
  employeeName: string;
  type: 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
  time: string;
  date: string;
  timestamp: number;
  read: boolean;
}




