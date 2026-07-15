import { createClient } from '@supabase/supabase-js';
import { Employee, AttendanceLog, LeaveRequest, StoreLocation } from '../types';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

// Initialize client if credentials are provided
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

// Helper to check if supabase is active and connected
export const isSupabaseConfigured = (): boolean => {
  return !!supabase;
};

/* ==========================================
   1. EMPLOYEES SERVICES
   ========================================== */
export async function getSupabaseEmployees(): Promise<Employee[] | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('id', { ascending: true });
    
    if (error) throw error;
    
    return (data || []).map(emp => ({
      id: emp.id,
      name: emp.name,
      role: emp.role,
      department: emp.department,
      avatar: emp.avatar || '',
      phone: emp.phone || '',
      activeShiftId: emp.active_shift_id || 'S1',
      nik: emp.nik || '',
      ktpPhoto: emp.ktp_photo || ''
    }));
  } catch (err) {
    console.log('Database note - employees table might not exist yet:', err);
    return null;
  }
}

export async function upsertSupabaseEmployee(employee: Employee): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('employees')
      .upsert({
        id: employee.id,
        name: employee.name,
        role: employee.role,
        department: employee.department,
        avatar: employee.avatar || null,
        phone: employee.phone || null,
        active_shift_id: employee.activeShiftId,
        nik: employee.nik || null,
        ktp_photo: employee.ktpPhoto || null
      });

    if (error) throw error;
    return true;
  } catch (err) {
    console.log('Database note - could not upsert employee:', err);
    return false;
  }
}

export async function deleteSupabaseEmployee(employeeId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', employeeId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.log('Database note - could not delete employee:', err);
    return false;
  }
}

export async function clearAllSupabaseEmployees(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('employees')
      .delete()
      .neq('id', 'dummy_id_never_matching');

    if (error) throw error;
    return true;
  } catch (err) {
    console.log('Database note - could not clear employees:', err);
    return false;
  }
}


/* ==========================================
   2. ATTENDANCE LOGS SERVICES
   ========================================== */

const sanitizeTimeForPostgres = (timeStr: string | null | undefined, defaultValue: string | null = null): string | null => {
  if (!timeStr || timeStr === '--:--:--' || timeStr.includes('-')) {
    return defaultValue;
  }
  // Ganti titik dengan titik dua agar kompatibel dengan tipe data TIME PostgreSQL (misal "08.30.15" -> "08:30:15")
  return timeStr.replace(/\./g, ':');
};

export async function getSupabaseLogs(): Promise<AttendanceLog[] | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('*')
      .order('date', { ascending: false })
      .order('clock_in', { ascending: false });

    if (error) throw error;

    return (data || []).map(log => ({
      id: log.id,
      employeeId: log.employee_id,
      employeeName: log.employee_name,
      date: log.date,
      shiftId: log.shift_id,
      shiftName: log.shift_name,
      clockIn: log.clock_in === '00:00:00' ? '--:--:--' : log.clock_in,
      clockOut: log.clock_out || '--:--:--',
      breakStart: log.break_start || undefined,
      breakEnd: log.break_end || undefined,
      status: log.status,
      notes: log.notes || undefined,
      selfieUrl: log.selfie_url || undefined,
      latitude: log.latitude ? parseFloat(log.latitude) : undefined,
      longitude: log.longitude ? parseFloat(log.longitude) : undefined,
      address: log.address || undefined,
      workingHours: log.working_hours ? parseFloat(log.working_hours) : undefined
    }));
  } catch (err) {
    console.log('Database note - logs table might not exist yet:', err);
    return null;
  }
}

