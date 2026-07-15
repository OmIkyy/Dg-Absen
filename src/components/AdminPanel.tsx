import React, { useState, useEffect } from 'react';
import { Employee, Shift, AttendanceLog, LeaveRequest, SHIFTS, StoreLocation, AdminNotification } from '../types';
import { 
  Users, CheckCircle2, AlertCircle, Clock, FilePlus, Download, 
  Search, Filter, Check, X, MapPin, Eye, Plus, Trash2, Calendar, Settings, FileSpreadsheet, MapIcon, Compass, Database,
  Menu, User, Tag, Phone, AlertTriangle, ImageIcon, Bell, FileText, UserX, Send
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
// @ts-ignore
import defaultLogo from '../assets/logo.png';
import QRCode from 'qrcode';
import { toJpeg } from 'html-to-image';
import { supabase, updateSupabaseAlarmSettings } from '../utils/supabaseClient';
import { SCHEMA_SQL_TEXT } from '../supabase/schema_sql_text';
import { EmployeeLocationMap } from './EmployeeLocationMap';

const getLocalDateString = (d: Date = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface AdminPanelProps {
  employees: Employee[];
  logs: AttendanceLog[];
  leaveRequests: LeaveRequest[];
  onAddEmployee: (emp: Employee) => void;
  onDeleteEmployee: (id: string) => void;
  onUpdateEmployee?: (emp: Employee) => void;
  onApproveLeave: (id: string) => void;
  onRejectLeave: (id: string) => void;
  onDeleteLog: (id: string) => void;
  storeLocation: StoreLocation;
  onUpdateStoreLocation: (loc: StoreLocation) => void;
  systemLogo?: string;
  onUpdateLogo?: (logoUrl: string) => void;
  onClearAllLogs?: () => void;
  onClearAllEmployees?: () => void;
  onClearAllLeaves?: () => void;
  isAbsensiClosed?: boolean;
  onToggleAbsensiClosed?: (val: boolean) => void;
  notifications?: AdminNotification[];
  onUpdateNotifications?: (updated: AdminNotification[]) => void;
  supabaseStatus?: 'unconfigured' | 'connecting' | 'connected' | 'error';
  onLogout?: () => void;
  customRoles?: string[];
  onAddPosition?: (name: string) => Promise<boolean>;
  onDeletePosition?: (name: string) => Promise<boolean>;
}

export default function AdminPanel({
  employees,
  logs,
  leaveRequests,
  onAddEmployee,
  onDeleteEmployee,
  onUpdateEmployee,
  onApproveLeave,
  onRejectLeave,
  onDeleteLog,
  storeLocation,
  onUpdateStoreLocation,
  systemLogo = '',
  onUpdateLogo,
  onClearAllLogs,
  onClearAllEmployees,
  onClearAllLeaves,
  isAbsensiClosed = false,
  onToggleAbsensiClosed,
  notifications = [],
  onUpdateNotifications,
  supabaseStatus = 'unconfigured',
  onLogout,
  customRoles = ['Teknisi', 'Senior IT Support', 'Finance Officer', 'Sales Specialist', 'HR Manager', 'Keamanan'],
  onAddPosition,
  onDeletePosition
}: AdminPanelProps) {
  // Filters & Search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [shiftFilter, setShiftFilter] = useState<string>('All');
  const [dateFilter, setDateFilter] = useState<string>('');
  
  // Modals / UI Views
  const [activeTab, setActiveTab] = useState<'logs' | 'recap' | 'leaves' | 'employees' | 'settings' | 'notifications' | 'company_info'>('logs');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [selectedSelfie, setSelectedSelfie] = useState<string | null>(null);
  const [selectedMapLog, setSelectedMapLog] = useState<AttendanceLog | null>(null);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [selectedIdCardEmp, setSelectedIdCardEmp] = useState<Employee | null>(null);
  const [isCardDownloading, setIsCardDownloading] = useState<boolean>(false);
  
  // New Employee Form States
  const [newEmpName, setNewEmpName] = useState<string>('');
  const [newEmpRole, setNewEmpRole] = useState<string>('');
  const [isNewEmpRoleManual, setIsNewEmpRoleManual] = useState<boolean>(false);
  const [newEmpDept, setNewEmpDept] = useState<string>('DG Komputer Palembang-Betung');
  const [newEmpPhone, setNewEmpPhone] = useState<string>('');
  const [newEmpShift, setNewEmpShift] = useState<string>('S1');
  const [newEmpAvatar, setNewEmpAvatar] = useState<string>('');
  const [newEmpNik, setNewEmpNik] = useState<string>('');

  // Authentication states
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('admin_logged_in') === 'true';
  });
  const [adminUsernameInput, setAdminUsernameInput] = useState<string>('');
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>('');
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);

  // Admin Credential Editing states
  const [newAdminUsername, setNewAdminUsername] = useState<string>('');
  const [newAdminPassword, setNewAdminPassword] = useState<string>('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState<string>('');
  const [credentialSuccessMsg, setCredentialSuccessMsg] = useState<string | null>(null);
  const [credentialErrorMsg, setCredentialErrorMsg] = useState<string | null>(null);

  // New Store Location Form States
  const [editStoreName, setEditStoreName] = useState<string>(storeLocation.name);
  const [editStoreAddress, setEditStoreAddress] = useState<string>(storeLocation.address);
  const [editStoreLat, setEditStoreLat] = useState<number>(storeLocation.latitude);
  const [editStoreLng, setEditStoreLng] = useState<number>(storeLocation.longitude);
  const [editStoreCoords, setEditStoreCoords] = useState<string>(`${storeLocation.latitude}, ${storeLocation.longitude}`);
  const [editStoreRadius, setEditStoreRadius] = useState<number>(storeLocation.radius);
  const [isUpdatingStore, setIsUpdatingStore] = useState<boolean>(false);
  const [linkCopied, setLinkCopied] = useState<boolean>(false);

  // Notifications states & handlers
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState<boolean>(false);
  const [hasAnnouncedOnMount, setHasAnnouncedOnMount] = useState<boolean>(false);
  const [dismissedWelcomeBanner, setDismissedWelcomeBanner] = useState<boolean>(false);

  const handleMarkAllAsRead = () => {
    if (onUpdateNotifications) {
      const updated = notifications.map(n => ({ ...n, read: true }));
      onUpdateNotifications(updated);
    }
  };

  const handleClearAllNotifications = () => {
    if (onUpdateNotifications) {
      onUpdateNotifications([]);
    }
  };

  const handleMarkSingleAsRead = (id: string) => {
    if (onUpdateNotifications) {
      const updated = notifications.map(n => n.id === id ? { ...n, read: true } : n);
      onUpdateNotifications(updated);
    }
  };

  const handleDeleteSingleNotification = (id: string) => {
    if (onUpdateNotifications) {
      const updated = notifications.filter(n => n.id !== id);
      onUpdateNotifications(updated);
    }
  };



  // Welcome voice announcement removed on user request to avoid repetitive greetings

  const lastSyncedLocationRef = React.useRef<string>('');

  React.useEffect(() => {
    const locKey = `${storeLocation.name}|${storeLocation.address}|${storeLocation.latitude}|${storeLocation.longitude}|${storeLocation.radius}`;
    if (lastSyncedLocationRef.current !== locKey) {
      setEditStoreName(storeLocation.name);
      setEditStoreAddress(storeLocation.address);
      setEditStoreLat(storeLocation.latitude);
      setEditStoreLng(storeLocation.longitude);
      setEditStoreCoords(`${storeLocation.latitude}, ${storeLocation.longitude}`);
      setEditStoreRadius(storeLocation.radius);
      lastSyncedLocationRef.current = locKey;
    }
  }, [storeLocation]);

  // Recap Filter states
  const currentYear = new Date().getFullYear();
  const [recapMonth, setRecapMonth] = useState<number>(new Date().getMonth() + 1); // 1-12
  const [recapYear, setRecapYear] = useState<number>(currentYear);

  // Helper function to trigger indonesian voice announcement on verification complete
  const speakIndonesianPayment = (text: string) => {
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'id-ID';
        utterance.rate = 0.95;
        const voices = window.speechSynthesis.getVoices();
        const idVoice = voices.find(v => v.lang.toLowerCase().includes('id') || v.lang.toLowerCase().includes('indonesia'));
        if (idVoice) utterance.voice = idVoice;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.error("Speech error", e);
      }
    }
  };

  // Stats Calculations (Today)
  const todayStr = getLocalDateString();
  const todayLogs = logs.filter(l => l.date === todayStr);
  
  const totalEmployeesCount = employees.length;
  const presentTodayCount = todayLogs.filter(l => l.status === 'Hadir' || l.status === 'Terlambat' || l.status === 'Pulang' || l.status === 'Izin').length;
  const notPresentTodayCount = Math.max(0, totalEmployeesCount - presentTodayCount);
  const pendingLeavesCount = leaveRequests.filter(r => r.status === 'Pending').length;

  // Filter logs for list
  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          log.employeeId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || log.status === statusFilter;
    const matchesShift = shiftFilter === 'All' || log.shiftId === shiftFilter;
    const matchesDate = !dateFilter || log.date === dateFilter;

    return matchesSearch && matchesStatus && matchesShift && matchesDate;
  }).sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return b.clockIn.localeCompare(a.clockIn);
  });

  // Chart Data: Attendance logs over the last 5 days
  const last5Days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (4 - i));
    return getLocalDateString(d);
  });

  const chartData = last5Days.map(dateStr => {
    const dayLogs = logs.filter(l => l.date === dateStr);
    const present = dayLogs.filter(l => l.status === 'Hadir' || l.status === 'Pulang' || l.status === 'Terlambat' || l.status === 'Izin').length;
    const absent = Math.max(0, totalEmployeesCount - present);
    
    const dateObj = new Date(dateStr);
    const label = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    
    return {
      name: label,
      'Sudah Absen': present,
      'Belum Absen': absent
    };
  });

  // Helper function to calculate working days (Monday-Friday) in selected month & year
  const getExpectedWorkingDays = (month: number, year: number) => {
    const today = new Date();
    const isCurrentMonth = today.getMonth() + 1 === month && today.getFullYear() === year;
    const endDay = isCurrentMonth ? today.getDate() : new Date(year, month, 0).getDate();
    
    let count = 0;
    for (let d = 1; d <= endDay; d++) {
      const dayOfWeek = new Date(year, month - 1, d).getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Exclude Sunday (0) and Saturday (6)
        count++;
      }
    }
    return count || 22; // default fallback
  };

  // Monthly/Daily Recap Calculator
  const getEmployeeRecap = () => {
    const expectedDays = getExpectedWorkingDays(recapMonth, recapYear);
    return employees.map(emp => {
      // Filter logs for this employee in the selected month & year
      const empLogs = logs.filter(log => {
        if (log.employeeId !== emp.id) return false;
        const logDate = new Date(log.date);
        return (logDate.getMonth() + 1) === recapMonth && logDate.getFullYear() === recapYear;
      });

      const onTimeCount = empLogs.filter(l => l.status === 'Hadir' || l.status === 'Pulang').length;
      const lateCount = empLogs.filter(l => l.status === 'Terlambat').length;
      const masukCount = onTimeCount + lateCount;
      const leavesCount = empLogs.filter(l => l.status === 'Izin').length;
      const alphaCount = Math.max(0, expectedDays - (masukCount + leavesCount));

      return {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        department: emp.department,
        totalWorkingDays: expectedDays,
        masukCount,
        leavesCount,
        alphaCount
      };
    });
  };

  const recapData = getEmployeeRecap();

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['ID Karyawan', 'Nama', 'Tanggal', 'Shift', 'Clock In', 'Clock Out', 'Break Start', 'Break End', 'Status', 'Durasi Kerja (Jam)', 'Alamat GPS', 'Catatan'];
    
    const rows = filteredLogs.map(log => [
      log.employeeId,
      log.employeeName,
      log.date,
      log.shiftName,
      log.clockIn,
      log.clockOut || '-',
      log.breakStart || '-',
      log.breakEnd || '-',
      log.status,
      log.workingHours || '0',
      log.address || '-',
      log.notes || '-'
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(r => r.map(val => `"${val.toString().replace(/"/g, '""')}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Laporan_Absensi_Karyawan_${getLocalDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };  // Export Monthly Combined Summary and Details to Excel (.xls) with full formatting, fonts, and colors
  const handleExportCombinedExcel = () => {
    const indonesianMonths = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    const monthName = indonesianMonths[recapMonth - 1] || recapMonth.toString();
    const storeName = storeLocation.name || "DG KOMPUTER";

    // 1. Get Summary Data
    const summaryRows = recapData;

    // 2. Get Detailed Logs Data
    const monthlyLogs = logs.filter(log => {
      if (!log.date) return false;
      const logDate = new Date(log.date);
      return (logDate.getMonth() + 1) === recapMonth && logDate.getFullYear() === recapYear;
    });

    // Sort logs by date (ascending) and then employeeName
    monthlyLogs.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return a.employeeName.localeCompare(b.employeeName);
    });

    // Generate Beautiful HTML content for XLS with 13 columns total
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>Rekap Absensi Lengkap</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #ffffff; }
    table { border-collapse: collapse; margin-bottom: 25px; width: 100%; }
    th { font-family: 'Segoe UI', -apple-system, sans-serif; font-size: 10pt; font-weight: bold; background-color: #1e1b4b; color: #ffffff; text-align: center; border: 1px solid #cbd5e1; padding: 12px 10px; white-space: nowrap; }
    td { font-family: 'Segoe UI', -apple-system, sans-serif; font-size: 9.5pt; border: 1px solid #cbd5e1; padding: 10px 8px; }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .text-right { text-align: right; }
    .font-bold { font-weight: bold; }
    .nowrap { white-space: nowrap; }
  </style>
</head>
<body style="margin:20px;">
  <!-- LAPORAN HEADER BANNER -->
  <table style="border:none; margin-bottom: 25px;">
    <tr>
      <td colspan="13" style="font-size: 18pt; font-weight: bold; color: #1e1b4b; text-align: center; border:none; padding-bottom: 5px; font-family: 'Segoe UI', sans-serif;">
        LAPORAN REKAPITULASI ABSENSI BULANAN
      </td>
    </tr>
    <tr>
      <td colspan="13" style="font-size: 11pt; font-weight: bold; color: #4f46e5; text-align: center; border:none; padding-bottom: 20px; font-family: 'Segoe UI', sans-serif;">
        Periode: ${monthName.toUpperCase()} ${recapYear} | Lokasi Kantor: ${storeName.toUpperCase()}
      </td>
    </tr>
  </table>

  <!-- BAGIAN 1: RINGKASAN PERFORMA KARYAWAN -->
  <table style="border:none; margin-bottom:10px;">
    <tr>
      <td colspan="13" style="font-size: 13pt; font-weight: bold; color: #1e1b4b; border: none; padding-top: 10px; padding-bottom: 10px; font-family: 'Segoe UI', sans-serif;">
        📊 BAGIAN 1: RINGKASAN KINERJA KARYAWAN (SUMMARY)
      </td>
    </tr>
  </table>

  <table border="1" style="border-collapse: collapse; border: 1px solid #cbd5e1; margin-bottom: 35px;">
    <colgroup>
      <col width="50" />
      <col width="100" />
      <col width="110" />
      <col width="180" />
      <col width="140" />
      <col width="120" />
      <col width="120" />
      <col width="130" />
      <col width="130" />
      <col width="120" />
      <col width="120" />
      <col width="150" />
      <col width="150" />
    </colgroup>
    <thead>
      <tr>
        <th style="width: 50px;">NO</th>
        <th colspan="2" style="width: 210px;">ID KARYAWAN</th>
        <th style="width: 180px; text-align: left;">NAMA KARYAWAN</th>
        <th style="width: 140px; text-align: left;">DIVISI</th>
        <th style="width: 120px; text-align: left;">JABATAN</th>
        <th style="width: 120px;">HARI WAJIB KERJA</th>
        <th style="width: 130px;">MASUK (HADIR)</th>
        <th style="width: 120px;">IZIN RESMI</th>
        <th colspan="4" style="width: 420px;">TANPA KETERANGAN (ALPHA)</th>
      </tr>
    </thead>
    <tbody>`;

    summaryRows.forEach((row, index) => {
      const isZebra = index % 2 === 1;
      const rowBg = isZebra ? "#f8fafc" : "#ffffff";
      html += `
      <tr style="background-color: ${rowBg};">
        <td class="text-center nowrap" style="border: 1px solid #cbd5e1;">${index + 1}</td>
        <td colspan="2" class="text-center font-bold nowrap" style="border: 1px solid #cbd5e1; mso-number-format:'\\@'; color: #334155;">${row.id}</td>
        <td class="text-left font-bold nowrap" style="border: 1px solid #cbd5e1; color: #1e293b;">${row.name}</td>
        <td class="text-left nowrap" style="border: 1px solid #cbd5e1; color: #475569;">${row.department}</td>
        <td class="text-left nowrap" style="border: 1px solid #cbd5e1; color: #475569;">${row.role}</td>
        <td class="text-center font-bold nowrap" style="border: 1px solid #cbd5e1; color: #334155;">${row.totalWorkingDays} hari</td>
        <td class="text-center font-bold nowrap" style="border: 1px solid #cbd5e1; color: #059669; background-color: #f0fdf4;">${row.masukCount} hari</td>
        <td class="text-center font-bold nowrap" style="border: 1px solid #cbd5e1; color: #2563eb; background-color: #eff6ff;">${row.leavesCount} hari</td>
        <td colspan="4" class="text-center font-bold nowrap" style="border: 1px solid #cbd5e1; color: #dc2626; background-color: #fef2f2;">${row.alphaCount} hari</td>
      </tr>`;
    });

    html += `
    </tbody>
  </table>

  <!-- SPACING/BREAK -->
  <table style="border:none; margin-bottom: 25px;">
    <tr><td colspan="13" style="border:none; height: 10px;"></td></tr>
  </table>

  <!-- BAGIAN 2: RINCIAN LOG KEHADIRAN KARYAWAN -->
  <table style="border:none; margin-bottom:10px;">
    <tr>
      <td colspan="13" style="font-size: 13pt; font-weight: bold; color: #1e1b4b; border: none; padding-top: 10px; padding-bottom: 10px; font-family: 'Segoe UI', sans-serif;">
        📋 BAGIAN 2: RINCIAN DETAIL LOG ABSENSI KARYAWAN (DETAILED LOGS)
      </td>
    </tr>
  </table>

  <table border="1" style="border-collapse: collapse; border: 1px solid #cbd5e1;">
    <colgroup>
      <col width="50" />
      <col width="100" />
      <col width="110" />
      <col width="180" />
      <col width="120" />
      <col width="100" />
      <col width="100" />
      <col width="120" />
      <col width="120" />
      <col width="120" />
      <col width="120" />
      <col width="400" />
      <col width="250" />
    </colgroup>
    <thead>
      <tr>
        <th style="width: 50px;">NO</th>
        <th colspan="2" style="width: 200px;">TANGGAL</th>
        <th colspan="2" style="width: 210px;">ID KARYAWAN</th>
        <th colspan="2" style="width: 250px; text-align: left;">NAMA KARYAWAN</th>
        <th style="width: 140px;">SHIFT</th>
        <th style="width: 120px;">STATUS</th>
        <th colspan="2" style="width: 400px; text-align: left;">ALAMAT LOKASI GPS KARYAWAN</th>
        <th colspan="2" style="width: 250px; text-align: left;">CATATAN/KETERANGAN</th>
      </tr>
    </thead>
    <tbody>`;

    if (monthlyLogs.length === 0) {
      html += `<tr><td colspan="13" style="border: 1px solid #cbd5e1; text-align: center; padding: 20px; color: #64748b; font-style: italic; font-size: 11px;">Tidak ada rincian data log kehadiran untuk periode ini</td></tr>`;
    } else {
      monthlyLogs.forEach((log, index) => {
        const isZebra = index % 2 === 1;
        const rowBg = isZebra ? "#f8fafc" : "#ffffff";
        
        let statusStyle = "color: #1e293b; font-weight: bold;";
        let statusBg = "#ffffff";
        if (log.status === "Hadir" || log.status === "Pulang") {
          statusStyle = "color: #047857; font-weight: bold;";
          statusBg = "#ecfdf5";
        } else if (log.status === "Terlambat") {
          statusStyle = "color: #b91c1c; font-weight: bold;";
          statusBg = "#fef2f2";
        } else if (log.status === "Izin") {
          statusStyle = "color: #1d4ed8; font-weight: bold;";
          statusBg = "#eff6ff";
        }

        html += `
        <tr style="background-color: ${rowBg};">
          <td class="text-center nowrap" style="border: 1px solid #cbd5e1;">${index + 1}</td>
          <td colspan="2" class="text-center font-bold nowrap" style="border: 1px solid #cbd5e1; color: #475569;">${log.date}</td>
          <td colspan="2" class="text-center font-bold nowrap" style="border: 1px solid #cbd5e1; mso-number-format:'\\@'; color: #334155;">${log.employeeId}</td>
          <td colspan="2" class="text-left font-bold nowrap" style="border: 1px solid #cbd5e1; color: #1e293b;">${log.employeeName}</td>
          <td class="text-center nowrap" style="border: 1px solid #cbd5e1; color: #475569;">${log.shiftName}</td>
          <td class="text-center nowrap" style="border: 1px solid #cbd5e1; ${statusStyle} background-color: ${statusBg};">${log.status}</td>
          <td colspan="2" class="text-left" style="border: 1px solid #cbd5e1; color: #52525b; line-height: 1.4; font-size: 9pt; min-width: 350px;">${log.address || '-'}</td>
          <td colspan="2" class="text-left" style="border: 1px solid #cbd5e1; color: #4b5563; font-size: 9.5pt;">${log.notes || '-'}</td>
        </tr>`;
      });
    }

    html += `
    </tbody>
  </table>
</body>
</html>`;

    // Trigger Download of .xls using Blob with Excel Mime Type
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Rekap_Absensi_Lengkap_${monthName}_${recapYear}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle Avatar Image Upload
  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setNewEmpAvatar(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle Add New Employee
  const handleAddEmployeeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName || !newEmpRole || !newEmpDept || !newEmpPhone) return;

    // Use uploaded base64 avatar or random professional default
    const avatarToUse = newEmpAvatar || `https://images.unsplash.com/photo-${Math.floor(1500000000000 + Math.random() * 100000000000)}?w=150&h=150&fit=crop&crop=face`;

    // Find the maximum numeric ID among existing employees to avoid duplicate IDs and overwrites
    let maxNumericId = 0;
    employees.forEach(emp => {
      const match = emp.id.match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (num > maxNumericId) {
          maxNumericId = num;
        }
      }
    });
    const nextIdNum = maxNumericId + 1;
    const newEmpId = `EMP${String(nextIdNum).padStart(3, '0')}`;
    const generatedNik = newEmpNik || `DG01112${String(nextIdNum).padStart(3, '0')}`;
    const newEmp: Employee = {
      id: newEmpId,
      name: newEmpName,
      role: newEmpRole,
      department: newEmpDept,
      phone: newEmpPhone,
      avatar: avatarToUse,
      activeShiftId: 'S1',
      nik: generatedNik
    };

    onAddEmployee(newEmp);
    setNewEmpName('');
    setNewEmpRole('');
    setNewEmpDept('DG Komputer Palembang-Betung');
    setNewEmpPhone('');
    setNewEmpAvatar('');
    setNewEmpNik('');
    setShowAddForm(false);
  };

  // Handle Admin Logout
  const handleAdminLogout = () => {
    localStorage.removeItem('admin_logged_in');
    localStorage.removeItem('isAdminUnlocked');
    setIsAdminAuthenticated(false);
    setAdminUsernameInput('');
    setAdminPasswordInput('');
    if (onLogout) {
      onLogout();
    }
  };

  // Handle Update Admin Credentials
  const handleUpdateCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newAdminPassword.length < 5) {
      setCredentialErrorMsg('Password baru harus minimal 5 karakter!');
      setCredentialSuccessMsg(null);
      return;
    }
    if (newAdminPassword !== confirmAdminPassword) {
      setCredentialErrorMsg('Konfirmasi password tidak cocok!');
      setCredentialSuccessMsg(null);
      return;
    }

    localStorage.setItem('admin_username', newAdminUsername);
    localStorage.setItem('admin_password', newAdminPassword);
    
    setCredentialSuccessMsg('Kredensial admin berhasil diperbarui!');
    setCredentialErrorMsg(null);
    setNewAdminUsername('');
    setNewAdminPassword('');
    setConfirmAdminPassword('');
  };

  // Helper to get admin's current GPS location for setting store coordinates
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Browser Anda tidak mendukung deteksi lokasi GPS.");
      return;
    }
    alert("Sedang mendeteksi koordinat GPS HP Anda saat ini. Mohon izinkan akses lokasi jika ditanyakan...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordsStr = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
        setEditStoreCoords(coordsStr);
        alert(`Lokasi GPS berhasil terdeteksi!\nKoordinat: ${coordsStr}`);
      },
      (error) => {
        let msg = "Gagal mengambil lokasi GPS Anda.";
        if (error.code === error.PERMISSION_DENIED) {
          msg = "Izin lokasi ditolak. Silakan aktifkan izin GPS di pengaturan browser Anda.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = "Informasi lokasi tidak tersedia dari pemancar GPS atau jaringan Anda.";
        } else if (error.code === error.TIMEOUT) {
          msg = "Waktu permintaan lokasi habis (timeout). Silakan coba lagi.";
        }
        alert(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Handle Update Store Location
  const handleSaveStoreLocation = (e: React.FormEvent) => {
    e.preventDefault();
    const parts = editStoreCoords.split(',').map(s => s.trim());
    if (parts.length !== 2) {
      alert('Format koordinat tidak valid! Gunakan format: Latitude, Longitude (contoh: -2.990422, 104.755433)');
      return;
    }
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (isNaN(lat) || isNaN(lng)) {
      alert('Koordinat harus berupa angka desimal! Periksa kembali input Anda.');
      return;
    }

    let finalRadius = Number(editStoreRadius);
    if (finalRadius > 500) {
      alert('Sesuai kebijakan sistem, radius kehadiran maksimal dibatasi paling jauh 500 meter demi keamanan dan akurasi absensi!');
      finalRadius = 500;
      setEditStoreRadius(500);
    }

    onUpdateStoreLocation({
      name: editStoreName,
      address: editStoreAddress,
      latitude: lat,
      longitude: lng,
      radius: finalRadius
    });
    alert('Konfigurasi lokasi kantor berhasil disimpan!');
    setIsUpdatingStore(false);
  };





  const handleAdminLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const savedUser = localStorage.getItem('admin_username') || 'admin';
    const savedPass = localStorage.getItem('admin_password') || 'admin123';

    if (adminUsernameInput === savedUser && adminPasswordInput === savedPass) {
      localStorage.setItem('admin_logged_in', 'true');
      setIsAdminAuthenticated(true);
      setAdminLoginError(null);
    } else {
      setAdminLoginError('Username atau Password salah! Silakan coba lagi.');
    }
  };

  const handleDownloadJpg = async () => {
    const el = document.getElementById('id-card-print-area');
    if (!el || !selectedIdCardEmp) return;
    setIsCardDownloading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const dataUrl = await toJpeg(el, {
        quality: 0.98,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });
      const link = document.createElement('a');
      link.download = `KARTU_PEGAWAI_${selectedIdCardEmp.name.replace(/\s+/g, '_').toUpperCase()}_${selectedIdCardEmp.id}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Gagal mengunduh kartu pegawai:', err);
    } finally {
      setIsCardDownloading(false);
    }
  };

  if (!isAdminAuthenticated) {
    return (
      <div className="max-w-md mx-auto my-8 p-6 sm:p-8 bg-white border border-slate-100 rounded-3xl shadow-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
            🔐
          </div>
          <h3 className="text-lg font-black text-slate-800 tracking-tight">Login Dashboard Admin</h3>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Silakan masukkan username dan password Anda</p>
        </div>

        {adminLoginError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl text-center">
            {adminLoginError}
          </div>
        )}

        <form onSubmit={handleAdminLoginSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Username</label>
            <input
              type="text"
              required
              placeholder="Masukkan username admin..."
              value={adminUsernameInput}
              onChange={e => setAdminUsernameInput(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Password</label>
            <input
              type="password"
              required
              placeholder="Masukkan password admin..."
              value={adminPasswordInput}
              onChange={e => setAdminPasswordInput(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3.5 rounded-2xl transition-all shadow-md shadow-indigo-100 active:scale-95"
          >
            Masuk Sekarang
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* Top Header Row with Logout Button and Notifications Bell */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Dashboard Panel Admin</h2>
            {supabaseStatus === 'connected' ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1 animate-pulse"></span>
                Supabase Online
              </span>
            ) : supabaseStatus === 'error' ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100" title="Tabel belum dibuat, jalankan script SQL di bawah">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mr-1"></span>
                Supabase: Tabel Belum Dibuat
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-50 text-slate-500 border border-slate-200">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full mr-1"></span>
                Mode Lokal (Offline)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Kelola data karyawan & pantau aktivitas kehadiran</p>
        </div>
        
        <div className="flex items-center justify-end gap-3 self-end sm:self-auto">
          {/* Notification Bell Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotificationsDropdown(!showNotificationsDropdown);
                if (!showNotificationsDropdown) {
                  handleMarkAllAsRead();
                }
              }}
              className="relative p-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-800 rounded-2xl transition-all cursor-pointer flex items-center justify-center active:scale-95 shadow-xs"
              title="Notifikasi Absen Karyawan"
            >
              <Bell className="w-4.5 h-4.5" />
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center animate-bounce border-2 border-white">
                  {notifications.filter(n => !n.read).length}
                </span>
              )}
            </button>

            {/* Notifications Dropdown list */}
            <AnimatePresence>
              {showNotificationsDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-3 w-80 sm:w-96 bg-white border border-slate-100 rounded-3xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Aktivitas Absensi</h4>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Notifikasi absensi karyawan terbaru</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {notifications.filter(n => !n.read).length > 0 && (
                        <button
                          onClick={handleMarkAllAsRead}
                          className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100 cursor-pointer transition-all"
                        >
                          Selesai Baca
                        </button>
                      )}
                      <button
                        onClick={handleClearAllNotifications}
                        className="text-[9px] font-black text-rose-600 hover:text-rose-800 bg-rose-50 px-2 py-1 rounded-lg border border-rose-100 cursor-pointer transition-all"
                      >
                        Hapus Semua
                      </button>
                    </div>
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs">
                        <div className="text-3xl mb-2">📭</div>
                        <p className="font-bold text-slate-500">Tidak ada notifikasi</p>
                        <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-wider font-semibold">Semua absensi hari ini aman</p>
                      </div>
                    ) : (
                      notifications.map(notif => {
                        const isClockIn = notif.type === 'clock_in';
                        const isClockOut = notif.type === 'clock_out';
                        const isBreakStart = notif.type === 'break_start';
                        const isBreakEnd = notif.type === 'break_end';
                        
                        return (
                          <div
                            key={notif.id}
                            onClick={() => handleMarkSingleAsRead(notif.id)}
                            className={`p-3.5 flex items-start space-x-3 transition-all hover:bg-slate-50/70 cursor-pointer ${
                              !notif.read ? 'bg-indigo-50/20' : ''
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center font-bold text-xs ${
                              isClockIn ? 'bg-emerald-50 text-emerald-600' :
                              isClockOut ? 'bg-rose-50 text-rose-600' :
                              'bg-amber-50 text-amber-600'
                            }`}>
                              {isClockIn ? '📥' : isClockOut ? '📤' : '☕'}
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <p className="text-xs text-slate-800 leading-normal font-medium">
                                <span className="font-black text-slate-900">{notif.employeeName}</span>{' '}
                                {isClockIn ? 'sudah' : isClockOut ? 'sudah' : 'sedang'}{' '}
                                <span className={`font-black ${
                                  isClockIn ? 'text-emerald-600' : isClockOut ? 'text-rose-600' : 'text-amber-600'
                                }`}>
                                  {isClockIn ? 'ABSEN MASUK' : isClockOut ? 'ABSEN PULANG' : isBreakStart ? 'MULAI ISTIRAHAT' : 'SELESAI ISTIRAHAT'}
                                </span>
                              </p>
                              <div className="flex items-center space-x-2 mt-1">
                                <span className="text-[10px] font-bold text-slate-500 font-mono flex items-center gap-0.5">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  {notif.time}
                                </span>
                                <span className="text-[9px] text-slate-400 font-bold uppercase">{notif.date}</span>
                                {!notif.read && (
                                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-ping"></span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSingleNotification(notif.id);
                              }}
                              className="text-slate-300 hover:text-rose-600 self-center p-1 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                              title="Hapus"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={handleAdminLogout}
            className="bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-600 font-black text-xs px-4 py-2.5 rounded-xl transition-all flex items-center justify-center space-x-1.5 active:scale-95 cursor-pointer"
          >
            <span>Keluar Admin</span>
          </button>
        </div>
      </div>
      
      {/* Dynamic Toast / Alert Banner for Unread Offline Notifications */}
      {isAdminAuthenticated && notifications.filter(n => !n.read).length > 0 && !dismissedWelcomeBanner && (
        <motion.div
          initial={{ opacity: 0, height: 0, y: -20 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0, y: -20 }}
          className="bg-indigo-50 border border-indigo-100 rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm"
        >
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 text-lg font-bold shadow-md shadow-indigo-100 animate-pulse">
              🔔
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                Pemberitahuan Absensi Baru!
                <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black animate-bounce">
                  {notifications.filter(n => !n.read).length} Aktivitas Baru
                </span>
              </h4>
              <p className="text-xs text-slate-600 font-semibold uppercase tracking-wider mt-0.5">
                Karyawan berikut telah melakukan absensi saat Anda tidak membuka panel admin:
              </p>
              
              {/* Horizontal scroll of unread logs */}
              <div className="flex flex-wrap gap-2 pt-2">
                {notifications.filter(n => !n.read).slice(0, 5).map(notif => (
                  <div key={notif.id} className="bg-white border border-indigo-100/50 rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs shadow-xs">
                    <span className="font-black text-slate-800">{notif.employeeName}</span>
                    <span className={`font-black text-[10px] px-2 py-0.5 rounded ${
                      notif.type === 'clock_in' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}>
                      {notif.type === 'clock_in' ? 'Masuk' : 'Pulang'}
                    </span>
                    <span className="text-[10px] font-bold font-mono text-slate-400">{notif.time}</span>
                  </div>
                ))}
                {notifications.filter(n => !n.read).length > 5 && (
                  <div className="bg-slate-100 text-slate-600 font-black text-[10px] px-3 py-2 rounded-xl flex items-center">
                    + {notifications.filter(n => !n.read).length - 5} Lainnya
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto self-end md:self-auto">
            <button
              onClick={() => setDismissedWelcomeBanner(true)}
              className="w-full md:w-auto bg-slate-200/85 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-2xl transition-all cursor-pointer text-center active:scale-95"
            >
              Nanti Saja
            </button>
            <button
              onClick={() => {
                handleMarkAllAsRead();
                setDismissedWelcomeBanner(true);
              }}
              className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs px-5 py-2.5 rounded-2xl shadow-md shadow-indigo-100 transition-all cursor-pointer text-center active:scale-95"
            >
              Tandai Sudah Dibaca ✓
            </button>
          </div>
        </motion.div>
      )}
      


      {/* 0. Shareable Attendance Link Banner */}
      <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-800 rounded-3xl p-6 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-bold text-base tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse shrink-0"></span>
            Link Absensi Khusus Karyawan
          </h3>
          <p className="text-xs text-indigo-100 leading-relaxed max-w-2xl">
            Karyawan yang masuk melalui tautan ini hanya dapat mengakses portal absensi secara langsung dan tidak dapat beralih ke halaman Dashboard Admin.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full md:w-auto shrink-0">
          {linkCopied && (
            <span className="text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-3 py-1.5 rounded-xl animate-pulse">
              Link Berhasil Disalin!
            </span>
          )}
          <button
            onClick={() => {
              const link = window.location.origin + window.location.pathname + '?mode=employee';
              navigator.clipboard.writeText(link);
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 3000);
            }}
            className="w-full sm:w-auto bg-white text-indigo-700 hover:bg-indigo-50 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all duration-300 shadow-sm flex items-center justify-center space-x-2 active:scale-95"
          >
            <span>Salin Link Absensi</span>
          </button>
        </div>
      </div>
      
      {/* 1. Dashboard Bento Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex items-center space-x-4 transition-all hover:shadow-md">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] block font-black text-slate-400 tracking-wider uppercase">Total Karyawan</span>
            <span className="text-2xl font-black text-slate-800 font-mono">{totalEmployeesCount}</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex items-center space-x-4 transition-all hover:shadow-md">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] block font-black text-slate-400 tracking-wider uppercase">Sudah Absen</span>
            <span className="text-2xl font-black text-slate-800 font-mono">{presentTodayCount}</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex items-center space-x-4 transition-all hover:shadow-md">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] block font-black text-slate-400 tracking-wider uppercase">Belum Absen</span>
            <span className="text-2xl font-black text-slate-800 font-mono">{notPresentTodayCount}</span>
          </div>
        </div>

      </div>

      {/* 2. Charts Visual Dashboard */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Tren Kehadiran Mingguan (5 Hari Kerja)</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Grafik Perbandingan Sudah Absen & Belum Absen</p>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSudahAbsen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorBelumAbsen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10, borderColor: '#f1f5f9' }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="Sudah Absen" stroke="#10b981" fillOpacity={1} fill="url(#colorSudahAbsen)" strokeWidth={2.5} />
              <Area type="monotone" dataKey="Belum Absen" stroke="#ef4444" fillOpacity={1} fill="url(#colorBelumAbsen)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Navigation inside Admin Panel */}
      {/* Desktop Tabs */}
      <div className="hidden md:flex border-b border-slate-100 space-x-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${
            activeTab === 'logs'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Riwayat Kehadiran ({filteredLogs.length})
        </button>
        <button
          onClick={() => setActiveTab('recap')}
          className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${
            activeTab === 'recap'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          📊 Rekap Absensi Bulanan
        </button>
        <button
          onClick={() => setActiveTab('leaves')}
          className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${
            activeTab === 'leaves'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Persetujuan Cuti/Izin ({leaveRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('employees')}
          className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${
            activeTab === 'employees'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Karyawan ({employees.length})
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${
            activeTab === 'settings'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          ⚙ Pengaturan
        </button>
        <button
          onClick={() => setActiveTab('company_info')}
          className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${
            activeTab === 'company_info'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          🏬 Info Toko & Peran
        </button>
      </div>

      {/* Mobile/Tablet Menu (Garis 3 / Hamburger Dropdown) */}
      <div className="md:hidden relative w-full">
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-2xl shadow-xs text-xs font-black text-slate-700 transition-all active:scale-[0.98] cursor-pointer"
        >
          <div className="flex items-center space-x-3">
            <Menu className="w-5 h-5 text-indigo-600 animate-pulse shrink-0" />
            <span className="uppercase tracking-wider text-[11px] text-slate-800">
              Menu: {
                activeTab === 'logs' ? `Riwayat Kehadiran (${filteredLogs.length})` :
                activeTab === 'recap' ? '📊 Rekap Absensi Bulanan' :
                activeTab === 'leaves' ? `Persetujuan Cuti/Izin (${leaveRequests.length})` :
                activeTab === 'employees' ? `Karyawan (${employees.length})` :
                activeTab === 'company_info' ? '🏬 Info Toko & Peran' :
                '⚙ Pengaturan'
              }
            </span>
          </div>
          <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-md font-bold uppercase">Pilih Halaman ▼</span>
        </button>
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden divide-y divide-slate-100"
            >
              <button
                type="button"
                onClick={() => { setActiveTab('logs'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-5 py-3.5 text-xs font-bold transition-all flex items-center justify-between ${
                  activeTab === 'logs' ? 'bg-indigo-50/70 text-indigo-700 font-extrabold' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Clock className="w-4.5 h-4.5 text-indigo-500" />
                  <span>Riwayat Kehadiran</span>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{filteredLogs.length}</span>
              </button>
              
              <button
                type="button"
                onClick={() => { setActiveTab('recap'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-5 py-3.5 text-xs font-bold transition-all flex items-center space-x-2.5 ${
                  activeTab === 'recap' ? 'bg-indigo-50/70 text-indigo-700 font-extrabold' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-base">📊</span>
                <span>Rekap Absensi Bulanan</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('leaves'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-5 py-3.5 text-xs font-bold transition-all flex items-center justify-between ${
                  activeTab === 'leaves' ? 'bg-indigo-50/70 text-indigo-700 font-extrabold' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <FilePlus className="w-4.5 h-4.5 text-indigo-500" />
                  <span>Persetujuan Cuti/Izin</span>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{leaveRequests.length}</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('employees'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-5 py-3.5 text-xs font-bold transition-all flex items-center justify-between ${
                  activeTab === 'employees' ? 'bg-indigo-50/70 text-indigo-700 font-extrabold' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Users className="w-4.5 h-4.5 text-indigo-500" />
                  <span>Karyawan</span>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{employees.length}</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-5 py-3.5 text-xs font-bold transition-all flex items-center space-x-2.5 ${
                  activeTab === 'settings' ? 'bg-indigo-50/70 text-indigo-700 font-extrabold' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Settings className="w-4.5 h-4.5 text-indigo-500" />
                <span>Pengaturan</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('company_info'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-5 py-3.5 text-xs font-bold transition-all flex items-center space-x-2.5 ${
                  activeTab === 'company_info' ? 'bg-indigo-50/70 text-indigo-700 font-extrabold' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-base">🏬</span>
                <span>Info Toko & Peran</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 5. Tab Views rendering dynamically */}
      {supabaseStatus === 'error' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50/85 border border-amber-200 rounded-3xl p-6 shadow-xs space-y-4"
        >
          <div className="flex items-start space-x-3.5">
            <span className="text-2xl mt-0.5 shrink-0">⚠️</span>
            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-800 text-sm">Supabase Terdeteksi, tapi Tabel Belum Dibuat / Kosong!</h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Kredensial database Supabase telah dimasukkan di <code className="bg-amber-100/60 px-1 py-0.5 rounded text-[10px] font-mono font-bold text-amber-800">.env</code> Anda, tetapi tabel database (<code className="font-mono text-[10px] text-amber-800">employees</code>, <code className="font-mono text-[10px] text-amber-800">attendance_logs</code>, dll.) belum terbuat. Aplikasi ini saat ini berjalan dalam <strong>Mode Lokal (Offline)</strong> sebagai cadangan aman, sehingga <strong>penghapusan karyawan, pencatatan absen, atau cuti tidak akan tersinkron dengan HP/perangkat lain</strong>.
              </p>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl border border-amber-100 p-4.5 space-y-3 shadow-xs">
            <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <span>🚀</span> Langkah Instan untuk Menghubungkan Antar HP:
            </h4>
            <ol className="list-decimal pl-5 text-xs text-slate-600 space-y-2 font-medium">
              <li>
                Masuk ke dashboard Supabase Anda di{' '}
                <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-black decoration-2">
                  supabase.com
                </a>.
              </li>
              <li>
                Buka menu <strong>SQL Editor</strong> (ikon terminal di bilah sisi kiri) pada project Anda.
              </li>
              <li>
                Klik <strong>"New Query"</strong> untuk membuat editor baru.
              </li>
              <li>
                Klik tombol <strong className="text-indigo-700">📋 Salin Script SQL</strong> di bawah ini, lalu <strong>Paste (Tempel)</strong> seluruh kodenya ke SQL Editor Supabase.
              </li>
              <li>
                Klik tombol <strong>"Run"</strong> di kanan bawah SQL Editor Supabase. Selesai! Halaman ini akan terhubung otomatis secara real-time.
              </li>
            </ol>
          </div>

          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider">Script SQL Struktur Tabel (Copy baris di bawah ini):</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(SCHEMA_SQL_TEXT);
                  alert("✓ Script SQL berhasil disalin ke clipboard! Silakan paste di SQL Editor Supabase.");
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-wider px-4 py-2 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer self-start sm:self-auto flex items-center gap-1"
              >
                <span>📋</span> Salin Script SQL
              </button>
            </div>
            <textarea
              readOnly
              value={SCHEMA_SQL_TEXT}
              className="w-full h-32 bg-slate-900 text-slate-200 font-mono text-[10.5px] p-4 rounded-2xl border border-slate-800 outline-none resize-none shadow-inner leading-relaxed"
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
          </div>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        
        {/* VIEW A: Attendance Logs History */}
        {activeTab === 'logs' && (
          <motion.div
            key="logs-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Search and Filters bar */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama atau ID karyawan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                
                {/* Status Filter */}
                <div className="flex items-center space-x-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg px-2 py-1.5 outline-none"
                  >
                    <option value="All">Semua Status</option>
                    <option value="Hadir">Hadir</option>
                    <option value="Pulang">Pulang</option>
                    <option value="Izin">Izin</option>
                  </select>
                </div>

                {/* Date Filter */}
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg px-2 py-1 outline-none"
                />
              </div>
            </div>

            {/* Log Table Container */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Karyawan</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tanggal</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Masuk • Pulang</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status Kehadiran</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-10 text-slate-400 text-xs font-semibold">
                          Tidak ditemukan riwayat log absensi yang cocok dengan kriteria filter.
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/50 transition-all">
                          
                          {/* Col 1: Employee info */}
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-3">
                              <div className="shrink-0">
                                <span className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 border border-white uppercase shadow-xs">
                                  {log.employeeName.substring(0,2)}
                                </span>
                              </div>
                              <div>
                                <span className="text-xs font-bold text-slate-800 block leading-tight">{log.employeeName}</span>
                                <code className="text-[10px] font-mono text-indigo-500 font-bold block">{log.employeeId}</code>
                              </div>
                            </div>
                          </td>

                          {/* Col 2: Date */}
                          <td className="px-6 py-4">
                            <span className="text-xs font-bold text-slate-700 block leading-tight">
                              {new Date(log.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </td>

                          {/* Col 3: Clock In & Out times */}
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              <div className="flex items-center space-x-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                                <span className="text-xs font-bold text-slate-800 font-mono">{log.clockIn}</span>
                              </div>
                              <div className="flex items-center space-x-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0"></span>
                                <span className="text-xs font-bold text-slate-500 font-mono">{log.clockOut || '--:--:--'}</span>
                              </div>
                              {log.latitude && log.longitude && (
                                <button
                                  onClick={() => setSelectedMapLog(log)}
                                  className="text-[9px] text-indigo-600 bg-indigo-50/70 hover:bg-indigo-100 active:bg-indigo-200/80 rounded px-2 py-0.5 font-bold font-mono inline-flex items-center gap-1 mt-1.5 transition-all cursor-pointer border border-indigo-100/50"
                                  title="Lihat Peta Lokasi"
                                >
                                  <MapPin className="w-3 h-3 text-indigo-500 shrink-0" />
                                  <span>Lihat Lokasi</span>
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Col 4: Status badge */}
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              log.status === 'Pulang'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                : log.status === 'Hadir'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                : log.status === 'Izin'
                                ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                : 'bg-slate-50 text-slate-600 border border-slate-100'
                            }`}>
                              {log.status === 'Pulang' ? 'Pulang' : log.status === 'Hadir' ? 'Hadir' : 'Izin / Cuti'}
                            </span>
                          </td>

                          {/* Col 5: Deletions */}
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => {
                                if (window.confirm(`Hapus log kehadiran ${log.employeeName} untuk tanggal ${log.date}?`)) {
                                  onDeleteLog(log.id);
                                }
                              }}
                              className="text-slate-400 hover:text-rose-600 p-1.5 hover:bg-rose-50 rounded-lg transition-all"
                              title="Hapus Log"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>

                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {/* VIEW B: Monthly / Daily Recap */}
        {activeTab === 'recap' && (
          <motion.div
            key="recap-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Recap Filters */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-indigo-600" />
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Rekap Kinerja Bulanan</h4>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Periode Aktif Kehadiran Staff</p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <select
                  value={recapMonth}
                  onChange={e => setRecapMonth(Number(e.target.value))}
                  className="bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3 py-2 outline-none flex-1 sm:flex-initial"
                >
                  <option value={1}>Januari</option>
                  <option value={2}>Februari</option>
                  <option value={3}>Maret</option>
                  <option value={4}>April</option>
                  <option value={5}>Mei</option>
                  <option value={6}>Juni</option>
                  <option value={7}>Juli</option>
                  <option value={8}>Agustus</option>
                  <option value={9}>September</option>
                  <option value={10}>Oktober</option>
                  <option value={11}>November</option>
                  <option value={12}>Desember</option>
                </select>

                <select
                  value={recapYear}
                  onChange={e => setRecapYear(Number(e.target.value))}
                  className="bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3 py-2 outline-none"
                >
                  <option value={currentYear}>{currentYear}</option>
                  <option value={currentYear - 1}>{currentYear - 1}</option>
                </select>

                <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={handleExportCombinedExcel}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center space-x-2 shadow-md shadow-indigo-100 transition-all shrink-0 hover:scale-[1.02] active:scale-[0.98]"
                    title="Ekspor Rekap Ringkasan & Detail Log Kehadiran Bulanan Lengkap (Format Excel Berwarna)"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <span>Ekspor Rekap Bulanan Lengkap (Excel)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Recap Grid Table */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Karyawan</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Departemen</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Hari Kerja</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center text-emerald-600">Masuk</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center text-blue-600">Izin</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center text-rose-500">Tanpa Keterangan</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Persentase</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recapData.map((row) => {
                      const presentDays = row.masukCount;
                      const attendanceRate = row.totalWorkingDays > 0 
                        ? Math.round((presentDays / row.totalWorkingDays) * 100) 
                        : 0;

                      return (
                        <tr key={row.id} className="hover:bg-slate-50/50 transition-all text-xs">
                          <td className="px-6 py-4 font-bold text-slate-800">
                            <div>{row.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono font-normal">{row.id} • {row.role}</div>
                          </td>
                          <td className="px-6 py-4 text-slate-600 font-semibold">{row.department}</td>
                          <td className="px-6 py-4 text-center font-mono font-bold text-slate-700">{row.totalWorkingDays} hari</td>
                          <td className="px-6 py-4 text-center font-mono font-bold">
                            <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-xl">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              <span>{row.masukCount}x</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center font-mono font-bold">
                            <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-xl">
                              <FileText className="w-3.5 h-3.5 text-blue-500" />
                              <span>{row.leavesCount}x</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center font-mono font-bold">
                            <div className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-700 px-2.5 py-1 rounded-xl">
                              <UserX className="w-3.5 h-3.5 text-rose-500" />
                              <span>{row.alphaCount} hari</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className={`font-bold font-mono px-2.5 py-1 rounded-xl text-[10px] ${
                              attendanceRate >= 90 ? 'bg-emerald-100 text-emerald-800' :
                              attendanceRate >= 75 ? 'bg-amber-100 text-amber-800' :
                              'bg-rose-100 text-rose-800'
                            }`}>
                              {attendanceRate}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card-List View */}
              <div className="block md:hidden divide-y divide-slate-100">
                {recapData.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">Tidak ada data rekapitulasi</div>
                ) : (
                  recapData.map((row) => {
                    const presentDays = row.masukCount;
                    const attendanceRate = row.totalWorkingDays > 0 
                      ? Math.round((presentDays / row.totalWorkingDays) * 100) 
                      : 0;

                    return (
                      <div key={row.id} className="p-5 space-y-4">
                        {/* Name & Percentage */}
                        <div className="flex items-center justify-between">
                          <div>
                            <h5 className="font-extrabold text-slate-800 text-sm">{row.name}</h5>
                            <span className="text-[10px] text-slate-400 font-mono">{row.id} • {row.role}</span>
                          </div>
                          <span className={`font-bold font-mono px-2.5 py-1 rounded-xl text-xs ${
                            attendanceRate >= 90 ? 'bg-emerald-100 text-emerald-800' :
                            attendanceRate >= 75 ? 'bg-amber-100 text-amber-800' :
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {attendanceRate}% Hadir
                          </span>
                        </div>

                        {/* Department */}
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400 font-semibold">Departemen:</span>
                          <span className="text-slate-700 font-bold">{row.department}</span>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100/70 text-center">
                            <span className="block text-[9px] text-slate-400 font-black uppercase tracking-wider mb-1">Hari Kerja</span>
                            <span className="font-mono font-bold text-slate-700 text-xs">{row.totalWorkingDays} hari</span>
                          </div>
                          <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100 text-center flex flex-col items-center justify-center">
                            <span className="block text-[9px] text-emerald-600 font-black uppercase tracking-wider mb-1">Masuk</span>
                            <div className="flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="font-mono font-bold text-emerald-700 text-xs">{row.masukCount}x</span>
                            </div>
                          </div>
                          <div className="bg-blue-50/50 p-3 rounded-2xl border border-blue-100 text-center flex flex-col items-center justify-center">
                            <span className="block text-[9px] text-blue-600 font-black uppercase tracking-wider mb-1">Izin</span>
                            <div className="flex items-center gap-1">
                              <FileText className="w-3.5 h-3.5 text-blue-500" />
                              <span className="font-mono font-bold text-blue-700 text-xs">{row.leavesCount}x</span>
                            </div>
                          </div>
                          <div className="bg-rose-50/50 p-3 rounded-2xl border border-rose-100 text-center flex flex-col items-center justify-center">
                            <span className="block text-[9px] text-rose-500 font-black uppercase tracking-wider mb-1">Tanpa Keterangan</span>
                            <div className="flex items-center gap-1">
                              <UserX className="w-3.5 h-3.5 text-rose-500" />
                              <span className="font-mono font-bold text-rose-700 text-xs">{row.alphaCount} hari</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* VIEW C: Leave Requests approval workflow */}
        {activeTab === 'leaves' && (
          <motion.div
            key="leaves-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {leaveRequests.length === 0 ? (
              <div className="col-span-1 md:col-span-2 bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center text-2xl">
                  📭
                </div>
                <div>
                  <h4 className="text-slate-800 font-bold text-sm">Tidak Ada Pengajuan</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                    Seluruh riwayat atau antrean pengajuan cuti/izin karyawan kosong saat ini.
                  </p>
                </div>
              </div>
            ) : (
              leaveRequests.map((request) => (
                <div 
                  key={request.id} 
                  className={`bg-white rounded-3xl p-6 border shadow-sm flex flex-col justify-between gap-5 transition-all hover:shadow-md hover:border-slate-200/80 ${
                    request.status === 'Pending' ? 'border-amber-200/80 bg-amber-50/10' : 'border-slate-100/80'
                  }`}
                >
                  <div className="space-y-4">
                    
                    {/* Header */}
                    <div className="flex justify-between items-center gap-2">
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm shrink-0">
                          {request.employeeName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-extrabold text-slate-800 block truncate leading-tight">{request.employeeName}</span>
                          <span className="text-[10px] text-slate-400 font-mono font-bold block mt-0.5 uppercase tracking-wide">ID: {request.employeeId}</span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shrink-0 ${
                        request.status === 'Disetujui' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                        request.status === 'Ditolak' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                        'bg-amber-50 text-amber-700 border border-amber-100 animate-pulse'
                      }`}>
                        {request.status}
                      </span>
                    </div>

                    {/* Details Grid */}
                    <div className="bg-slate-50/60 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border border-slate-100/40">
                      <div>
                        <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block mb-1">Tipe Izin / Cuti</span>
                        <span className="font-extrabold text-slate-700 flex items-center gap-1.5">
                          {request.type === 'Sakit' ? (
                            <>
                              <span className="text-base leading-none">🤕</span>
                              <span>Sakit (Medical)</span>
                            </>
                          ) : request.type === 'Cuti' ? (
                            <>
                              <span className="text-base leading-none">✈️</span>
                              <span>Cuti Tahunan</span>
                            </>
                          ) : (
                            <>
                              <span className="text-base leading-none">📝</span>
                              <span>Izin Kepentingan</span>
                            </>
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block mb-1">Durasi Tanggal</span>
                        <span className="font-bold text-slate-700 flex items-center gap-1">
                          📅 {request.startDate} s/d {request.endDate}
                        </span>
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="space-y-1.5 bg-slate-50/30 p-3 rounded-xl border border-slate-100/30">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Alasan / Keterangan</span>
                      <p className="text-xs font-semibold text-slate-600 leading-relaxed italic">
                        "{request.reason}"
                      </p>
                    </div>

                  </div>

                  {/* Approve/Reject Controls (if Pending) */}
                  {request.status === 'Pending' ? (
                    <div className="flex flex-col sm:flex-row items-center gap-2 border-t border-slate-100/80 pt-4 mt-1">
                      <button
                        onClick={() => onApproveLeave(request.id)}
                        className="w-full sm:flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-2.5 rounded-xl flex items-center justify-center space-x-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>Setujui</span>
                      </button>
                      <button
                        onClick={() => onRejectLeave(request.id)}
                        className="w-full sm:flex-1 bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-600 font-black text-xs py-2.5 rounded-xl flex items-center justify-center space-x-1.5 transition-all active:scale-95 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                        <span>Tolak</span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-[10px] font-bold text-slate-400 text-right border-t border-slate-100/80 pt-3 italic">
                      ✓ Ditinjau pada {request.createdAt}
                    </div>
                  )}

                </div>
              ))
            )}
          </motion.div>
        )}

        {/* VIEW D: Employee Directory Management */}
        {activeTab === 'employees' && (
          <motion.div
            key="employees-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Header section with add form toggle */}
            <div className="flex justify-between items-center bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Daftar Karyawan</h4>
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">Kelola data karyawan & penugasan shift kerja</p>
              </div>
              
              <button
                id="toggle-add-emp-form-btn"
                onClick={() => setShowAddForm(!showAddForm)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Karyawan</span>
              </button>
            </div>

            {/* Inline Add Employee Form */}
            {showAddForm && (
              <motion.form 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                onSubmit={handleAddEmployeeSubmit}
                className="bg-slate-50 border border-slate-200 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-12 gap-5 items-start shadow-inner"
              >
                <div className="md:col-span-6 space-y-2">
                  <label htmlFor="new-emp-name" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nama Lengkap</label>
                  <input
                    type="text"
                    id="new-emp-name"
                    required
                    placeholder="Contoh: Hermawan Prasetyo"
                    value={newEmpName}
                    onChange={(e) => setNewEmpName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all text-slate-800"
                  />
                </div>

                <div className="md:col-span-6 space-y-2">
                  <label htmlFor="new-emp-role" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Jabatan / Peran (Role)</label>
                  {!isNewEmpRoleManual ? (
                    <select
                      id="new-emp-role"
                      required
                      value={newEmpRole}
                      onChange={(e) => {
                        if (e.target.value === 'custom_manual') {
                          setIsNewEmpRoleManual(true);
                          setNewEmpRole('');
                        } else {
                          setNewEmpRole(e.target.value);
                        }
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all text-slate-800 cursor-pointer"
                    >
                      <option value="">-- Pilih Jabatan / Peran --</option>
                      {customRoles.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                      <option value="custom_manual">✍️ Tulis Jabatan Manual...</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        id="new-emp-role"
                        required
                        placeholder="Ketik jabatan baru (misal: Keamanan)..."
                        value={newEmpRole}
                        onChange={(e) => setNewEmpRole(e.target.value)}
                        className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewEmpRoleManual(false);
                          setNewEmpRole('');
                        }}
                        className="px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 cursor-pointer"
                      >
                        Pilih
                      </button>
                    </div>
                  )}
                </div>

                <div className="md:col-span-4 space-y-2">
                  <label htmlFor="new-emp-nik" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">UID (NIK / No. Kartu)</label>
                  <input
                    type="text"
                    id="new-emp-nik"
                    placeholder="Contoh: DG01112008"
                    value={newEmpNik}
                    onChange={(e) => setNewEmpNik(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all text-slate-800"
                  />
                </div>

                <div className="md:col-span-4 space-y-2">
                  <label htmlFor="new-emp-phone" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">No. HP / Whatsapp</label>
                  <input
                    type="text"
                    id="new-emp-phone"
                    required
                    placeholder="Contoh: 083862024525"
                    value={newEmpPhone}
                    onChange={(e) => setNewEmpPhone(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all text-slate-800"
                  />
                </div>

                <div className="md:col-span-4 space-y-2">
                  <label htmlFor="new-emp-dept" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Divisi / Alamat Kantor</label>
                  <input
                    type="text"
                    id="new-emp-dept"
                    required
                    placeholder="Contoh: DG Komputer Palembang-Betung"
                    value={newEmpDept}
                    onChange={(e) => setNewEmpDept(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all text-slate-800"
                  />
                </div>

                <div className="md:col-span-12 space-y-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Foto Karyawan (Avatar Resmi)</label>
                  <div className="flex items-center space-x-3 bg-white p-3 rounded-xl border border-slate-200">
                    <label className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-4 py-2 text-xs font-bold text-slate-600 cursor-pointer transition-all active:scale-[0.98]">
                      <span>Unggah Foto Karyawan</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarFileChange}
                        className="hidden"
                      />
                    </label>
                    {newEmpAvatar ? (
                      <div className="flex items-center space-x-2">
                        <img 
                          src={newEmpAvatar} 
                          alt="Preview" 
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200" 
                        />
                        <span className="text-[10px] text-emerald-600 font-bold">✓ Foto Terunggah</span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium">Belum ada foto (akan menggunakan foto default)</span>
                    )}
                  </div>
                </div>

                <div className="md:col-span-12 flex justify-end space-x-2 pt-2 border-t border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-2.5 px-5 rounded-xl transition-all active:scale-95 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 px-6 rounded-xl shadow-md shadow-indigo-100 transition-all active:scale-95 cursor-pointer"
                  >
                    Simpan Karyawan
                  </button>
                </div>
              </motion.form>
            )}

            {/* Employee Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {employees.map((emp) => {
                const shift = SHIFTS.find(s => s.id === emp.activeShiftId) || SHIFTS[0];
                return (
                  <div key={emp.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex items-start space-x-4 hover:border-indigo-200 transition-all group">
                    <img 
                      src={emp.avatar} 
                      alt={emp.name} 
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-full object-cover border-2 border-slate-100 shadow-inner group-hover:scale-105 transition-transform"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-slate-800 block truncate">{emp.name}</span>
                        <button
                          onClick={() => {
                            if (window.confirm(`Hapus data karyawan ${emp.name}?`)) {
                              onDeleteEmployee(emp.id);
                            }
                          }}
                          className="text-slate-400 hover:text-rose-600 p-1.5 hover:bg-rose-50 rounded-lg transition-all shrink-0 ml-2"
                          title="Hapus Karyawan"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium block leading-tight mt-0.5">{emp.role}</span>
                      <span className="text-[10px] text-indigo-600 font-bold block mt-1">Divisi {emp.department}</span>
                      <span className="text-[9px] text-slate-400 font-mono block mt-0.5">{emp.phone}</span>
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setSelectedIdCardEmp(emp)}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 py-1 px-2 rounded bg-indigo-50 hover:bg-indigo-100 transition-all"
                        >
                          <span>💳 Lihat ID Card</span>
                        </button>
                        <span className="text-[9px] font-mono text-slate-300">NIK: {emp.nik || 'DG01112...'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}


        {/* VIEW E: Settings Management Tab */}
        {activeTab === 'settings' && (
          <motion.div
            key="settings-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {/* Box 4: Tutup Website Absensi (Kunci Sistem) */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4 md:col-span-2">
              <div className="flex items-center space-x-2.5 border-b border-slate-100 pb-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${isAbsensiClosed ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {isAbsensiClosed ? '🔒' : '🔓'}
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Status Operasional Website Absensi (Buka / Tutup)</h4>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">Kontrol Akses Karyawan untuk Melakukan Absen Masuk & Pulang</p>
                </div>
              </div>

              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-50 p-4.5 rounded-2xl border border-slate-100">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center space-x-2">
                    <span className={`w-2.5 h-2.5 rounded-full inline-block ${isAbsensiClosed ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
                      Sistem Saat Ini: {isAbsensiClosed ? 'DITUTUP (TIDAK BISA ABSEN)' : 'DIBUKA (NORMAL)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                    {isAbsensiClosed 
                      ? 'Saat ditutup, seluruh tombol absen masuk, absen pulang, dan izin pada portal karyawan dinonaktifkan secara total. Cocok diaktifkan pada malam hari atau di luar jam kerja agar tidak ada karyawan yang iseng absen dari luar jam operasional.'
                      : 'Saat dibuka, semua karyawan dapat menggunakan portal absensi masuk/pulang/izin seperti biasa jika koordinat GPS mereka memenuhi ketentuan radius kantor.'
                    }
                  </p>
                </div>

                <div className="shrink-0 flex items-center space-x-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                  <span className="text-xs font-bold text-slate-600">Status Akses:</span>
                  <button
                    type="button"
                    onClick={() => onToggleAbsensiClosed?.(!isAbsensiClosed)}
                    className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isAbsensiClosed ? 'bg-rose-600' : 'bg-emerald-500'}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isAbsensiClosed ? 'translate-x-6' : 'translate-x-0'}`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Box 1: Update Admin Credentials */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
              <div className="flex items-center space-x-2.5 border-b border-slate-100 pb-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  🔐
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Ganti Kredensial Admin</h4>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">Ubah Username & Password Akses Admin</p>
                </div>
              </div>

              {credentialSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl">
                  {credentialSuccessMsg}
                </div>
              )}
              {credentialErrorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-xl">
                  {credentialErrorMsg}
                </div>
              )}

              <form onSubmit={handleUpdateCredentialsSubmit} className="space-y-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <div>
                  <label className="block mb-1 text-[10px]">Username Baru</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: admin_baru"
                    value={newAdminUsername}
                    onChange={e => setNewAdminUsername(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 tracking-normal normal-case"
                  />
                </div>

                <div>
                  <label className="block mb-1 text-[10px]">Password Baru</label>
                  <input
                    type="password"
                    required
                    placeholder="Minimal 5 karakter"
                    value={newAdminPassword}
                    onChange={e => setNewAdminPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 tracking-normal normal-case"
                  />
                </div>

                <div>
                  <label className="block mb-1 text-[10px]">Konfirmasi Password Baru</label>
                  <input
                    type="password"
                    required
                    placeholder="Ulangi password baru"
                    value={confirmAdminPassword}
                    onChange={e => setConfirmAdminPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 tracking-normal normal-case"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm active:scale-95"
                >
                  Simpan Perubahan Kredensial
                </button>
              </form>
            </div>

            {/* Box 2: Geofencing Store Location Settings */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
              <div className="flex items-center space-x-2.5 border-b border-slate-100 pb-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  📍
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Pengaturan Lokasi & Radius Kantor</h4>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">Tentukan Titik Koordinat GPS Batas Absensi</p>
                </div>
              </div>

              <form onSubmit={handleSaveStoreLocation} className="space-y-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <div>
                  <label className="block mb-1 text-[10px]">Nama Lokasi Kantor</label>
                  <input
                    type="text"
                    required
                    value={editStoreName}
                    onChange={e => setEditStoreName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 tracking-normal normal-case"
                  />
                </div>

                <div>
                  <label className="block mb-1 text-[10px]">Alamat Lengkap Kantor</label>
                  <textarea
                    required
                    rows={2}
                    value={editStoreAddress}
                    onChange={e => setEditStoreAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 tracking-normal normal-case"
                  />
                </div>

                <div>
                  <label className="block mb-1 text-[10px]">Koordinat GPS (Format: Latitude, Longitude)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Contoh: -2.990422, 104.755433"
                      value={editStoreCoords}
                      onChange={e => setEditStoreCoords(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 tracking-normal normal-case font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleGetCurrentLocation}
                      className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-150 px-3.5 rounded-xl text-[10px] font-extrabold transition-all flex items-center gap-1 shrink-0 active:scale-95 cursor-pointer"
                    >
                      📍 Dapatkan GPS HP
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium mt-1 normal-case leading-relaxed">
                    💡 Cara Salin: Di Google Maps, klik kanan titik lokasi kantor Anda dan salin koordinatnya, ATAU jika Anda sedang berada di dalam toko/kantor sekarang, cukup klik tombol <strong className="text-slate-600">📍 Dapatkan GPS HP</strong> di atas untuk merekam koordinat Anda saat ini secara instan dan 100% presisi!
                  </p>
                </div>

                <div>
                  <label className="block mb-1 text-[10px]">Radius Kehadiran Maksimal (Meter)</label>
                  <input
                    type="number"
                    required
                    value={editStoreRadius}
                    onChange={e => setEditStoreRadius(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 tracking-normal normal-case font-mono"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm active:scale-95"
                >
                  Simpan Konfigurasi GPS
                </button>
              </form>
            </div>





            {/* Box 6: Danger Zone (Zona Bahaya) */}
            <div className="bg-rose-50/30 rounded-3xl p-6 border border-rose-100 shadow-sm space-y-4 md:col-span-2">
              <div className="flex items-center space-x-2.5 border-b border-rose-100 pb-3">
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  ⚠️
                </div>
                <div>
                  <h4 className="font-bold text-rose-900 text-sm">Zona Bahaya (Danger Zone)</h4>
                  <p className="text-[10px] text-rose-500 font-semibold uppercase tracking-wider mt-0.5">Tindakan Destruktif & Pembersihan Data Absensi</p>
                </div>
              </div>

              {/* Option 1: Hapus Semua Riwayat Absensi */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4.5 rounded-2xl border border-rose-100">
                <div className="space-y-1">
                  <h5 className="text-xs font-extrabold text-slate-800 uppercase">Hapus Semua Riwayat Absensi</h5>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                    Tindakan ini akan menghapus seluruh data riwayat absensi masuk, pulang, dan istirahat semua karyawan secara total (permanen) baik di penyimpanan lokal maupun di database online Supabase.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('⚠️ PERINGATAN: Apakah Anda yakin ingin menghapus SEMUA riwayat absensi karyawan? Tindakan ini akan mengosongkan seluruh database absensi secara permanen dan tidak dapat dibatalkan!')) {
                      onClearAllLogs?.();
                      alert('✓ Seluruh riwayat absensi berhasil dihapus. Database sekarang kosong dan siap digunakan dari awal!');
                    }
                  }}
                  className="shrink-0 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  Hapus Semua Riwayat
                </button>
              </div>

              {/* Option 2: Hapus Semua Data Karyawan */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4.5 rounded-2xl border border-rose-100">
                <div className="space-y-1">
                  <h5 className="text-xs font-extrabold text-slate-800 uppercase">Hapus Semua Data Karyawan</h5>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                    Tindakan ini akan menghapus semua akun karyawan secara permanen baik di lokal maupun online.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('⚠️ PERINGATAN: Apakah Anda yakin ingin menghapus SEMUA data karyawan? Semua akun karyawan akan terhapus secara permanen!')) {
                      onClearAllEmployees?.();
                      alert('✓ Semua data karyawan berhasil dihapus.');
                    }
                  }}
                  className="shrink-0 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  Hapus Semua Karyawan
                </button>
              </div>

              {/* Option 3: Hapus Semua Pengajuan Cuti/Izin */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4.5 rounded-2xl border border-rose-100">
                <div className="space-y-1">
                  <h5 className="text-xs font-extrabold text-slate-800 uppercase">Hapus Semua Pengajuan Izin/Cuti</h5>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                    Tindakan ini akan menghapus semua riwayat pengajuan izin sakit, cuti harian, dan dinas luar secara permanen.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('⚠️ PERINGATAN: Apakah Anda yakin ingin menghapus SEMUA pengajuan izin/cuti karyawan?')) {
                      onClearAllLeaves?.();
                      alert('✓ Semua pengajuan izin/cuti berhasil dihapus.');
                    }
                  }}
                  className="shrink-0 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  Hapus Semua Izin/Cuti
                </button>
              </div>

              {/* Option 4: Hapus Semua Notifikasi Admin */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4.5 rounded-2xl border border-rose-100">
                <div className="space-y-1">
                  <h5 className="text-xs font-extrabold text-slate-800 uppercase">Hapus Semua Notifikasi Admin</h5>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                    Tindakan ini akan mengosongkan riwayat semua notifikasi dan aktivitas admin di panel.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Apakah Anda yakin ingin menghapus semua notifikasi admin?')) {
                      onUpdateNotifications?.([]);
                      alert('✓ Semua notifikasi admin berhasil dibersihkan.');
                    }
                  }}
                  className="shrink-0 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  Hapus Notifikasi
                </button>
              </div>

              {/* Option 5: RESET TOTAL APLIKASI (MULAI DARI NOL) */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-rose-100/50 p-4.5 rounded-2xl border border-rose-200">
                <div className="space-y-1">
                  <h5 className="text-xs font-extrabold text-rose-800 uppercase">💥 Reset Total Aplikasi (Mulai Dari Nol)</h5>
                  <p className="text-[11px] text-rose-700 leading-relaxed font-medium">
                    Tindakan pamungkas: Hapus semua karyawan, semua riwayat absensi, semua izin/cuti, dan semua notifikasi sekaligus untuk memulai sistem absensi segar dari nol.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    if (window.confirm('⚠️⚠️ PERINGATAN SANGAT PENTING: Apakah Anda benar-benar ingin mereset TOTAL seluruh aplikasi? Semua data karyawan, riwayat absensi, izin/cuti, dan notifikasi akan DIHAPUS PERMANEN!')) {
                      onClearAllLogs?.();
                      onClearAllEmployees?.();
                      onClearAllLeaves?.();
                      onUpdateNotifications?.([]);
                      alert('✓ Selesai! Seluruh aplikasi berhasil di-reset total ke keadaan kosong yang segar (fresh).');
                    }
                  }}
                  className="shrink-0 bg-rose-700 hover:bg-rose-800 text-white font-black text-xs px-5 py-3 rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer uppercase tracking-wider"
                >
                  Reset Total Aplikasi
                </button>
              </div>

            </div>

          </motion.div>
        )}

        {activeTab === 'company_info' && (
          <motion.div
            key="company-info-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {/* Box 1: Nama Store / Perusahaan */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
              <div className="flex items-center space-x-2.5 border-b border-slate-100 pb-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  🏬
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Nama Store & Perusahaan</h4>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">Ubah Nama Resmi Toko / Perusahaan Anda</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <label className="block mb-1 text-[10px]">Nama Toko / Perusahaan Saat Ini</label>
                  <input
                    type="text"
                    value={editStoreName}
                    onChange={(e) => setEditStoreName(e.target.value)}
                    placeholder="Contoh: DG Komputer Palembang-Betung"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 tracking-normal normal-case"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!editStoreName.trim()) {
                      alert('Nama store/perusahaan tidak boleh kosong!');
                      return;
                    }
                    onUpdateStoreLocation({
                      ...storeLocation,
                      name: editStoreName.trim(),
                    });
                    alert('✓ Nama store/perusahaan berhasil diperbarui!');
                  }}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  Simpan Nama Perusahaan
                </button>
              </div>
            </div>

            {/* Box 2: Logo Perusahaan */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
              <div className="flex items-center space-x-2.5 border-b border-slate-100 pb-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  🖼️
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Logo Perusahaan</h4>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">Ubah Logo yang Ditampilkan di Aplikasi & ID Card</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-5">
                {/* Logo Live Preview */}
                <div className="flex flex-col items-center shrink-0">
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider mb-2">Live Preview</span>
                  <div className="w-24 h-24 rounded-2xl border-2 border-slate-100 bg-slate-50 flex items-center justify-center overflow-hidden shadow-inner p-1">
                    <img
                      src={systemLogo || defaultLogo}
                      alt="Preview Logo"
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = defaultLogo;
                      }}
                    />
                  </div>
                </div>

                <div className="flex-1 w-full space-y-3.5">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <label className="block mb-1 text-[10px]">Tulis URL Link Logo</label>
                    <input
                      type="url"
                      value={systemLogo}
                      onChange={(e) => onUpdateLogo?.(e.target.value)}
                      placeholder="Masukkan link gambar (https://...)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 tracking-normal normal-case font-mono"
                    />
                  </div>

                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <label className="block mb-1 text-[10px]">Atau Unggah File Logo</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            if (typeof reader.result === 'string') {
                              onUpdateLogo?.(reader.result);
                              alert('✓ File logo berhasil diunggah dan dikonversi!');
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="w-full text-xs font-medium text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Box 3: Edit Role Karyawan */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4 md:col-span-2">
              <div className="flex items-center space-x-2.5 border-b border-slate-100 pb-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  👔
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Manajemen Jabatan & Peran (Role)</h4>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">Ubah Jabatan (Role) Semua Karyawan secara Instan</p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-100 font-sans">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100">
                      <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Karyawan</th>
                      <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">ID / NIK</th>
                      <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Jabatan / Role Saat Ini</th>
                      <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Ubah Jabatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-50/40 transition-all">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center space-x-3">
                            <img
                              src={emp.avatar}
                              alt={emp.name}
                              className="w-8 h-8 rounded-full object-cover border border-slate-100"
                              referrerPolicy="no-referrer"
                            />
                            <span className="text-xs font-bold text-slate-800">{emp.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="text-[10px] text-slate-400 font-mono">{emp.id}</div>
                          <div className="text-[9px] text-slate-300 font-mono mt-0.5">NIK: {emp.nik || '-'}</div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100/40">
                            {emp.role}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            <select
                              id={`role-select-${emp.id}`}
                              value={customRoles.includes(emp.role) ? emp.role : 'custom_manual'}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'custom_manual') {
                                  const customVal = prompt(`Ketik jabatan kustom baru untuk ${emp.name}:`, emp.role);
                                  if (customVal && customVal.trim()) {
                                    onUpdateEmployee?.({
                                      ...emp,
                                      role: customVal.trim()
                                    });
                                    alert(`✓ Jabatan ${emp.name} berhasil diganti menjadi: ${customVal.trim()}`);
                                  }
                                } else {
                                  onUpdateEmployee?.({
                                    ...emp,
                                    role: val
                                  });
                                  alert(`✓ Jabatan ${emp.name} berhasil diganti menjadi: ${val}`);
                                }
                              }}
                              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500/40 focus:bg-white tracking-normal w-36 sm:w-48 cursor-pointer"
                            >
                              {customRoles.map((role) => (
                                <option key={role} value={role}>{role}</option>
                              ))}
                              {!customRoles.includes(emp.role) && (
                                <option value={emp.role}>{emp.role} (Kustom)</option>
                              )}
                              <option value="custom_manual">✍️ Ketik Kustom...</option>
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Box 4: Kelola Daftar Jabatan Perusahaan */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4 md:col-span-2">
              <div className="flex items-center space-x-2.5 border-b border-slate-100 pb-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  💼
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Daftar Jabatan Resmi</h4>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">Tambah / Hapus Jabatan yang Tersedia di Perusahaan</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                {/* Form Tambah Jabatan */}
                <div className="md:col-span-5 space-y-2">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tambah Jabatan Baru</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      id="new-custom-position-input"
                      placeholder="Contoh: Keamanan, Kasir, Kurir..."
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = document.getElementById('new-custom-position-input') as HTMLInputElement;
                          if (input && input.value.trim()) {
                            const success = await onAddPosition?.(input.value.trim());
                            if (success) {
                              alert(`✓ Jabatan "${input.value.trim()}" berhasil ditambahkan!`);
                              input.value = '';
                            } else {
                              alert('Jabatan sudah terdaftar atau tidak valid!');
                            }
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const input = document.getElementById('new-custom-position-input') as HTMLInputElement;
                        if (input && input.value.trim()) {
                          const success = await onAddPosition?.(input.value.trim());
                          if (success) {
                            alert(`✓ Jabatan "${input.value.trim()}" berhasil ditambahkan!`);
                            input.value = '';
                          } else {
                            alert('Jabatan sudah terdaftar atau tidak valid!');
                          }
                        } else {
                          alert('Ketik nama jabatan terlebih dahulu!');
                        }
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer shrink-0"
                    >
                      Tambah
                    </button>
                  </div>
                </div>

                {/* List Jabatan */}
                <div className="md:col-span-7 space-y-2">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Jabatan Resmi Saat Ini ({customRoles.length})</span>
                  <div className="flex flex-wrap gap-2 p-3 bg-slate-50/50 rounded-2xl border border-slate-100 min-h-[48px]">
                    {customRoles.map((role) => (
                      <div 
                        key={role}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200/60 shadow-xs text-xs font-bold text-slate-700 transition-all hover:border-slate-300"
                      >
                        <span>{role}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm(`Apakah Anda yakin ingin menghapus jabatan "${role}" dari daftar resmi?`)) {
                              await onDeletePosition?.(role);
                              alert(`✓ Jabatan "${role}" berhasil dihapus dari daftar resmi!`);
                            }
                          }}
                          className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer shrink-0 p-0.5 rounded ml-0.5"
                          title="Hapus jabatan"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* 5. Photographic Selfie Zoom lightbox */}
      {selectedSelfie && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4" onClick={() => setSelectedSelfie(null)}>
          <div className="relative max-w-sm w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800" onClick={e => e.stopPropagation()}>
            <img 
              src={selectedSelfie} 
              alt="Zoomed Face Verification" 
              referrerPolicy="no-referrer"
              className="w-full aspect-4/3 object-cover"
            />
            <div className="p-4 flex justify-between items-center bg-slate-900">
              <span className="text-[10px] text-emerald-400 font-mono font-bold tracking-wider">✔ BIOMETRIC ID SIGNATURE VERIFIED</span>
              <button
                onClick={() => setSelectedSelfie(null)}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition-all"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5b. Interactive Employee Location Map Modal */}
      {selectedMapLog && selectedMapLog.latitude && selectedMapLog.longitude && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4" onClick={() => setSelectedMapLog(null)}>
          <div className="relative max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col" onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center border border-indigo-100 text-indigo-600 font-bold shrink-0">
                  {selectedMapLog.employeeName.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm leading-tight">Detail Lokasi Presensi {selectedMapLog.employeeName}</h3>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                    {new Date(selectedMapLog.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} • {selectedMapLog.shiftName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedMapLog(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: The Map */}
            <div className="p-5 space-y-4">
              <div className="w-full h-[340px] rounded-xl overflow-hidden border border-slate-100 relative">
                <EmployeeLocationMap
                  latitude={selectedMapLog.latitude}
                  longitude={selectedMapLog.longitude}
                  employeeName={selectedMapLog.employeeName}
                  actionType={selectedMapLog.status === 'Pulang' ? 'Clock Out (Pulang)' : 'Clock In (Masuk)'}
                  timeStr={selectedMapLog.status === 'Pulang' ? selectedMapLog.clockOut : selectedMapLog.clockIn}
                  storeLatitude={storeLocation.latitude}
                  storeLongitude={storeLocation.longitude}
                  storeRadius={storeLocation.radius}
                  storeName={storeLocation.name}
                />
              </div>

              {/* Attendance Meta Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Titik Karyawan</span>
                  <div className="font-medium text-slate-700 font-mono mt-0.5">
                    {selectedMapLog.latitude.toFixed(6)}, {selectedMapLog.longitude.toFixed(6)}
                  </div>
                  {selectedMapLog.address && (
                    <span className="text-[10px] text-slate-500 block mt-1 leading-normal italic">
                      📍 {selectedMapLog.address}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Catatan Sistem</span>
                  <p className="text-slate-600 mt-0.5 leading-relaxed font-medium">
                    {selectedMapLog.notes || 'Presensi dilakukan melalui verifikasi GPS dan perangkat pintar.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/50">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${selectedMapLog.latitude},${selectedMapLog.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/80 px-3.5 py-2 rounded-lg transition-all inline-flex items-center gap-1.5"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Buka di Google Maps</span>
              </a>
              <button
                onClick={() => setSelectedMapLog(null)}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-xs"
              >
                Tutup
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 6. Kartu Pegawai (ID Card / KTP Style) Modal Viewer */}
      {selectedIdCardEmp && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setSelectedIdCardEmp(null)}>
          <div className="relative max-w-3xl w-full bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 p-6 space-y-6" onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2">
                <span className="text-xl">💳</span>
                <div>
                  <h3 className="font-bold text-white text-sm">Pratinjau Kartu Pegawai (KTP Style)</h3>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Desain Kartu Pegawai Resmi DG KOMPUTER</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedIdCardEmp(null)}
                className="text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Print Media Style Helper */}
            <style dangerouslySetInnerHTML={{ __html: `
              @media print {
                body {
                  background: white !important;
                  color: black !important;
                }
                .no-print {
                  display: none !important;
                }
                .print-card-container {
                  position: absolute;
                  left: 50%;
                  top: 50%;
                  transform: translate(-50%, -50%) scale(1.1);
                  width: 100% !important;
                  max-width: 650px !important;
                  box-shadow: none !important;
                  border: none !important;
                }
              }
            `}} />

            {/* THE ID CARD EMBEDDED AREA */}
            <div className="flex justify-center py-4 print-card-container">
              <div 
                id="id-card-print-area"
                className="w-full max-w-[680px] bg-gradient-to-br from-white via-blue-50/50 to-indigo-50/50 rounded-3xl border-4 border-blue-600 shadow-2xl p-6 text-slate-800 font-sans flex flex-col md:flex-row gap-6 relative overflow-hidden text-left"
              >
                {/* Background decorative glowing patterns */}
                <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>
                <div className="absolute -left-12 -bottom-12 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none"></div>
                <div className="absolute inset-0 bg-[radial-gradient(#3b82f608_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none"></div>

                {/* Left Side: Photo Column */}
                <div className="w-full md:w-[200px] flex flex-col items-center shrink-0">
                  <div className="w-full aspect-[3/4] bg-slate-100 border-4 border-blue-200 rounded-2xl overflow-hidden shadow-md relative">
                    <img 
                      src={selectedIdCardEmp.avatar} 
                      alt={selectedIdCardEmp.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                    />
                  </div>
                  
                  {/* Name and Role bottom badge */}
                  <div className="w-full bg-blue-600 border border-blue-500 mt-4 rounded-xl p-3 text-center space-y-1 shadow-md">
                    <h4 className="font-bold text-xs tracking-tight text-white truncate uppercase">
                      {selectedIdCardEmp.name}
                    </h4>
                    <p className="text-[10px] font-extrabold text-blue-100 tracking-widest uppercase font-mono">
                      {selectedIdCardEmp.role}
                    </p>
                  </div>
                </div>

                {/* Right Side: Details & Info Column */}
                <div className="flex-1 flex flex-col justify-between space-y-4">
                  {/* Header info */}
                  <div className="flex items-center space-x-3 pb-3 border-b border-blue-100">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden ${systemLogo ? 'bg-white border border-slate-200' : 'bg-blue-50 border border-blue-200'}`}>
                      <img src={systemLogo || defaultLogo} alt="Logo" className={`w-full h-full ${systemLogo ? 'object-contain p-0.5' : 'object-cover p-1'}`} referrerPolicy="no-referrer" crossOrigin="anonymous" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-sm text-blue-950 tracking-wider uppercase leading-none">DG KOMPUTER</h3>
                      <p className="text-[8px] text-slate-500 leading-tight mt-1 font-medium">
                        Jl. Palembang-Betung, LK.IV Kel.Rimba Asam, Kec.Betung, Kab.Banyuasin. 30958
                      </p>
                    </div>
                  </div>

                  {/* Title of the card */}
                  <div className="text-center">
                    <span className="text-[11px] font-black tracking-[0.2em] text-blue-700 uppercase bg-blue-50 px-4 py-1.5 rounded-full border border-blue-100">
                      KARTU PEGAWAI
                    </span>
                  </div>

                  {/* Information Fields */}
                  <div className="space-y-2.5 pt-2">
                    {/* Field 1: Name */}
                    <div className="flex items-center bg-white border border-blue-100/70 shadow-xs rounded-xl px-3.5 py-2">
                      <User className="w-4 h-4 text-blue-600 mr-2.5 shrink-0" />
                      <span className="text-xs text-blue-200 font-black mr-2.5">|</span>
                      <span className="text-xs font-bold text-slate-800 truncate uppercase">{selectedIdCardEmp.name}</span>
                    </div>

                    {/* Field 2: Role */}
                    <div className="flex items-center bg-white border border-blue-100/70 shadow-xs rounded-xl px-3.5 py-2">
                      <Tag className="w-4 h-4 text-blue-600 mr-2.5 shrink-0" />
                      <span className="text-xs text-blue-200 font-black mr-2.5">|</span>
                      <span className="text-xs font-bold text-slate-800 truncate">{selectedIdCardEmp.role}</span>
                    </div>

                    {/* Field 3: NIK/ID */}
                    <div className="flex items-center bg-white border border-blue-100/70 shadow-xs rounded-xl px-3.5 py-2">
                      <Calendar className="w-4 h-4 text-blue-600 mr-2.5 shrink-0" />
                      <span className="text-xs text-blue-200 font-black mr-2.5">|</span>
                      <span className="text-xs font-mono font-bold text-blue-700">{selectedIdCardEmp.nik || `DG01112${selectedIdCardEmp.id}`}</span>
                    </div>

                    {/* Field 4: Phone */}
                    <div className="flex items-center bg-white border border-blue-100/70 shadow-xs rounded-xl px-3.5 py-2">
                      <Phone className="w-4 h-4 text-blue-600 mr-2.5 shrink-0" />
                      <span className="text-xs text-blue-200 font-black mr-2.5">|</span>
                      <span className="text-xs font-bold text-slate-800">{selectedIdCardEmp.phone}</span>
                    </div>
                  </div>

                  {/* Footer Section of card */}
                  <div className="flex items-end justify-between pt-3 border-t border-blue-100 mt-2">
                    {/* Active Status Indicator */}
                    <div className="flex items-center space-x-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                      <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Aktif</span>
                    </div>

                    {/* QR Code section */}
                    <div className="flex items-center space-x-2 bg-blue-50/50 border border-blue-100/70 p-1.5 rounded-xl">
                      <div className="text-right">
                        <p className="text-[7px] text-slate-400 uppercase font-bold">Scan QR</p>
                        <p className="text-[8px] text-blue-900 font-mono font-extrabold">{selectedIdCardEmp.nik || `DG01112${selectedIdCardEmp.id}`}</p>
                      </div>
                      <PremiumQRCode value={selectedIdCardEmp.nik || `DG01112${selectedIdCardEmp.id}`} />
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end space-x-2 border-t border-slate-800 pt-4 no-print">
              <button
                onClick={() => setSelectedIdCardEmp(null)}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all"
              >
                Tutup
              </button>
              <button
                onClick={handleDownloadJpg}
                disabled={isCardDownloading}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all active:scale-95 flex items-center space-x-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                {isCardDownloading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Mengunduh...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Unduh JPG</span>
                  </>
                )}
              </button>
              <button
                onClick={() => window.print()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all active:scale-95 flex items-center space-x-1.5"
              >
                <span>🖨 Cetak Kartu</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

// Premium QR Code generator for high-fidelity ID Cards using real QR Code standard
function PremiumQRCode({ value }: { value: string }) {
  const [qrUrl, setQrUrl] = useState<string>('');

  useEffect(() => {
    QRCode.toDataURL(value, {
      margin: 1,
      width: 256,
      color: {
        dark: '#0f172a', // deep slate
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    })
      .then(url => setQrUrl(url))
      .catch(err => console.error('QR Gen error:', err));
  }, [value]);

  return (
    <div className="relative w-12 h-12 bg-white rounded-xl p-1 shadow-xs flex items-center justify-center shrink-0 border border-slate-100 overflow-hidden">
      {qrUrl ? (
        <img src={qrUrl} alt="QR Code" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
      ) : (
        <div className="w-full h-full bg-slate-100 animate-pulse rounded-lg" />
      )}
    </div>
  );
}
