export const SCHEMA_SQL_TEXT = `-- ====================================================================
-- SUPABASE / POSTGRESQL SCHEMA FOR DG KOMPUTER ATTENDANCE SYSTEM
-- ====================================================================
-- This file contains the complete database structure, foreign keys, 
-- constraints, Row Level Security (RLS) configurations, and sample seed data.
-- Paste this script directly into your Supabase SQL Editor (https://supabase.com)
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. EXTENSIONS (Optional but recommended for auto-generating UUIDs)
-- --------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------------------
-- 2. SHIFTS TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shifts (
    id VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL, -- HH:MM format
    end_time TIME NOT NULL     -- HH:MM format
);

-- Enable RLS on shifts
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- 3. EMPLOYEES TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employees (
    id VARCHAR(20) PRIMARY KEY, -- e.g. EMP001
    name VARCHAR(255) NOT NULL,
    role VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    avatar TEXT NOT NULL, -- URL path to image
    phone VARCHAR(20) NOT NULL,
    active_shift_id VARCHAR(10) REFERENCES public.shifts(id) ON DELETE SET NULL,
    nik VARCHAR(20) UNIQUE, -- NIK / ID Card Number (e.g. DG01112008)
    ktp_photo TEXT, -- Base64 or URL
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on employees
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- 4. ATTENDANCE LOGS TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_logs (
    id VARCHAR(50) PRIMARY KEY, -- LOG-{employeeId}-{dateString}
    employee_id VARCHAR(20) NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    employee_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL, -- YYYY-MM-DD
    shift_id VARCHAR(10) NOT NULL REFERENCES public.shifts(id),
    shift_name VARCHAR(100) NOT NULL,
    clock_in TIME NOT NULL, -- HH:MM:SS
    clock_out TIME, -- HH:MM:SS
    break_start TIME, -- HH:MM:SS
    break_end TIME, -- HH:MM:SS
    status VARCHAR(20) NOT NULL CHECK (status IN ('Hadir', 'Terlambat', 'Istirahat', 'Pulang', 'Izin')),
    notes TEXT,
    selfie_url TEXT, -- Base64 data url or path
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    address TEXT,
    working_hours NUMERIC(4, 2), -- hours worked (e.g. 8.20)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index for faster querying by date and employee
CREATE INDEX IF NOT EXISTS idx_attendance_logs_date ON public.attendance_logs(date);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_emp ON public.attendance_logs(employee_id);

-- Enable RLS on attendance_logs
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- 5. LEAVE REQUESTS TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_requests (
    id VARCHAR(50) PRIMARY KEY, -- LV-{id}
    employee_id VARCHAR(20) NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    employee_name VARCHAR(255) NOT NULL,
    type VARCHAR(15) NOT NULL CHECK (type IN ('Sakit', 'Cuti', 'Izin')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(15) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Disetujui', 'Ditolak')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    attachment_url TEXT
);

-- Enable RLS on leave_requests
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- 6. STORE LOCATION TABLE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_location (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    latitude NUMERIC(10, 8) NOT NULL,
    longitude NUMERIC(11, 8) NOT NULL,
    radius INTEGER NOT NULL DEFAULT 50,
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on store_location
ALTER TABLE public.store_location ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
--    Allows full public access for anonymous web clients to insert, update, select, and delete.
-- --------------------------------------------------------------------

-- Shifts policies
DROP POLICY IF EXISTS "Allow public read access to shifts" ON public.shifts;
DROP POLICY IF EXISTS "Allow authenticated modifications to shifts" ON public.shifts;
DROP POLICY IF EXISTS "Allow public access to shifts" ON public.shifts;
CREATE POLICY "Allow public access to shifts" ON public.shifts FOR ALL USING (true) WITH CHECK (true);

-- Employees policies
DROP POLICY IF EXISTS "Allow public read access to employees" ON public.employees;
DROP POLICY IF EXISTS "Allow authenticated modifications to employees" ON public.employees;
DROP POLICY IF EXISTS "Allow public access to employees" ON public.employees;
CREATE POLICY "Allow public access to employees" ON public.employees FOR ALL USING (true) WITH CHECK (true);

-- Attendance Logs policies
DROP POLICY IF EXISTS "Allow public read access to attendance_logs" ON public.attendance_logs;
DROP POLICY IF EXISTS "Allow insert access to attendance_logs" ON public.attendance_logs;
DROP POLICY IF EXISTS "Allow update access to attendance_logs" ON public.attendance_logs;
DROP POLICY IF EXISTS "Allow public access to attendance_logs" ON public.attendance_logs;
CREATE POLICY "Allow public access to attendance_logs" ON public.attendance_logs FOR ALL USING (true) WITH CHECK (true);

-- Leave Requests policies
DROP POLICY IF EXISTS "Allow public read access to leave_requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Allow insert access to leave_requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Allow update access to leave_requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Allow public access to leave_requests" ON public.leave_requests;
CREATE POLICY "Allow public access to leave_requests" ON public.leave_requests FOR ALL USING (true) WITH CHECK (true);

-- Store Location policies
DROP POLICY IF EXISTS "Allow public read access to store_location" ON public.store_location;
DROP POLICY IF EXISTS "Allow insert/update/delete access to store_location" ON public.store_location;
DROP POLICY IF EXISTS "Allow public access to store_location" ON public.store_location;
CREATE POLICY "Allow public access to store_location" ON public.store_location FOR ALL USING (true) WITH CHECK (true);


-- --------------------------------------------------------------------
-- 8. ENABLE REALTIME PUBLICATION safely
-- --------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  
  -- Add tables to the publication safely
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
  EXCEPTION WHEN others THEN
    -- ignore
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_logs;
  EXCEPTION WHEN others THEN
    -- ignore
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;
  EXCEPTION WHEN others THEN
    -- ignore
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store_location;
  EXCEPTION WHEN others THEN
    -- ignore
  END;
END $$;


-- ====================================================================
-- SEED DATA (REPRESENTING ORIGINAL APPLICATION DATA)
-- ====================================================================

-- 1. Insert Shifts
INSERT INTO public.shifts (id, name, start_time, end_time) VALUES
('S1', 'Shift Pagi (08:00 - 17:00)', '08:00:00', '17:00:00'),
('S2', 'Shift Siang (13:00 - 22:00)', '13:00:00', '22:00:00'),
('S3', 'Shift Malam (22:00 - 07:00)', '22:00:00', '07:00:00')
ON CONFLICT (id) DO NOTHING;

-- 2. Insert Employees
INSERT INTO public.employees (id, name, role, department, avatar, phone, active_shift_id, nik) VALUES
('EMP001', 'Noval Dyansyah Perdana', 'Teknisi', 'Teknologi', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&h=150&fit=crop&crop=face', '083862024525', 'S1', 'DG01112008'),
('EMP002', 'Budi Santoso', 'Senior IT Support', 'Teknologi', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face', '081234567890', 'S1', 'DG01112009'),
('EMP003', 'Siti Aminah', 'Finance Officer', 'Keuangan', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face', '081298765432', 'S1', 'DG01112010'),
('EMP004', 'Ahmad Fauzi', 'Sales Specialist', 'Pemasaran', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face', '082155667788', 'S2', 'DG01112011'),
('EMP005', 'Dewi Lestari', 'HR Manager', 'Sumber Daya Manusia', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&h=150&fit=crop&crop=face', '087799001122', 'S1', 'DG01112012')
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Sample Leave Request
INSERT INTO public.leave_requests (id, employee_id, employee_name, type, start_date, end_date, reason, status) VALUES
('LV-001', 'EMP002', 'Budi Santoso', 'Cuti', CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE - INTERVAL '2 days', 'Acara pernikahan keluarga di Yogyakarta', 'Disetujui'),
('LV-002', 'EMP004', 'Ahmad Fauzi', 'Sakit', CURRENT_DATE + INTERVAL '1 day', CURRENT_DATE + INTERVAL '2 days', 'Surat dokter: Istirahat pasca tindakan cabut gigi bungsu', 'Pending')
ON CONFLICT (id) DO NOTHING;

-- 4. Insert Default Store Location
INSERT INTO public.store_location (id, name, address, latitude, longitude, radius, is_closed) VALUES
('default', 'DG KOMPUTER', 'Betung', -6.211774, 106.844226, 50, FALSE)
ON CONFLICT (id) DO NOTHING;


-- ====================================================================
-- 9. FCM TOKENS TABLE (For Push Notifications)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.fcm_tokens (
    id BIGSERIAL PRIMARY KEY,
    employee_id VARCHAR(20) NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(employee_id, token)
);

-- Enable RLS on fcm_tokens
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Allow public access to fcm_tokens
DROP POLICY IF EXISTS "Allow public access to fcm_tokens" ON public.fcm_tokens;
CREATE POLICY "Allow public access to fcm_tokens" ON public.fcm_tokens FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------
-- 10. POSITIONS TABLE (For Custom Roles / Jabatan)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.positions (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on positions
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

-- Allow public access to positions
DROP POLICY IF EXISTS "Allow public access to positions" ON public.positions;
CREATE POLICY "Allow public access to positions" ON public.positions FOR ALL USING (true) WITH CHECK (true);

-- Add to real-time publication safely
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fcm_tokens;
  EXCEPTION WHEN others THEN
    -- ignore
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.positions;
  EXCEPTION WHEN others THEN
    -- ignore
  END;
END $$;

-- Seed default positions
INSERT INTO public.positions (name) VALUES
('Teknisi'),
('Senior IT Support'),
('Finance Officer'),
('Sales Specialist'),
('HR Manager'),
('Keamanan')
ON CONFLICT (name) DO NOTHING;

-- --------------------------------------------------------------------
-- 11. ALARM SETTINGS TABLE (For Global Alarm Synchronization)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alarm_settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
    clock_in_alarm_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    clock_in_time TIME NOT NULL DEFAULT '07:45:00',
    clock_out_alarm_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    clock_out_time TIME NOT NULL DEFAULT '17:00:00',
    browser_notification_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on alarm_settings
ALTER TABLE public.alarm_settings ENABLE ROW LEVEL SECURITY;

-- Allow public access to alarm_settings
DROP POLICY IF EXISTS "Allow public access to alarm_settings" ON public.alarm_settings;
CREATE POLICY "Allow public access to alarm_settings" ON public.alarm_settings FOR ALL USING (true) WITH CHECK (true);

-- Add to real-time publication safely
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.alarm_settings;
  EXCEPTION WHEN others THEN
    -- ignore
  END;
END $$;

-- Seed default alarm settings
INSERT INTO public.alarm_settings (id, clock_in_alarm_enabled, clock_in_time, clock_out_alarm_enabled, clock_out_time, browser_notification_enabled)
VALUES ('default', TRUE, '07:45:00', TRUE, '17:00:00', TRUE)
ON CONFLICT (id) DO NOTHING;
`;