export async function upsertSupabaseLog(log: AttendanceLog): Promise<boolean> {
  if (!supabase) return false;
  try {
    // 1. Pastikan shift (S1) terdaftar di database untuk menghindari kegagalan Foreign Key
    try {
      const { data: shiftCheck } = await supabase.from('shifts').select('id').eq('id', log.shiftId).maybeSingle();
      if (!shiftCheck) {
        await supabase.from('shifts').upsert([
          { id: 'S1', name: 'Shift Pagi (08:00 - 17:00)', start_time: '08:00:00', end_time: '17:00:00' },
          { id: 'S2', name: 'Shift Siang (13:00 - 22:00)', start_time: '13:00:00', end_time: '22:00:00' },
          { id: 'S3', name: 'Shift Malam (22:00 - 07:00)', start_time: '22:00:00', end_time: '07:00:00' }
        ]);
      }
    } catch (err) {
      console.log('Failed to check/seed shifts:', err);
    }

    // 2. Pastikan karyawan terdaftar di database untuk menghindari kegagalan Foreign Key (employee_id REFERENCES employees)
    try {
      const { data: empCheck } = await supabase.from('employees').select('id').eq('id', log.employeeId).maybeSingle();
      if (!empCheck) {
        console.log(`Aborting log insert: Employee ${log.employeeId} does not exist (possibly deleted).`);
        return false;
      }
    } catch (err) {
      console.log('Failed to check employee for log:', err);
      return false;
    }

    // 3. Sanitasi format waktu agar cocok dengan tipe data TIME di PostgreSQL (HH:MM:SS)
    const dbClockIn = sanitizeTimeForPostgres(log.clockIn, '00:00:00');
    const dbClockOut = sanitizeTimeForPostgres(log.clockOut, null);
    const dbBreakStart = sanitizeTimeForPostgres(log.breakStart, null);
    const dbBreakEnd = sanitizeTimeForPostgres(log.breakEnd, null);

    const { error } = await supabase
      .from('attendance_logs')
      .upsert({
        id: log.id,
        employee_id: log.employeeId,
        employee_name: log.employeeName,
        date: log.date,
        shift_id: log.shiftId,
        shift_name: log.shiftName,
        clock_in: dbClockIn,
        clock_out: dbClockOut,
        break_start: dbBreakStart,
        break_end: dbBreakEnd,
        status: log.status,
        notes: log.notes || null,
        selfie_url: log.selfieUrl || null,
        latitude: log.latitude || null,
        longitude: log.longitude || null,
        address: log.address || null,
        working_hours: log.workingHours || null
      });

    if (error) throw error;
    return true;
  } catch (err) {
    console.log('Database note - could not upsert log:', err);
    return false;
  }
}

export async function deleteSupabaseLog(logId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('attendance_logs')
      .delete()
      .eq('id', logId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.log('Database note - could not delete log:', err);
    return false;
  }
}

export async function clearAllSupabaseLogs(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('attendance_logs')
      .delete()
      .neq('id', 'dummy_id_never_matching');

    if (error) throw error;
    return true;
  } catch (err) {
    console.log('Database note - could not clear logs:', err);
    return false;
  }
}


/* ==========================================
   3. LEAVE REQUESTS SERVICES
   ========================================== */
export async function getSupabaseLeaves(): Promise<LeaveRequest[] | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('leave_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(lv => ({
      id: lv.id,
      employeeId: lv.employee_id,
      employeeName: lv.employee_name,
      type: lv.type,
      startDate: lv.start_date,
      endDate: lv.end_date,
      reason: lv.reason,
      status: lv.status,
      createdAt: lv.created_at,
      attachmentUrl: lv.attachment_url || undefined
    }));
  } catch (err) {
    console.log('Database note - leave_requests table might not exist yet:', err);
    return null;
  }
}

export async function upsertSupabaseLeave(leave: LeaveRequest): Promise<boolean> {
  if (!supabase) return false;
  try {
    // Pastikan karyawan terdaftar di database untuk menghindari kegagalan Foreign Key (employee_id REFERENCES employees)
    try {
      const { data: empCheck } = await supabase.from('employees').select('id').eq('id', leave.employeeId).maybeSingle();
      if (!empCheck) {
        console.log(`Aborting leave insert: Employee ${leave.employeeId} does not exist (possibly deleted).`);
        return false;
      }
    } catch (err) {
      console.log('Failed to check employee for leave:', err);
      return false;
    }

    const { error } = await supabase
      .from('leave_requests')
      .upsert({
        id: leave.id,
        employee_id: leave.employeeId,
        employee_name: leave.employeeName,
        type: leave.type,
        start_date: leave.startDate,
        end_date: leave.endDate,
        reason: leave.reason,
        status: leave.status,
        created_at: leave.createdAt,
        attachment_url: leave.attachmentUrl || null
      });

    if (error) throw error;
    return true;
  } catch (err) {
    console.log('Database note - could not upsert leave:', err);
    return false;
  }
}

export async function clearAllSupabaseLeaves(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('leave_requests')
      .delete()
      .neq('id', 'dummy_id_never_matching');

    if (error) throw error;
    return true;
  } catch (err) {
    console.log('Database note - could not clear leave requests:', err);
    return false;
  }
}


/* ==========================================
   4. STORE LOCATION SERVICES
   ========================================== */
