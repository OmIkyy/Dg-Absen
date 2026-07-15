import React, { useState, useEffect } from 'react';
import { Employee, AttendanceLog, LeaveRequest, StoreLocation, SAMPLE_EMPLOYEES, generateSampleLogs, SAMPLE_LEAVES, DEFAULT_STORE_LOCATION, AdminNotification } from './types';
import Header from './components/Header';
import ClockInOut from './components/ClockInOut';
import AdminPanel from './components/AdminPanel';
import { QrCode, ClipboardList, Volume2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { initGlobalClickSound, playNotificationSound } from './utils/sound';
import { 
  supabase,
  isSupabaseConfigured,
  getSupabaseEmployees,
  upsertSupabaseEmployee,
  deleteSupabaseEmployee,
  getSupabaseLogs,
  upsertSupabaseLog,
  deleteSupabaseLog,
  clearAllSupabaseLogs,
  clearAllSupabaseLeaves,
  clearAllSupabaseEmployees,
  getSupabaseLeaves,
  upsertSupabaseLeave,
  getSupabaseStoreLocation,
  updateSupabaseStoreLocation,
  getSupabasePositions,
  addSupabasePosition,
  deleteSupabasePosition,
  getSupabaseAlarmSettings
} from './utils/supabaseClient';

const getLocalDateString = (d: Date = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isStoreLocationEqual = (a: StoreLocation, b: StoreLocation) => {
  return (
    a.name === b.name &&
    a.address === b.address &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude &&
    a.radius === b.radius &&
    (a.isClosed || false) === (b.isClosed || false)
  );
};


export default function App() {
  const [activeTab, setActiveTab] = useState<'employee' | 'admin' | '404'>('employee');
  const [employeeSubTab, setEmployeeSubTab] = useState<'clock' | 'leave'>('clock');
  const [isLockedEmployee, setIsLockedEmployee] = useState<boolean>(false);
  const sessionStartTime = React.useRef<number>(Date.now());
  const lastLocalUpdateRef = React.useRef<number>(0);

  const [activeNotification, setActiveNotification] = useState<{
    id: string;
    senderName: string;
    senderAvatar: string;
    type: 'masuk' | 'pulang' | 'admin';
    title?: string;
    body?: string;
    timestamp: number;
  } | null>(null);

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      utterance.rate = 1.0;
      utterance.volume = 1.0;
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 15);
    }
  };

  const triggerNotification = (payload: { senderName: string; senderAvatar: string; type: 'masuk' | 'pulang' }) => {
    playNotificationSound();
    
    const textMsg = payload.type === 'masuk'
      ? `${payload.senderName} mengingatkan yang lain untuk jangan lupa absen masuk hari ini.`
      : `${payload.senderName} mengingatkan yang lain untuk jangan lupa absen pulang sebelum pulang.`;
    speakText(textMsg);
    
    setActiveNotification({
      id: `remind-${Date.now()}`,
      senderName: payload.senderName,
      senderAvatar: payload.senderAvatar,
      type: payload.type,
      timestamp: Date.now()
    });
  };
  
  // Track network connection status dynamically
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // Hidden admin access flag to hide/show the "Dashboard Admin" navigation option
  // Strictly URL-based (must type #admin in the browser address bar) and not persisted in localStorage
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    return window.location.hash === '#admin';
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Hash Router to preserve active page state upon browser refreshes
  useEffect(() => {
    const syncTabFromHash = () => {
      const hash = window.location.hash || '#employee';
      if (hash === '#admin') {
        setIsAdminUnlocked(true);
        setActiveTab('admin');
      } else if (hash === '#employee') {
        setActiveTab('employee');
      } else if (hash === '#not-found' || hash.startsWith('#404')) {
        setActiveTab('404');
      } else {
        // Fallback or custom 404
        setActiveTab('employee');
      }
    };

    syncTabFromHash();
    window.addEventListener('hashchange', syncTabFromHash);
    return () => window.removeEventListener('hashchange', syncTabFromHash);
  }, []);

  const handleSetTab = (tab: 'employee' | 'admin' | '404') => {
    setActiveTab(tab);
    window.location.hash = tab === '404' ? '#not-found' : `#${tab}`;
  };

  // Set up global click sound feedback
  useEffect(() => {
    const cleanup = initGlobalClickSound();
    
    return () => {
      cleanup();
    };
  }, []);

  // Auto-dismiss active notifications after 10 seconds
  useEffect(() => {
    if (activeNotification) {
      const timer = setTimeout(() => {
        setActiveNotification(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [activeNotification]);

  // Automated background scheduler for daily reminder announcements (08:00 and 17:00)
  useEffect(() => {
    const checkAutomatedReminders = () => {
      const now = new Date();
      const currentHour = now.getHours();
      const todayStr = getLocalDateString(now);

      // 08:00 - 08:59 slot for Masuk reminder
      if (currentHour === 8) {
        const key = `absensi_auto_remind_08_${todayStr}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, 'true');
          
          playNotificationSound();
          const voiceMsg = "Perhatian kepada seluruh rekan kerja, jam sudah menunjukkan jam delapan pagi. Jangan lupa untuk melakukan absen masuk hari ini. Terima kasih.";
          speakText(voiceMsg);

          setActiveNotification({
            id: `auto-remind-masuk-${Date.now()}`,
            senderName: "Sistem DG-Komputer",
            senderAvatar: "", // System bot avatar
            type: "masuk",
            timestamp: Date.now()
          });
        }
      }

      // 17:00 - 17:59 slot for Pulang reminder
      if (currentHour === 17) {
        const key = `absensi_auto_remind_17_${todayStr}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, 'true');
          
          playNotificationSound();
          const voiceMsg = "Perhatian kepada seluruh rekan kerja, jam sudah menunjukkan jam lima sore. Jangan lupa untuk melakukan absen pulang sebelum meninggalkan tempat kerja. Terima kasih.";
          speakText(voiceMsg);

          setActiveNotification({
            id: `auto-remind-pulang-${Date.now()}`,
            senderName: "Sistem DG-Komputer",
            senderAvatar: "", // System bot avatar
            type: "pulang",
            timestamp: Date.now()
          });
        }
      }
    };

    // Run check immediately on mount and then every 30 seconds
    checkAutomatedReminders();
    const interval = setInterval(checkAutomatedReminders, 30000);
    return () => clearInterval(interval);
  }, []);
  
  // Persistent Database States in LocalStorage
  const [employeesState, setEmployeesState] = useState<Employee[]>([]);
  const [logsState, setLogsState] = useState<AttendanceLog[]>([]);
  const [leaveRequestsState, setLeaveRequestsState] = useState<LeaveRequest[]>([]);

  // Wrapper functions to auto-filter deleted records
  const setEmployees = (val: Employee[]) => {
    const stored = localStorage.getItem('absensi_deleted_employee_ids');
    const deletedIds: string[] = stored ? JSON.parse(stored) : [];
    setEmployeesState(val.filter(emp => !deletedIds.includes(emp.id)));
  };

  const setLogs = (val: AttendanceLog[]) => {
    const stored = localStorage.getItem('absensi_deleted_log_ids');
    const deletedIds: string[] = stored ? JSON.parse(stored) : [];
    setLogsState(val.filter(log => !deletedIds.includes(log.id)));
  };

  const setLeaveRequests = (val: LeaveRequest[]) => {
    const stored = localStorage.getItem('absensi_deleted_leave_ids');
    const deletedIds: string[] = stored ? JSON.parse(stored) : [];
    setLeaveRequestsState(val.filter(req => !deletedIds.includes(req.id)));
  };

  // Map state values to original names for seamless compatibility
  const employees = employeesState;
  const logs = logsState;
  const leaveRequests = leaveRequestsState;
  const [storeLocation, setStoreLocation] = useState<StoreLocation>(DEFAULT_STORE_LOCATION);
  const [customRoles, setCustomRoles] = useState<string[]>(['Teknisi', 'Senior IT Support', 'Finance Officer', 'Sales Specialist', 'HR Manager', 'Keamanan']);

  const handleAddPosition = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (customRoles.includes(trimmed)) return false;
    const updated = [...customRoles, trimmed];
    setCustomRoles(updated);
    localStorage.setItem('absensi_custom_roles', JSON.stringify(updated));
    if (isSupabaseConfigured()) {
      await addSupabasePosition(trimmed);
    }
    return true;
  };

  const handleDeletePosition = async (name: string) => {
    const updated = customRoles.filter(role => role !== name);
    setCustomRoles(updated);
    localStorage.setItem('absensi_custom_roles', JSON.stringify(updated));
    if (isSupabaseConfigured()) {
      await deleteSupabasePosition(name);
    }
    return true;
  };

  // Keep track of deleted items to prevent stale Supabase database entries from bringing them back
  const [deletedEmployeeIds, setDeletedEmployeeIds] = useState<string[]>(() => {
    const stored = localStorage.getItem('absensi_deleted_employee_ids');
    return stored ? JSON.parse(stored) : [];
  });
  const [deletedLogIds, setDeletedLogIds] = useState<string[]>(() => {
    const stored = localStorage.getItem('absensi_deleted_log_ids');
    return stored ? JSON.parse(stored) : [];
  });
  const [deletedLeaveIds, setDeletedLeaveIds] = useState<string[]>(() => {
    const stored = localStorage.getItem('absensi_deleted_leave_ids');
    return stored ? JSON.parse(stored) : [];
  });

  // Apply deletion filtering reactively on local states when lists of deleted IDs change
  useEffect(() => {
    setEmployeesState(prev => prev.filter(emp => !deletedEmployeeIds.includes(emp.id)));
  }, [deletedEmployeeIds]);

  useEffect(() => {
    setLogsState(prev => prev.filter(log => !deletedLogIds.includes(log.id)));
  }, [deletedLogIds]);

  useEffect(() => {
    setLeaveRequestsState(prev => prev.filter(req => !deletedLeaveIds.includes(req.id)));
  }, [deletedLeaveIds]);

  const recordDeletedEmployee = (id: string) => {
    setDeletedEmployeeIds(prev => {
      if (prev.includes(id)) return prev;
      const updated = [...prev, id];
      localStorage.setItem('absensi_deleted_employee_ids', JSON.stringify(updated));
      return updated;
    });
  };

  const recordDeletedLog = (id: string) => {
    setDeletedLogIds(prev => {
      if (prev.includes(id)) return prev;
      const updated = [...prev, id];
      localStorage.setItem('absensi_deleted_log_ids', JSON.stringify(updated));
      return updated;
    });
  };

  const recordDeletedLeave = (id: string) => {
    setDeletedLeaveIds(prev => {
      if (prev.includes(id)) return prev;
      const updated = [...prev, id];
      localStorage.setItem('absensi_deleted_leave_ids', JSON.stringify(updated));
      return updated;
    });
  };
  const isAbsensiClosed = storeLocation.isClosed || false;
  const [systemLogo, setSystemLogo] = useState<string>(() => {
    return localStorage.getItem('absensi_system_logo') || '';
  });
  const [notifications, setNotifications] = useState<AdminNotification[]>(() => {
    const stored = localStorage.getItem('absensi_admin_notifications');
    return stored ? JSON.parse(stored) : [];
  });
  const [supabaseStatus, setSupabaseStatus] = useState<'unconfigured' | 'connecting' | 'connected' | 'error'>('unconfigured');
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);


  // Automatically clear today's attendance logs list at 00:00 (new day)
  useEffect(() => {
    const todayStr = getLocalDateString();
    const lastOpenedDate = localStorage.getItem('absensi_last_opened_date');

    if (lastOpenedDate && lastOpenedDate !== todayStr) {
      setLogs([]);
      localStorage.setItem('absensi_logs', JSON.stringify([]));
      console.log('Midnight 00:00 boundary reached. Auto-cleared daily attendance logs.');
    }
    localStorage.setItem('absensi_last_opened_date', todayStr);

    const interval = setInterval(() => {
      const currentTodayStr = getLocalDateString();
      const savedDate = localStorage.getItem('absensi_last_opened_date');
      if (savedDate && savedDate !== currentTodayStr) {
        setLogs([]);
        localStorage.setItem('absensi_logs', JSON.stringify([]));
        localStorage.setItem('absensi_last_opened_date', currentTodayStr);
        console.log('Midnight active page refresh. Daily logs cleared.');
      }
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  // Initialize data on first mount (Supabase prioritized, LocalStorage fallback)
  useEffect(() => {
    // Check mode=employee query param
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'employee') {
      setIsLockedEmployee(true);
      setActiveTab('employee');
    }

    async function loadInitialData() {
      try {
        // One-time fresh cleanup of all stale employee data, logs, leaves and notifications
        const isFreshV4 = localStorage.getItem('absensi_fresh_v4') === 'true';
        if (!isFreshV4) {
          localStorage.setItem('absensi_employees', JSON.stringify([]));
          localStorage.setItem('absensi_logs', JSON.stringify([]));
          localStorage.setItem('absensi_leaves', JSON.stringify([]));
          localStorage.setItem('absensi_admin_notifications', JSON.stringify([]));
          localStorage.removeItem('absensi_last_uid');
          localStorage.setItem('absensi_initialized', 'true');
          localStorage.setItem('absensi_fresh_v4', 'true');

          if (isSupabaseConfigured()) {
            await clearAllSupabaseEmployees();
            await clearAllSupabaseLogs();
            await clearAllSupabaseLeaves();
          }

          setEmployees([]);
          setLogs([]);
          setLeaveRequests([]);
          setNotifications([]);
          setIsInitialLoading(false);
          return;
        }

        const isInitialized = localStorage.getItem('absensi_initialized') === 'true';

        if (isSupabaseConfigured()) {
          console.log('Connecting to Supabase...');
          setSupabaseStatus('connecting');
          
          // 1. Load Employees
          const dbEmployees = await getSupabaseEmployees();
          if (dbEmployees !== null) {
            setSupabaseStatus('connected');
            setEmployees(dbEmployees);
          } else {
            console.log('Supabase employees table is not available. Falling back to local storage.');
            setSupabaseStatus('error');
            const storedEmployees = localStorage.getItem('absensi_employees');
            const parsed = storedEmployees ? JSON.parse(storedEmployees) : [];
            
            let initialEmployees = parsed;
            if (!isInitialized && parsed.length === 0) {
              initialEmployees = SAMPLE_EMPLOYEES;
              localStorage.setItem('absensi_employees', JSON.stringify(SAMPLE_EMPLOYEES));
              localStorage.setItem('absensi_initialized', 'true');
            }

            const filtered = initialEmployees.filter((emp: any) => !deletedEmployeeIds.includes(emp.id));
            setEmployees(filtered);
          }

          // 2. Load Logs
          const dbLogs = await getSupabaseLogs();
          if (dbLogs !== null) {
            setLogs(dbLogs);
          } else {
            const storedLogs = localStorage.getItem('absensi_logs');
            const parsed = storedLogs ? JSON.parse(storedLogs) : [];
            const filtered = parsed.filter((log: any) => !deletedLogIds.includes(log.id));
            setLogs(filtered);
          }

          // 3. Load Leaves
          const dbLeaves = await getSupabaseLeaves();
          if (dbLeaves !== null) {
            setLeaveRequests(dbLeaves);
          } else {
            const storedLeaves = localStorage.getItem('absensi_leaves');
            const parsed = storedLeaves ? JSON.parse(storedLeaves) : [];
            const filtered = parsed.filter((req: any) => !deletedLeaveIds.includes(req.id));
            setLeaveRequests(filtered);
          }

          // 4. Load Store Location
          const dbLocation = await getSupabaseStoreLocation();
          if (dbLocation !== null) {
            setStoreLocation(dbLocation);
          } else {
            const storedLocation = localStorage.getItem('absensi_store_location');
            setStoreLocation(storedLocation ? JSON.parse(storedLocation) : DEFAULT_STORE_LOCATION);
          }

          // 5. Load Positions/Roles
          const dbPositions = await getSupabasePositions();
          if (dbPositions !== null && dbPositions.length > 0) {
            setCustomRoles(dbPositions);
          } else {
            const storedRoles = localStorage.getItem('absensi_custom_roles');
            if (storedRoles) {
              setCustomRoles(JSON.parse(storedRoles));
            }
          }


        } else {
          setSupabaseStatus('unconfigured');
          // Fallback to LocalStorage entirely
          const storedEmployees = localStorage.getItem('absensi_employees');
          const storedLogs = localStorage.getItem('absensi_logs');
          const storedLeaves = localStorage.getItem('absensi_leaves');
          const storedLocation = localStorage.getItem('absensi_store_location');

          const parsedEmployees = storedEmployees ? JSON.parse(storedEmployees) : [];
          let initialEmployees = parsedEmployees;
          if (!isInitialized && parsedEmployees.length === 0) {
            initialEmployees = SAMPLE_EMPLOYEES;
            localStorage.setItem('absensi_employees', JSON.stringify(SAMPLE_EMPLOYEES));
            localStorage.setItem('absensi_initialized', 'true');
          }

          const filteredEmps = initialEmployees.filter((emp: any) => !deletedEmployeeIds.includes(emp.id));
          const parsedLogs = storedLogs ? JSON.parse(storedLogs) : [];
          const filteredLogs = parsedLogs.filter((log: any) => !deletedLogIds.includes(log.id));
          const parsedLeaves = storedLeaves ? JSON.parse(storedLeaves) : [];
          const filteredLeaves = parsedLeaves.filter((req: any) => !deletedLeaveIds.includes(req.id));

          setEmployees(filteredEmps);
          setLogs(filteredLogs);
          setLeaveRequests(filteredLeaves);
          setStoreLocation(storedLocation ? JSON.parse(storedLocation) : DEFAULT_STORE_LOCATION);

          const storedRoles = localStorage.getItem('absensi_custom_roles');
          if (storedRoles) {
            setCustomRoles(JSON.parse(storedRoles));
          }
        }
      } catch (err) {
        console.error("Error loading initial data:", err);
      } finally {
        setIsInitialLoading(false);
      }
    }

    loadInitialData();
  }, []);

  // Real-time synchronization subscription for multi-device instant updates!
  useEffect(() => {
    let logsChannel: any;
    let employeesChannel: any;
    let leavesChannel: any;
    let storeChannel: any;
    let remindersChannel: any;
    let alarmSettingsChannel: any;

    if (supabase) {
      logsChannel = supabase
        .channel('public:attendance_logs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, async (payload) => {
          if (Date.now() - lastLocalUpdateRef.current < 4000) {
            console.log('Skipping real-time log sync to prevent race conditions during write');
            return;
          }
          console.log('Realtime log change received:', payload);
          const dbLogs = await getSupabaseLogs();
          if (dbLogs && Date.now() - lastLocalUpdateRef.current >= 4000) {
            setLogs(dbLogs);
          }
        })
        .subscribe();

      employeesChannel = supabase
        .channel('public:employees')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, async (payload) => {
          if (Date.now() - lastLocalUpdateRef.current < 4000) {
            console.log('Skipping real-time employee sync to prevent race conditions during write');
            return;
          }
          console.log('Realtime employee change received:', payload);
          const dbEmployees = await getSupabaseEmployees();
          if (dbEmployees && Date.now() - lastLocalUpdateRef.current >= 4000) {
            setEmployees(dbEmployees);
          }
        })
        .subscribe();

      leavesChannel = supabase
        .channel('public:leave_requests')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, async (payload) => {
          if (Date.now() - lastLocalUpdateRef.current < 4000) {
            console.log('Skipping real-time leave sync to prevent race conditions during write');
            return;
          }
          console.log('Realtime leave change received:', payload);
          const dbLeaves = await getSupabaseLeaves();
          if (dbLeaves && Date.now() - lastLocalUpdateRef.current >= 4000) {
            setLeaveRequests(dbLeaves);
          }
        })
        .subscribe();

      storeChannel = supabase
        .channel('public:store_location')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'store_location' }, async (payload) => {
          if (Date.now() - lastLocalUpdateRef.current < 15000) {
            console.log('Skipping real-time location sync to prevent race conditions during write');
            return;
          }
          console.log('Realtime location change received:', payload);
          const dbLocation = await getSupabaseStoreLocation();
          if (dbLocation && Date.now() - lastLocalUpdateRef.current >= 15000) {
            setStoreLocation(prev => {
              if (isStoreLocationEqual(prev, dbLocation)) return prev;
              return dbLocation;
            });
          }
        })
        .subscribe();



      remindersChannel = supabase
        .channel('public:reminders')
        .on('broadcast', { event: 'remind_attendance' }, (payload) => {
          console.log('Received attendance reminder broadcast:', payload);
          if (payload && payload.payload) {
            triggerNotification(payload.payload);
          }
        })
        .on('broadcast', { event: 'admin_push_notification' }, (payload) => {
          console.log('Received admin push notification broadcast:', payload);
          if (payload && payload.payload) {
            const data = payload.payload;
            // Only show if the current logged-in employee is targeted or audience is 'all'
            const storedUid = localStorage.getItem('absensi_last_uid');
            let isTargeted = false;
            if (data.audience === 'all') {
              isTargeted = true;
            } else if (storedUid) {
              const upperUid = storedUid.toUpperCase();
              if (data.audience === 'user' && data.employeeId && data.employeeId.toUpperCase() === upperUid) {
                isTargeted = true;
              } else if (data.audience === 'division' && data.targets) {
                isTargeted = data.targets.some((t: string) => t.toUpperCase() === upperUid);
              }
            }
            
            if (isTargeted) {
              playNotificationSound();
              // Text to Speech voice warning
              if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(`Perhatian! Ada pengumuman admin baru: ${data.title}. ${data.body}`);
                utterance.lang = 'id-ID';
                utterance.rate = 0.95;
                window.speechSynthesis.speak(utterance);
              }
              
              setActiveNotification({
                id: `admin-${Date.now()}`,
                senderName: 'Sistem Admin',
                senderAvatar: '',
                type: 'admin',
                title: data.title,
                body: data.body,
                timestamp: Date.now()
              });
            }
          }
        })
        .subscribe();
    }

    // Fallback Polling: Syncs every 5 seconds as a bulletproof backup
    // to bypass iframe socket blocks or local network constraints.
    const pollInterval = setInterval(async () => {
      if (isSupabaseConfigured()) {
        try {
          if (Date.now() - lastLocalUpdateRef.current < 15000) {
            console.log('Skipping polling sync to prevent race conditions');
            return;
          }

          const [dbEmployees, dbLogs, dbLeaves, dbLocation] = await Promise.all([
            getSupabaseEmployees(),
            getSupabaseLogs(),
            getSupabaseLeaves(),
            getSupabaseStoreLocation()
          ]);
          
          if (Date.now() - lastLocalUpdateRef.current < 15000) {
            console.log('Skipping state apply of poll to prevent race conditions');
            return;
          }

          if (dbEmployees) {
            setEmployees(dbEmployees);
          }
          if (dbLogs) {
            setLogs(dbLogs);
          }
          if (dbLeaves) {
            setLeaveRequests(dbLeaves);
          }
          if (dbLocation) {
            setStoreLocation(prev => {
              if (isStoreLocationEqual(prev, dbLocation)) return prev;
              return dbLocation;
            });
          }
        } catch (err) {
          console.log("Background realtime poll fallback info:", err);
        }
      }
    }, 5000);

    return () => {
      if (supabase) {
        if (logsChannel) supabase.removeChannel(logsChannel);
        if (employeesChannel) supabase.removeChannel(employeesChannel);
        if (leavesChannel) supabase.removeChannel(leavesChannel);
        if (storeChannel) supabase.removeChannel(storeChannel);
        if (alarmSettingsChannel) supabase.removeChannel(alarmSettingsChannel);
        if (remindersChannel) supabase.removeChannel(remindersChannel);
      }
      clearInterval(pollInterval);
    };
  }, []);

  // Helper functions to update and persist state
  const saveEmployees = (updated: Employee[]) => {
    lastLocalUpdateRef.current = Date.now();
    setEmployees(updated);
    localStorage.setItem('absensi_employees', JSON.stringify(updated));
  };

  const saveLogs = (updated: AttendanceLog[]) => {
    lastLocalUpdateRef.current = Date.now();
    setLogs(updated);
    localStorage.setItem('absensi_logs', JSON.stringify(updated));
  };

  const saveLeaves = (updated: LeaveRequest[]) => {
    lastLocalUpdateRef.current = Date.now();
    setLeaveRequests(updated);
    localStorage.setItem('absensi_leaves', JSON.stringify(updated));
  };

  const saveStoreLocation = async (updated: StoreLocation) => {
    lastLocalUpdateRef.current = Date.now();
    setStoreLocation(prev => {
      if (isStoreLocationEqual(prev, updated)) return prev;
      localStorage.setItem('absensi_store_location', JSON.stringify(updated));
      return updated;
    });
    if (isSupabaseConfigured()) {
      await updateSupabaseStoreLocation(updated);
    }
  };

  const saveSystemLogo = (url: string) => {
    setSystemLogo(url);
    localStorage.setItem('absensi_system_logo', url);
  };

  const handleSendReminder = (sender: Employee, type: 'masuk' | 'pulang') => {
    const payload = {
      senderName: sender.name,
      senderAvatar: sender.avatar || '',
      type: type
    };
    
    // 1. Trigger locally for the sender immediately
    triggerNotification(payload);
    
    // 2. Broadcast via Supabase if active
    if (isSupabaseConfigured() && supabase) {
      try {
        const channel = supabase.channel('public:reminders');
        channel.send({
          type: 'broadcast',
          event: 'remind_attendance',
          payload: payload
        }).then((res) => {
          console.log("Broadcast reminder sent successfully:", res);
        }).catch((err) => {
          console.error("Failed to broadcast reminder:", err);
        });
      } catch (err) {
        console.error("Supabase broadcast error:", err);
      }
    }

  };

  const saveNotifications = (updated: AdminNotification[]) => {
    setNotifications(updated);
    localStorage.setItem('absensi_admin_notifications', JSON.stringify(updated));
  };


  // Synchronize notifications from logs in real-time
  useEffect(() => {
    if (logs.length === 0) return;

    let changed = false;
    let currentNotifications = [...notifications];

    // Helper to safely parse localized or standard date/time string to timestamp
    const parseLogTime = (dateStr: string, timeStr: string): number => {
      if (!dateStr || !timeStr) return Date.now();
      // Replace dots with colons (Indonesian localized style "12.30.15" -> "12:30:15")
      const cleanTime = timeStr.replace(/\./g, ':').replace(/[^0-9:]/g, '').trim();
      const dateObj = new Date(`${dateStr}T${cleanTime}`);
      if (!isNaN(dateObj.getTime())) {
        return dateObj.getTime();
      }
      const dateOnlyObj = new Date(dateStr);
      if (!isNaN(dateOnlyObj.getTime())) {
        return dateOnlyObj.getTime();
      }
      return Date.now();
    };

    // Filter out notifications for employees that are deleted
    const filtered = currentNotifications.filter(n => 
      employees.some(emp => emp.name === n.employeeName)
    );
    if (filtered.length !== currentNotifications.length) {
      currentNotifications = filtered;
      changed = true;
    }

    // Get date threshold for last 2 days (today and yesterday) to prevent historical spam
    const today = new Date();
    const thresholdDate = new Date(today);
    const thresholdDateObj = new Date(today);
    thresholdDateObj.setDate(today.getDate() - 1);
    const thresholdStr = getLocalDateString(thresholdDateObj);

    logs.forEach(log => {
      // 1. Skip logs older than yesterday
      if (log.date < thresholdStr) return;

      // 2. Check if employee still exists
      const employeeExists = employees.some(emp => emp.id === log.employeeId || emp.name === log.employeeName);
      if (!employeeExists) return;

      // Check Clock-In Notification
      if (log.clockIn) {
        const clockInNotifId = `notif-in-${log.id}`;
        const exists = currentNotifications.some(n => n.id === clockInNotifId);
        if (!exists) {
          const logTime = parseLogTime(log.date, log.clockIn);
          const isNew = logTime >= sessionStartTime.current - 15000; // 15 seconds buffer
          currentNotifications.push({
            id: clockInNotifId,
            employeeName: log.employeeName,
            type: 'clock_in',
            time: log.clockIn,
            date: log.date,
            timestamp: logTime,
            read: !isNew
          });
          changed = true;
        }
      }

      // Check Clock-Out Notification
      if (log.clockOut) {
        const clockOutNotifId = `notif-out-${log.id}`;
        const exists = currentNotifications.some(n => n.id === clockOutNotifId);
        if (!exists) {
          const logTime = parseLogTime(log.date, log.clockOut);
          const isNew = logTime >= sessionStartTime.current - 15000;
          currentNotifications.push({
            id: clockOutNotifId,
            employeeName: log.employeeName,
            type: 'clock_out',
            time: log.clockOut,
            date: log.date,
            timestamp: logTime,
            read: !isNew
          });
          changed = true;
        }
      }

      // Check Break-Start Notification
      if (log.breakStart) {
        const breakStartNotifId = `notif-break-start-${log.id}`;
        const exists = currentNotifications.some(n => n.id === breakStartNotifId);
        if (!exists) {
          const logTime = parseLogTime(log.date, log.breakStart);
          const isNew = logTime >= sessionStartTime.current - 15000;
          currentNotifications.push({
            id: breakStartNotifId,
            employeeName: log.employeeName,
            type: 'break_start',
            time: log.breakStart,
            date: log.date,
            timestamp: logTime,
            read: !isNew
          });
          changed = true;
        }
      }

      // Check Break-End Notification
      if (log.breakEnd) {
        const breakEndNotifId = `notif-break-end-${log.id}`;
        const exists = currentNotifications.some(n => n.id === breakEndNotifId);
        if (!exists) {
          const logTime = parseLogTime(log.date, log.breakEnd);
          const isNew = logTime >= sessionStartTime.current - 15000;
          currentNotifications.push({
            id: breakEndNotifId,
            employeeName: log.employeeName,
            type: 'break_end',
            time: log.breakEnd,
            date: log.date,
            timestamp: logTime,
            read: !isNew
          });
          changed = true;
        }
      }
    });

    if (changed) {
      currentNotifications.sort((a, b) => b.timestamp - a.timestamp);
      // Keep only 30 most recent notifications to avoid memory and list bloating
      const slicedNotifications = currentNotifications.slice(0, 30);
      saveNotifications(slicedNotifications);
    }
  }, [logs, employees]);

  const handleClearLogs = async () => {
    localStorage.setItem('absensi_logs_cleared', 'true');
    localStorage.setItem('absensi_leaves_cleared', 'true');
    saveLogs([]);
    saveLeaves([]);
    if (isSupabaseConfigured()) {
      await clearAllSupabaseLogs();
      await clearAllSupabaseLeaves();
    }
  };

  const handleClearAllEmployees = async () => {
    saveEmployees([]);
    if (isSupabaseConfigured()) {
      await clearAllSupabaseEmployees();
    }
  };

  const handleClearAllLeaves = async () => {
    saveLeaves([]);
    if (isSupabaseConfigured()) {
      await clearAllSupabaseLeaves();
    }
  };

  // Handlers
  const handleAddLog = async (newLog: AttendanceLog) => {
    saveLogs([newLog, ...logs]);
    if (isSupabaseConfigured()) {
      await upsertSupabaseLog(newLog);
    }
  };

  const handleUpdateLog = async (updatedLog: AttendanceLog) => {
    const updated = logs.map(log => log.id === updatedLog.id ? updatedLog : log);
    saveLogs(updated);
    if (isSupabaseConfigured()) {
      await upsertSupabaseLog(updatedLog);
    }
  };

  const handleDeleteLog = async (id: string) => {
    recordDeletedLog(id);
    const updated = logs.filter(log => log.id !== id);
    saveLogs(updated);
    if (isSupabaseConfigured()) {
      await deleteSupabaseLog(id);
    }
  };

  const handleAddLeave = async (newLeave: LeaveRequest) => {
    saveLeaves([newLeave, ...leaveRequests]);
    if (isSupabaseConfigured()) {
      await upsertSupabaseLeave(newLeave);
    }
  };

  const handleApproveLeave = async (id: string) => {
    // 1. Approve leave request
    const updatedLeaves = leaveRequests.map(req => req.id === id ? { ...req, status: 'Disetujui' as const } : req);
    saveLeaves(updatedLeaves);

    const req = leaveRequests.find(r => r.id === id);
    if (req) {
      if (isSupabaseConfigured()) {
        await upsertSupabaseLeave({ ...req, status: 'Disetujui' });
      }

      // 2. Generate an automatic leave attendance log for the approved duration
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      const newLogsToInsert: AttendanceLog[] = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = getLocalDateString(d);
        const logId = `LOG-${req.employeeId}-${dateStr}`;
        if (!logs.some(l => l.id === logId)) {
          newLogsToInsert.push({
            id: logId,
            employeeId: req.employeeId,
            employeeName: req.employeeName,
            date: dateStr,
            shiftId: 'S1',
            shiftName: 'Shift Cuti Resmi',
            clockIn: '08:00:00',
            clockOut: '17:00:00',
            status: 'Izin',
            notes: `Izin resmi: ${req.type} - ${req.reason}`,
            workingHours: 8.0
          });
        }
      }

      if (newLogsToInsert.length > 0) {
        saveLogs([...newLogsToInsert, ...logs]);
        if (isSupabaseConfigured()) {
          for (const nLog of newLogsToInsert) {
            await upsertSupabaseLog(nLog);
          }
        }
      }
    }
  };

  const handleRejectLeave = async (id: string) => {
    const updated = leaveRequests.map(req => req.id === id ? { ...req, status: 'Ditolak' as const } : req);
    saveLeaves(updated);

    const req = leaveRequests.find(r => r.id === id);
    if (isSupabaseConfigured() && req) {
      await upsertSupabaseLeave({ ...req, status: 'Ditolak' });
    }
  };

  const handleAddEmployee = async (newEmp: Employee) => {
    setDeletedEmployeeIds(prev => {
      const updated = prev.filter(id => id !== newEmp.id);
      localStorage.setItem('absensi_deleted_employee_ids', JSON.stringify(updated));
      return updated;
    });
    saveEmployees([...employees, newEmp]);
    if (isSupabaseConfigured()) {
      await upsertSupabaseEmployee(newEmp);
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    recordDeletedEmployee(id);
    const updated = employees.filter(emp => emp.id !== id);
    saveEmployees(updated);
    if (isSupabaseConfigured()) {
      await deleteSupabaseEmployee(id);
    }
  };

  const handleUpdateEmployee = async (updatedEmp: Employee) => {
    const updated = employees.map(emp => emp.id === updatedEmp.id ? updatedEmp : emp);
    saveEmployees(updated);
    if (isSupabaseConfigured()) {
      await upsertSupabaseEmployee(updatedEmp);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Dynamic Header */}
      <Header activeTab={activeTab} setActiveTab={handleSetTab} isLockedEmployee={isLockedEmployee} systemLogo={systemLogo} isAdminUnlocked={isAdminUnlocked} />

      {/* Banners removed to keep view completely clean and non-disturbing as requested */}

      {/* Main Container Stage */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          
          {/* PORTAL KARYAWAN */}
          {activeTab === 'employee' && (
            <motion.div
              key="employee-portal"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {isInitialLoading ? (
                <div className="bg-white rounded-3xl p-10 border border-slate-100 shadow-sm text-center max-w-md mx-auto space-y-4 my-8 animate-pulse">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center text-3xl mx-auto font-bold">
                    ⏳
                  </div>
                  <h3 className="font-bold text-slate-800 text-lg">Menghubungkan & Memuat Data...</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    Aplikasi sedang menyinkronkan data dengan database online Supabase. Mohon tunggu sebentar...
                  </p>
                </div>
              ) : employees.length > 0 ? (
                <ClockInOut 
                  employees={employees} 
                  logs={logs} 
                  leaveRequests={leaveRequests}
                  onAddLeave={handleAddLeave}
                  onAddLog={handleAddLog} 
                  onUpdateLog={handleUpdateLog} 
                  isAbsensiClosed={isAbsensiClosed}
                  storeLocation={storeLocation}
                  systemLogo={systemLogo}
                  onSendReminder={handleSendReminder}
                />
              ) : (
                <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm text-center max-w-md mx-auto space-y-4 my-8">
                  <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center text-3xl mx-auto font-bold">
                    👥
                  </div>
                  <h3 className="font-bold text-slate-800 text-lg">Belum Ada Karyawan Terdaftar</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    Sistem berhasil terhubung, namun saat ini belum ada data karyawan yang terdaftar di dalam sistem absensi.
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {isLockedEmployee 
                      ? "Silakan hubungi Admin atau penanggung jawab Anda untuk mendaftarkan akun karyawan baru Anda terlebih dahulu."
                      : "Sebagai Admin, silakan masuk ke Panel Admin untuk mengonfigurasi database dan menambahkan karyawan baru terlebih dahulu."
                    }
                  </p>
                  <div className="pt-2 flex flex-col gap-2">
                    <button 
                      onClick={() => window.location.reload()}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
                    >
                      🔄 Muat Ulang Halaman
                    </button>
                    {!isLockedEmployee && isAdminUnlocked && (
                      <button 
                        onClick={() => setActiveTab('admin')}
                        className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold text-xs py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer"
                      >
                        ⚙️ Masuk Panel Admin
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* DASHBOARD ADMIN */}
          {activeTab === 'admin' && (
            <motion.div
              key="admin-dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
            >
              <AdminPanel 
                employees={employees}
                logs={logs}
                leaveRequests={leaveRequests}
                onAddEmployee={handleAddEmployee}
                onDeleteEmployee={handleDeleteEmployee}
                onUpdateEmployee={handleUpdateEmployee}
                onApproveLeave={handleApproveLeave}
                onRejectLeave={handleRejectLeave}
                onDeleteLog={handleDeleteLog}
                storeLocation={storeLocation}
                onUpdateStoreLocation={saveStoreLocation}
                systemLogo={systemLogo}
                onUpdateLogo={saveSystemLogo}
                onClearAllLogs={handleClearLogs}
                onClearAllEmployees={handleClearAllEmployees}
                onClearAllLeaves={handleClearAllLeaves}
                isAbsensiClosed={isAbsensiClosed}
                onToggleAbsensiClosed={async (val) => {
                  const updatedLoc = { ...storeLocation, isClosed: val };
                  await saveStoreLocation(updatedLoc);
                  localStorage.setItem('absensi_system_closed', String(val));
                }}
                notifications={notifications}
                onUpdateNotifications={saveNotifications}
                supabaseStatus={supabaseStatus}
                onLogout={() => {
                  setIsAdminUnlocked(false);
                  handleSetTab('employee');
                }}
                customRoles={customRoles}
                onAddPosition={handleAddPosition}
                onDeletePosition={handleDeletePosition}
              />
            </motion.div>
          )}

          {/* HALAMAN 404 & 500 (NOT FOUND / EXCEPTION HANDLER) */}
          {activeTab === '404' && (
            <motion.div
              key="not-found-page"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className="max-w-md mx-auto my-12 text-center bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6"
            >
              <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center text-4xl mx-auto font-black shadow-inner">
                🔍
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Halaman Tidak Ditemukan</h2>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  Maaf, alamat halaman (URL Hash) yang Anda tuju salah atau telah dipindahkan dari sistem Absensi DG-Komputer.
                </p>
              </div>
              <button
                onClick={() => handleSetTab('employee')}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs py-3 rounded-xl shadow-md transition-all active:scale-[0.98] cursor-pointer"
              >
                🏠 Kembali ke Portal Karyawan
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Decorative Simple Footer (No bloat, honest credit) */}
      <footer className="border-t border-slate-100 bg-white py-6">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
            Absensi Karyawan Dg-Komputer • Ditata Dengan Presisi Dan Keamanan Biometrik
          </p>
          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
            Mendukung pelacakan real-time, geotagging presisi tinggi, dan enkripsi dokumen lampiran perizinan.
          </p>
        </div>
      </footer>

      {/* Floating Real-time Notification Banner */}
      <AnimatePresence>
        {activeNotification && (
          <motion.div
            initial={{ opacity: 0, y: -70, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.9 }}
            transition={{ type: 'spring', damping: 18, stiffness: 120 }}
            className="fixed top-6 inset-x-4 mx-auto max-w-md z-[9999]"
          >
            <div className="bg-slate-900/95 backdrop-blur-md text-white rounded-3xl p-4 shadow-2xl border border-slate-800 flex items-center space-x-3.5 relative overflow-hidden">
              {/* Highlight accent */}
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-600"></div>
              
              {/* Avatar / Icon container */}
              <div className="w-12 h-12 rounded-full border-2 border-indigo-400 overflow-hidden shrink-0 shadow-inner bg-slate-800">
                {activeNotification.senderAvatar ? (
                  <img 
                    src={activeNotification.senderAvatar} 
                    alt={activeNotification.senderName} 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-lg text-indigo-200">
                    👤
                  </div>
                )}
              </div>
              
              {/* Message Details */}
              <div className="flex-1 min-w-0 pr-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block">
                    {activeNotification.type === 'admin' ? '📢 Pengumuman Admin' : 'Pengingat Absensi 🔔'}
                  </span>
                  <span className="text-[9px] text-indigo-300 font-extrabold bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-900/60 uppercase">Sekarang</span>
                </div>
                <div className="text-xs text-slate-100 font-black leading-snug mt-1.5">
                  {activeNotification.type === 'admin' ? (
                    <span className="block space-y-1">
                      <strong className="text-indigo-300 block text-xs">{activeNotification.title || 'Pengumuman Resmi'}</strong>
                      <span className="font-medium text-slate-300 block text-[11px] leading-relaxed">{activeNotification.body}</span>
                    </span>
                  ) : activeNotification.type === 'masuk' ? (
                    <p><strong>{activeNotification.senderName}</strong> mengingatkan yang lain untuk jangan lupa <strong>Absen Masuk</strong> hari ini! 🕒</p>
                  ) : (
                    <p><strong>{activeNotification.senderName}</strong> mengingatkan yang lain untuk jangan lupa <strong>Absen Pulang</strong> sebelum pulang! 🚗</p>
                  )}
                </div>
              </div>
              
              {/* Close Button */}
              <button 
                onClick={() => setActiveNotification(null)}
                className="text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 p-2 rounded-2xl cursor-pointer transition-colors"
                title="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