export async function getSupabaseStoreLocation(): Promise<StoreLocation | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('store_location')
      .select('*')
      .eq('id', 'default')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No row found, let's create it
        return null;
      }
      throw error;
    }

    return {
      name: data.name,
      address: data.address,
      latitude: data.latitude,
      longitude: data.longitude,
      radius: data.radius,
      isClosed: data.is_closed || false
    };
  } catch (err) {
    console.log('Database note - store_location table might not exist yet:', err);
    return null;
  }
}

export async function updateSupabaseStoreLocation(location: StoreLocation): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('store_location')
      .upsert({
        id: 'default',
        name: location.name,
        address: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
        radius: location.radius,
        is_closed: location.isClosed || false
      });

    if (error) throw error;
    return true;
  } catch (err) {
    console.log('Database note - could not update store location:', err);
    return false;
  }
}


/* ==========================================
   5. FCM TOKENS SERVICES
   ========================================== */
export async function saveSupabaseFcmToken(employeeId: string, token: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('fcm_tokens')
      .upsert({
        employee_id: employeeId,
        token: token,
        updated_at: new Date().toISOString()
      }, { onConflict: 'employee_id,token' });

    if (error) throw error;
    return true;
  } catch (err) {
    console.log('Database note - could not save FCM token:', err);
    // Save to local storage as fallback
    localStorage.setItem(`fcm_token_${employeeId}`, token);
    return false;
  }
}

export async function getSupabaseFcmTokens(employeeId?: string): Promise<string[]> {
  if (!supabase) {
    if (employeeId) {
      const stored = localStorage.getItem(`fcm_token_${employeeId}`);
      return stored ? [stored] : [];
    }
    // Retrieve all stored tokens from local storage keys starting with fcm_token_
    const tokens: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('fcm_token_')) {
        const val = localStorage.getItem(key);
        if (val) tokens.push(val);
      }
    }
    return tokens;
  }
  try {
    let query = supabase.from('fcm_tokens').select('token');
    if (employeeId) {
      query = query.eq('employee_id', employeeId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(row => row.token);
  } catch (err) {
    console.log('Database note - could not retrieve FCM tokens:', err);
    if (employeeId) {
      const stored = localStorage.getItem(`fcm_token_${employeeId}`);
      return stored ? [stored] : [];
    }
    return [];
  }
}

export async function deleteSupabaseFcmToken(token: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('fcm_tokens')
      .delete()
      .eq('token', token);

    if (error) throw error;
    return true;
  } catch (err) {
    console.log('Database note - could not delete FCM token:', err);
    return false;
  }
}

export async function getSupabasePositions(): Promise<string[] | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('positions')
      .select('name')
      .order('name', { ascending: true });

    if (error) throw error;
    return (data || []).map(row => row.name);
  } catch (err) {
    console.log('Database note - positions table might not exist yet:', err);
    return null;
  }
}

export async function addSupabasePosition(name: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('positions')
      .insert({ name });

    if (error) throw error;
    return true;
  } catch (err) {
    console.log('Database note - could not add position:', err);
    return false;
  }
}

export async function deleteSupabasePosition(name: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('positions')
      .delete()
      .eq('name', name);

    if (error) throw error;
    return true;
  } catch (err) {
    console.log('Database note - could not delete position:', err);
    return false;
  }
}

export interface DbAlarmSettings {
  clockInAlarmEnabled: boolean;
  clockInTime: string;
  clockOutAlarmEnabled: boolean;
  clockOutTime: string;
  browserNotificationEnabled: boolean;
}

export async function getSupabaseAlarmSettings(): Promise<DbAlarmSettings | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('alarm_settings')
      .select('*')
      .eq('id', 'default')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return {
      clockInAlarmEnabled: data.clock_in_alarm_enabled,
      clockInTime: data.clock_in_time ? data.clock_in_time.substring(0, 5) : '07:45',
      clockOutAlarmEnabled: data.clock_out_alarm_enabled,
      clockOutTime: data.clock_out_time ? data.clock_out_time.substring(0, 5) : '17:00',
      browserNotificationEnabled: data.browser_notification_enabled
    };
  } catch (err) {
    console.log('Database note - alarm_settings table might not exist yet:', err);
    return null;
  }
}

export async function updateSupabaseAlarmSettings(settings: DbAlarmSettings): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('alarm_settings')
      .upsert({
        id: 'default',
        clock_in_alarm_enabled: settings.clockInAlarmEnabled,
        clock_in_time: settings.clockInTime,
        clock_out_alarm_enabled: settings.clockOutAlarmEnabled,
        clock_out_time: settings.clockOutTime,
        browser_notification_enabled: settings.browserNotificationEnabled,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
    return true;
  } catch (err) {
    console.log('Database note - could not update alarm settings:', err);
    return false;
  }
}


