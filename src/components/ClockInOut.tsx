import React, { useState, useEffect } from 'react';
import { Employee, AttendanceLog, LeaveRequest, SHIFTS, StoreLocation } from '../types';
import { 
  QrCode, Search, CheckCircle, Play, Square, FileText, 
  Volume2, UserCheck, ShieldAlert, Camera, CameraOff, AlertCircle, LogIn, LogOut,
  AlertTriangle, Clock, X, Bell, Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
// @ts-ignore
import defaultLogo from '../assets/logo.png';
import { Html5Qrcode } from 'html5-qrcode';
import { playSuccessIn, playSuccessOut, playIzin, playError, playNotificationSound } from '../utils/sound';
import QRCode from 'qrcode';
import { supabase } from '../utils/supabaseClient';

const getLocalDateString = (d: Date = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatIndonesianDate = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
};

interface ClockInOutProps {
  employees: Employee[];
  logs: AttendanceLog[];
  leaveRequests?: LeaveRequest[];
  onAddLeave?: (leave: LeaveRequest) => void;
  onAddLog: (log: AttendanceLog) => void;
  onUpdateLog: (log: AttendanceLog) => void;
  isAbsensiClosed?: boolean;
  storeLocation: StoreLocation;
  systemLogo?: string;
  onSendReminder?: (sender: Employee, type: 'masuk' | 'pulang') => void;
}

// Haversine formula to compute geodesic distance between two points in meters
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

export default function ClockInOut({ 
  employees, 
  logs, 
  leaveRequests = [],
  onAddLeave,
  onAddLog, 
  onUpdateLog,
  isAbsensiClosed = false,
  storeLocation,
  systemLogo = '',
  onSendReminder
}: ClockInOutProps) {
  // UID Input Search / Scan state
  const [uidInput, setUidInput] = useState<string>(() => {
    return localStorage.getItem('absensi_last_uid') || '';
  });
  const [matchedEmployee, setMatchedEmployee] = useState<Employee | null>(null);

  // Scanner state
  const [scannerActive, setScannerActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Form input for leave/reason
  const [leaveReason, setLeaveReason] = useState<string>('');
  const [leaveType, setLeaveType] = useState<'Sakit' | 'Cuti' | 'Izin'>('Izin');
  const [leaveStartDate, setLeaveStartDate] = useState<string>(getLocalDateString());
  const [leaveEndDate, setLeaveEndDate] = useState<string>(getLocalDateString());
  const [showLeaveInput, setShowLeaveInput] = useState<boolean>(false);
  
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // GPS specific states
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [detectedCoords, setDetectedCoords] = useState<{ latitude: number; longitude: number; distance: number; accuracy?: number } | null>(null);

  // Employee custom GPS check states
  const [checkingGps, setCheckingGps] = useState<boolean>(false);
  const [employeeGpsResult, setEmployeeGpsResult] = useState<{
    latitude: number;
    longitude: number;
    distance: number;
    inRange: boolean;
    address: string;
    accuracy?: number;
  } | null>(null);

  // Custom Alarm Settings & incoming Nudge state
  interface ReminderSettings {
    clockInAlarmEnabled: boolean;
    clockInTime: string; // HH:MM
    clockOutAlarmEnabled: boolean;
    clockOutTime: string; // HH:MM
    browserNotificationEnabled: boolean;
  }

  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(() => {
    const saved = localStorage.getItem('absensi_global_alarm_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error loading global system alarm settings on init", e);
      }
    }
    return {
      clockInAlarmEnabled: true,
      clockInTime: '07:45',
      clockOutAlarmEnabled: true,
      clockOutTime: '17:00',
      browserNotificationEnabled: true
    };
  });

  const [hasNotificationPermission, setHasNotificationPermission] = useState<boolean>(() => {
    return 'Notification' in window && Notification.permission === 'granted';
  });

  const [showNotificationPrompt, setShowNotificationPrompt] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const dismissed = localStorage.getItem('absensi_prompt_dismissed');
      return 'Notification' in window && Notification.permission !== 'granted' && dismissed !== 'true';
    }
    return false;
  });

  const [incomingNudge, setIncomingNudge] = useState<{
    senderName: string;
    senderAvatar: string;
    type: 'masuk' | 'pulang';
    timestamp: number;
  } | null>(null);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      setFeedbackMsg({
        type: 'error',
        text: '⚠️ Browser Anda tidak mendukung notifikasi sistem.'
      });
      return;
    }
    
    try {
      const permission = await Notification.requestPermission();
      setShowNotificationPrompt(false);
      if (permission === 'granted') {
        setHasNotificationPermission(true);
        setFeedbackMsg({
          type: 'success',
          text: '🔔 Izin Notifikasi Aktif! Anda akan menerima colek langsung ke perangkat Anda.'
        });
        speakIndonesian("Notifikasi sistem berhasil diaktifkan");
      } else {
        setHasNotificationPermission(false);
        setFeedbackMsg({
          type: 'error',
          text: '❌ Izin Notifikasi Ditolak! Harap izinkan notifikasi di pengaturan browser Anda agar pengingat aktif.'
        });
      }
    } catch (err: any) {
      console.error('[Notification] Error requesting permission:', err);
      setFeedbackMsg({
        type: 'error',
        text: `⚠️ Gagal mengaktifkan izin: ${err.message || err}. Jika Anda membuka aplikasi dari dalam bingkai (iframe) AI Studio, silakan buka aplikasi di TAB BARU (klik ikon 'Open in new tab' di pojok kanan atas) agar browser diizinkan memunculkan kotak persetujuan notifikasi secara aman.`
      });
    }
  };

  // 1b. Subscribe to individual colek (nudges) and handle matchedEmployee state
  useEffect(() => {
    if (!matchedEmployee) {
      setIncomingNudge(null);
      return;
    }
  }, [matchedEmployee]);

  // Auto-search logic when typing or scanning manual UID
  useEffect(() => {
    const trimmed = uidInput.trim().toUpperCase();
    if (!trimmed) {
      setMatchedEmployee(null);
      localStorage.removeItem('absensi_last_uid');
      return;
    }

    // Try to find the matching employee - STRICT match only (must fill in full ID or full NIK)
    const found = employees.find(emp => {
      const empId = emp.id.toUpperCase();
      const empNik = emp.nik ? emp.nik.trim().toUpperCase() : '';

      // Rule 1: Exact match on ID (e.g. "EMP001")
      if (empId === trimmed) return true;

      // Rule 2: Exact match on NIK (e.g. "DG01112001")
      if (empNik && empNik === trimmed) return true;

      return false;
    });

    if (found) {
      setMatchedEmployee(found);
      localStorage.setItem('absensi_last_uid', uidInput);
    } else {
      setMatchedEmployee(null);
    }
  }, [uidInput, employees]);

  // html5-qrcode implementation
  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    const elementId = "qr-reader-container";

    if (scannerActive) {
      setCameraError(null);
      // Ensure the target element exists
      const interval = setInterval(() => {
        const el = document.getElementById(elementId);
        if (el) {
          clearInterval(interval);
          try {
            html5QrCode = new Html5Qrcode(elementId);
            html5QrCode.start(
              { facingMode: "environment" }, // back camera
              {
                fps: 15,
                qrbox: (width, height) => {
                  const size = Math.min(width, height) * 0.7;
                  return { width: size, height: size };
                }
              },
              (decodedText) => {
                const cleanText = decodedText.trim();
                setUidInput(cleanText);
                setFeedbackMsg({ type: 'success', text: `Scan QR sukses: "${cleanText}"` });
                speakIndonesian("QR Code Berhasil Terbaca");
                setScannerActive(false); // turn off camera after successful scan
              },
              () => {
                // Ignore scanning failures
              }
            ).catch((err) => {
              console.error("Camera start error:", err);
              const errMsg = String(err);
              if (errMsg.includes("NotAllowedError") || errMsg.includes("Permission denied") || errMsg.includes("permission") || errMsg.includes("userMedia")) {
                setCameraError("Akses Kamera Ditolak! Jika Anda membuka aplikasi di dalam preview (iframe) AI Studio, silakan buka di tab baru (klik tombol 'Open in new tab' di pojok kanan atas) untuk mengaktifkan izin kamera.");
              } else {
                setCameraError("Gagal membuka kamera belakang. Pastikan perangkat Anda memiliki kamera aktif dan izin akses diberikan.");
              }
              setScannerActive(false);
            });
          } catch (e) {
            console.error("Scanner setup failed:", e);
            setCameraError("Gagal menginisialisasi scanner.");
            setScannerActive(false);
          }
        }
      }, 100);

      return () => {
        clearInterval(interval);
        if (html5QrCode && html5QrCode.isScanning) {
          html5QrCode.stop().catch(err => console.error("Scanner stop error:", err));
        }
      };
    }
  }, [scannerActive]);

  // Warm up SpeechSynthesis on mount
  useEffect(() => {
    if ('speechSynthesis' in window) {
      // Warm up voice list
      window.speechSynthesis.getVoices();
      // Speak silent character to warm up engine under user gesture
      const warmUpUtterance = new SpeechSynthesisUtterance("");
      warmUpUtterance.volume = 0;
      window.speechSynthesis.speak(warmUpUtterance);
    }
  }, []);

  // Text To Speech Utility in Indonesian
  const speakIndonesian = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // instantly cancel any ongoing speech
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      utterance.rate = 1.1; // Slightly faster to sound natural and snappy
      utterance.volume = 1.0;
      
      // Use 15ms timeout to ensure the browser successfully resets state and plays instantly
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 15);
    }
  };

  const getReminderStatus = () => {
    if (!matchedEmployee) return { active: true, label: 'Pilih Karyawan Terlebih Dahulu' };
    const currentHour = new Date().getHours();
    const type = currentHour < 12 ? 'masuk' : 'pulang';
    const todayStr = getLocalDateString();
    const key = `absensi_last_remind_${type}_${matchedEmployee.id}`;
    const lastRemindDate = localStorage.getItem(key);
    
    if (lastRemindDate === todayStr) {
      return {
        active: true,
        type,
        label: `Sudah Mengingatkan ${type === 'masuk' ? 'Absen Masuk' : 'Absen Pulang'} Hari Ini`
      };
    }
    return {
      active: false,
      type,
      label: `Kirim Pengingat ${type === 'masuk' ? 'Absen Masuk' : 'Absen Pulang'}`
    };
  };

  const reminderStatus = getReminderStatus();

  const handleSendAttendanceReminder = () => {
    if (!matchedEmployee || reminderStatus.active) return;
    
    if (onSendReminder) {
      onSendReminder(matchedEmployee, reminderStatus.type as 'masuk' | 'pulang');
    }
    
    const todayStr = getLocalDateString();
    const key = `absensi_last_remind_${reminderStatus.type}_${matchedEmployee.id}`;
    localStorage.setItem(key, todayStr);
    
    setFeedbackMsg({
      type: 'success',
      text: `Pengingat ${reminderStatus.type === 'masuk' ? 'Absen Masuk' : 'Absen Pulang'} berhasil dikirim ke seluruh rekan kerja! 🔔`
    });
    
    speakIndonesian("Pengingat berhasil dikirim");
  };



  const getColleaguesToNudge = () => {
    if (!matchedEmployee) return [];
    const currentHour = new Date().getHours();
    const type = currentHour < 12 ? 'masuk' : 'pulang';
    const todayStr = getLocalDateString();

    return employees.filter(emp => {
      if (emp.id === matchedEmployee.id) return false;

      const log = logs.find(l => l.employeeId === emp.id && l.date === todayStr);

      if (type === 'masuk') {
        const hasClockedIn = log && log.clockIn && log.clockIn !== '--:--:--';
        const isOnLeave = log && log.status === 'Izin';
        return !hasClockedIn && !isOnLeave;
      } else {
        const hasClockedIn = log && log.clockIn && log.clockIn !== '--:--:--';
        const hasClockedOut = log && log.clockOut && log.clockOut !== '--:--:--';
        const isOnLeave = log && log.status === 'Izin';
        return hasClockedIn && !hasClockedOut && !isOnLeave;
      }
    });
  };

  const updateReminderSettings = (newSettings: Partial<ReminderSettings>) => {
    if (!matchedEmployee) return;
    const updated = { ...reminderSettings, ...newSettings };
    setReminderSettings(updated);
    localStorage.setItem(`absensi_reminder_settings_${matchedEmployee.id}`, JSON.stringify(updated));
    
    setFeedbackMsg({
      type: 'success',
      text: '💾 Pengaturan Alarm Pengingat Harian Anda berhasil disimpan!'
    });
    playSuccessIn();
  };

  const getTodayLog = () => {
    if (!matchedEmployee) return null;
    const todayStr = getLocalDateString();
    return logs.find(log => log.employeeId === matchedEmployee.id && log.date === todayStr);
  };

  const todayLog = getTodayLog();

  const todayStr = getLocalDateString();
  const todayLogs = logs.filter(l => l.date === todayStr);

  const listMasuk = employees.filter(emp => {
    const log = todayLogs.find(l => l.employeeId === emp.id);
    return log && (log.status === 'Hadir' || log.status === 'Terlambat' || log.status === 'Pulang');
  });

  const listIzin = employees.filter(emp => {
    const log = todayLogs.find(l => l.employeeId === emp.id);
    return log && log.status === 'Izin';
  });

  const listTidakMasuk = employees.filter(emp => {
    const log = todayLogs.find(l => l.employeeId === emp.id);
    return !log;
  });

  // Reusable helper to request real-time coordinates from device browser with warm-up multi-attempt
  const getGPSLocation = (): Promise<{ latitude: number; longitude: number; accuracy?: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Browser Anda tidak mendukung pendeteksian lokasi GPS."));
        return;
      }

      const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      };

      // Helper for single attempt to query GPS position
      const attempt = (retryCount: number) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const acc = position.coords.accuracy;
            // If accuracy is high-quality (<= 60 meters) or we've retried already, resolve it.
            if (acc <= 60 || retryCount >= 1) {
              resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: acc
              });
            } else {
              // Otherwise, wait 1000ms and try again to allow GPS hardware to refine its lock (warm up)
              setTimeout(() => {
                navigator.geolocation.getCurrentPosition(
                  (pos2) => {
                    resolve({
                      latitude: pos2.coords.latitude,
                      longitude: pos2.coords.longitude,
                      accuracy: pos2.coords.accuracy
                    });
                  },
                  () => {
                    // Fallback to the first reading if second attempt fails
                    resolve({
                      latitude: position.coords.latitude,
                      longitude: position.coords.longitude,
                      accuracy: acc
                    });
                  },
                  options
                );
              }, 1000);
            }
          },
          (error) => {
            let msg = "Gagal mendeteksi lokasi GPS Anda.";
            if (error.code === error.PERMISSION_DENIED) {
              msg = "Izin akses lokasi ditolak oleh browser Anda. Mohon aktifkan izin GPS / Lokasi untuk melanjutkan.";
            } else if (error.code === error.POSITION_UNAVAILABLE) {
              msg = "Informasi lokasi tidak tersedia dari pemancar GPS atau jaringan Anda.";
            } else if (error.code === error.TIMEOUT) {
              msg = "Waktu permintaan lokasi habis (timeout). Silakan coba lagi.";
            }
            reject(new Error(msg));
          },
          options
        );
      };

      attempt(0);
    });
  };

  // Action: Employee checking their own location/GPS
  const handleCheckEmployeeGPS = async () => {
    setCheckingGps(true);
    setFeedbackMsg(null);
    try {
      const coords = await getGPSLocation();
      const dist = calculateDistance(
        coords.latitude,
        coords.longitude,
        storeLocation.latitude,
        storeLocation.longitude
      );
      
      const allowedRadius = storeLocation.radius || 50;
      // Berikan toleransi akurasi GPS HP maksimal ±120 meter jika sinyal HP melemah dalam gedung
      const accuracyBuffer = Math.min(120, coords.accuracy || 0);
      const allowedRadiusWithBuffer = allowedRadius + accuracyBuffer;
      const inRange = dist <= allowedRadiusWithBuffer;
      
      let addressResult = '';
      try {
        // Fetch Indonesian reverse address lookup from OpenStreetMap free Nominatim API
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=id`, {
          headers: {
            'User-Agent': 'DG-Komputer-Attendance-App/1.0'
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.display_name) {
            addressResult = data.display_name;
          }
        }
      } catch (err) {
        console.warn("Reverse geocode failed:", err);
      }
      
      setEmployeeGpsResult({
        latitude: coords.latitude,
        longitude: coords.longitude,
        distance: dist,
        inRange,
        address: addressResult || `${storeLocation.name} (GPS Terdeteksi)`,
        accuracy: coords.accuracy
      });

      if (inRange) {
        speakIndonesian("Lokasi GPS Anda valid. Anda berada di dalam jangkauan kantor.");
      } else {
        speakIndonesian("Peringatan. Anda berada di luar jangkauan lokasi kantor.");
      }
    } catch (error: any) {
      console.error(error);
      const errMsg = error.message || String(error);
      setFeedbackMsg({
        type: 'error',
        text: `❌ ${errMsg}\n\n💡 TIP: Pastikan browser Anda diizinkan mengakses lokasi GPS Anda.`
      });
      playError();
      speakIndonesian("Gagal melacak lokasi GPS.");
    } finally {
      setCheckingGps(false);
    }
  };

  // Action: Clock In with automatic Geofence Location check
  const handleClockIn = async () => {
    if (!matchedEmployee) return;

    setSubmitting(true);
    setGpsLoading(true);
    setFeedbackMsg(null);
    setDetectedCoords(null);

    try {
      const coords = await getGPSLocation();
      const dist = calculateDistance(
        coords.latitude,
        coords.longitude,
        storeLocation.latitude,
        storeLocation.longitude
      );

      // Save detected state for user review / debug info
      setDetectedCoords({
        latitude: coords.latitude,
        longitude: coords.longitude,
        distance: dist,
        accuracy: coords.accuracy
      });

      const allowedRadius = storeLocation.radius || 50;
      // Berikan toleransi akurasi GPS HP maksimal ±120 meter jika sinyal HP melemah dalam gedung
      const accuracyBuffer = Math.min(120, coords.accuracy || 0);
      const allowedRadiusWithBuffer = allowedRadius + accuracyBuffer;

      if (dist > allowedRadiusWithBuffer) {
        setSubmitting(false);
        setGpsLoading(false);
        const distanceStr = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km` : `${dist.toFixed(0)} meter`;
        const radiusStr = `${allowedRadius} meter (ditambah toleransi akurasi HP Anda ±${accuracyBuffer.toFixed(0)}m = ${allowedRadiusWithBuffer.toFixed(0)} meter)`;
        const errMsg = `Gagal Absen! Anda berada sejauh ${distanceStr} dari toko. Batas radius absensi maksimal adalah ${radiusStr}.`;
        
        setFeedbackMsg({ 
          type: 'error', 
          text: `❌ ${errMsg} (Koordinat GPS Anda saat ini: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)} dengan akurasi ±${(coords.accuracy || 0).toFixed(0)}m).` 
        });
        
        playError();
        speakIndonesian(`Gagal absen masuk. Anda berada di luar radius lokasi toko.`);
        return;
      }

      // Valid GPS, proceed with clock in
      const todayStr = getLocalDateString();
      const currentTime = new Date();
      const clockInStr = currentTime.toLocaleTimeString('id-ID');

      if (todayLog) {
        // If there is an existing log (e.g. they clocked out first), update it
        let workingHoursCalculated = undefined;
        if (todayLog.clockOut && todayLog.clockOut !== '--:--:--') {
          const parts = clockInStr.split(':').map(Number);
          const outParts = todayLog.clockOut.split(':').map(Number);
          if (parts.length >= 2 && outParts.length >= 2 && !isNaN(parts[0]) && !isNaN(outParts[0])) {
            const inMins = parts[0] * 60 + parts[1];
            const outMins = outParts[0] * 60 + outParts[1];
            const totalMins = outMins - inMins;
            workingHoursCalculated = parseFloat((Math.max(0, totalMins) / 60).toFixed(2));
          }
        }

        const updatedLog: AttendanceLog = {
          ...todayLog,
          clockIn: clockInStr,
          status: (todayLog.clockOut && todayLog.clockOut !== '--:--:--') ? 'Pulang' : 'Hadir',
          workingHours: workingHoursCalculated,
          latitude: coords.latitude,
          longitude: coords.longitude,
          notes: todayLog.notes ? `${todayLog.notes} & Masuk (GPS Ok)` : `Masuk tepat waktu (Presisi GPS: ${dist.toFixed(0)}m dari Toko)`
        };
        onUpdateLog(updatedLog);
      } else {
        const newLog: AttendanceLog = {
          id: `LOG-${matchedEmployee.id}-${todayStr}`,
          employeeId: matchedEmployee.id,
          employeeName: matchedEmployee.name,
          date: todayStr,
          shiftId: 'S1',
          shiftName: 'Harian',
          clockIn: clockInStr,
          clockOut: '--:--:--',
          status: 'Hadir',
          notes: `Masuk tepat waktu (Presisi GPS: ${dist.toFixed(0)}m dari Toko)`,
          workingHours: undefined,
          latitude: coords.latitude,
          longitude: coords.longitude,
          address: `${storeLocation.name} (GPS Ok)`
        };
        onAddLog(newLog);
      }

      setSubmitting(false);
      setGpsLoading(false);
      playSuccessIn();
      const voiceText = `${matchedEmployee.name} telah absen masuk. Semangat bekerja dan jaga kesehatan!`;
      speakIndonesian(voiceText);
      setFeedbackMsg({ 
        type: 'success', 
        text: `🎉 Hore! ${matchedEmployee.name} telah berhasil absen masuk pada pukul ${clockInStr}. Posisi Anda berada di radius aman: ${dist.toFixed(0)} meter dari toko (maksimal ${allowedRadius} meter). Semangat kerjanya yaa! 💪✨` 
      });

    } catch (err: any) {
      setSubmitting(false);
      setGpsLoading(false);
      const errMsg = err.message || "Gagal mendeteksi lokasi GPS.";
      setFeedbackMsg({ 
        type: 'error', 
        text: `❌ ${errMsg}\n\n💡 TIP TESTING: Jika Anda menggunakan Iframe Preview di AI Studio, mohon klik tombol "Open in new tab" di kanan atas browser agar izin lokasi diizinkan.` 
      });
      playError();
      speakIndonesian("Gagal melacak lokasi GPS Anda. Silakan beri izin akses lokasi.");
    }
  };

  // Action: Clock Out with automatic Geofence Location check
  const handleClockOut = async () => {
    if (!matchedEmployee) return;

    setSubmitting(true);
    setGpsLoading(true);
    setFeedbackMsg(null);
    setDetectedCoords(null);

    try {
      const coords = await getGPSLocation();
      const dist = calculateDistance(
        coords.latitude,
        coords.longitude,
        storeLocation.latitude,
        storeLocation.longitude
      );

      setDetectedCoords({
        latitude: coords.latitude,
        longitude: coords.longitude,
        distance: dist,
        accuracy: coords.accuracy
      });

      const allowedRadius = storeLocation.radius || 50;
      // Berikan toleransi akurasi GPS HP maksimal ±120 meter jika sinyal HP melemah dalam gedung
      const accuracyBuffer = Math.min(120, coords.accuracy || 0);
      const allowedRadiusWithBuffer = allowedRadius + accuracyBuffer;

      if (dist > allowedRadiusWithBuffer) {
        setSubmitting(false);
        setGpsLoading(false);
        const distanceStr = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km` : `${dist.toFixed(0)} meter`;
        const radiusStr = `${allowedRadius} meter (ditambah toleransi akurasi HP Anda ±${accuracyBuffer.toFixed(0)}m = ${allowedRadiusWithBuffer.toFixed(0)} meter)`;
        const errMsg = `Gagal Absen! Anda berada sejauh ${distanceStr} dari toko. Batas radius absensi maksimal adalah ${radiusStr}.`;
        
        setFeedbackMsg({ 
          type: 'error', 
          text: `❌ ${errMsg} (Koordinat GPS Anda saat ini: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)} dengan akurasi ±${(coords.accuracy || 0).toFixed(0)}m).` 
        });
        
        playError();
        speakIndonesian(`Gagal absen pulang. Anda berada di luar radius lokasi toko.`);
        return;
      }

      // Valid GPS, proceed with clock out
      const todayStr = getLocalDateString();
      const currentTime = new Date();
      const clockOutStr = currentTime.toLocaleTimeString('id-ID');

      if (todayLog) {
        // Calculate working hours
        let workingHoursCalculated = undefined;
        if (todayLog.clockIn && todayLog.clockIn !== '--:--:--') {
          const inParts = todayLog.clockIn.split(':').map(Number);
          const outH = currentTime.getHours();
          const outM = currentTime.getMinutes();
          if (inParts.length >= 2 && !isNaN(inParts[0]) && !isNaN(inParts[1])) {
            const totalMins = (outH * 60 + outM) - (inParts[0] * 60 + inParts[1]);
            workingHoursCalculated = parseFloat((Math.max(0, totalMins) / 60).toFixed(2));
          }
        }

        const updatedLog: AttendanceLog = {
          ...todayLog,
          clockOut: clockOutStr,
          status: 'Pulang',
          workingHours: workingHoursCalculated,
          latitude: coords.latitude,
          longitude: coords.longitude,
          notes: todayLog.notes ? `${todayLog.notes} & Pulang (GPS Ok)` : `Pulang (Presisi GPS: ${dist.toFixed(0)}m dari Toko)`
        };

        onUpdateLog(updatedLog);
      } else {
        const newLog: AttendanceLog = {
          id: `LOG-${matchedEmployee.id}-${todayStr}`,
          employeeId: matchedEmployee.id,
          employeeName: matchedEmployee.name,
          date: todayStr,
          shiftId: 'S1',
          shiftName: 'Harian',
          clockIn: '--:--:--',
          clockOut: clockOutStr,
          status: 'Pulang',
          workingHours: undefined,
          latitude: coords.latitude,
          longitude: coords.longitude,
          address: `${storeLocation.name} (GPS Ok)`,
          notes: `Pulang langsung (Presisi GPS: ${dist.toFixed(0)}m dari Toko)`
        };
        onAddLog(newLog);
      }

      setSubmitting(false);
      setGpsLoading(false);
      playSuccessOut();
      const voiceText = `${matchedEmployee.name} telah absen pulang. Hati-hati di jalan!`;
      speakIndonesian(voiceText);
      setFeedbackMsg({ 
        type: 'success', 
        text: `🏡 Terima kasih! ${matchedEmployee.name} telah berhasil absen pulang pada pukul ${clockOutStr}. Jarak Anda ke toko: ${dist.toFixed(0)} meter (maksimal ${allowedRadius} meter). Hati-hati di jalan yaa! 🚗✨` 
      });

    } catch (err: any) {
      setSubmitting(false);
      setGpsLoading(false);
      const errMsg = err.message || "Gagal mendeteksi lokasi GPS.";
      setFeedbackMsg({ 
        type: 'error', 
        text: `❌ ${errMsg}\n\n💡 TIP TESTING: Jika Anda menggunakan Iframe Preview di AI Studio, mohon klik tombol "Open in new tab" di kanan atas browser agar izin lokasi diizinkan.` 
      });
      playError();
      speakIndonesian("Gagal melacak lokasi GPS Anda. Silakan beri izin akses lokasi.");
    }
  };

  // Action: Izin Tidak Masuk (Cuti/Izin/Sakit)
  const handleLeaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchedEmployee || !leaveReason.trim()) return;

    setSubmitting(true);
    const todayStr = getLocalDateString();
    
    // Generate unique ID for the leave request
    const leaveId = `LV-${Date.now().toString().slice(-6)}`;

    const newLeave: LeaveRequest = {
      id: leaveId,
      employeeId: matchedEmployee.id,
      employeeName: matchedEmployee.name,
      type: leaveType,
      startDate: leaveStartDate,
      endDate: leaveEndDate,
      reason: leaveReason,
      status: 'Pending',
      createdAt: todayStr
    };

    setTimeout(() => {
      if (onAddLeave) {
        onAddLeave(newLeave);
      } else {
        const storedLeaves = localStorage.getItem('absensi_leaves');
        const parsed = storedLeaves ? JSON.parse(storedLeaves) : [];
        const updated = [newLeave, ...parsed];
        localStorage.setItem('absensi_leaves', JSON.stringify(updated));
      }
      
      setSubmitting(false);
      setLeaveReason('');
      setShowLeaveInput(false);
      playIzin();
      const voiceText = `Pengajuan ${leaveType} untuk ${matchedEmployee.name} berhasil diajukan ke admin.`;
      speakIndonesian(voiceText);
      setFeedbackMsg({ 
        type: 'success', 
        text: `🙏 Pengajuan ${leaveType} untuk ${matchedEmployee.name} berhasil dikirim ke Admin untuk disetujui (Status: Pending). Alasan: "${leaveReason}". ✨` 
      });
    }, 400);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      

      
      {isAbsensiClosed && (
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row items-center gap-5">
          <div className="w-14 h-14 bg-rose-600 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md shadow-rose-200">
            <ShieldAlert className="w-8 h-8 animate-bounce" />
          </div>
          <div className="text-center md:text-left space-y-1 flex-1">
            <h3 className="text-sm font-extrabold text-rose-900 uppercase tracking-wide">Sistem Absensi Ditutup / Di Luar Jam Kerja</h3>
            <p className="text-xs text-rose-700 leading-relaxed font-bold">
              Maaf, saat ini sistem absensi karyawan DG Komputer sedang dinonaktifkan sementara oleh Admin. Anda tidak dapat melakukan absen masuk, absen pulang, atau pengajuan izin harian saat ini.
            </p>
            <p className="text-[10px] text-rose-500 font-semibold uppercase tracking-wider">
              Akses akan dibuka kembali pada jam operasional kerja berikutnya. Silakan hubungi Admin jika terdapat kendala darurat.
            </p>
          </div>
        </div>
      )}

      {/* Notification banner was removed from main entry flow and replaced with an elegant Claude-style floating bottom prompt overlay */}

      {/* CARD CEK LOKASI & GPS HP KARYAWAN */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg shadow-sm">
              📍
            </div>
            <div>
              <h4 className="font-extrabold text-slate-800 text-sm tracking-tight">Cek Lokasi GPS HP Karyawan</h4>
              <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mt-0.5">
                Pastikan Anda berada di area kantor sebelum melakukan absensi
              </p>
            </div>
          </div>
          
          <button
            type="button"
            onClick={handleCheckEmployeeGPS}
            disabled={checkingGps}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center space-x-2 shadow-xs cursor-pointer ${
              checkingGps
                ? 'bg-slate-100 text-slate-400 border border-slate-200 animate-pulse cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 hover:shadow-md'
            }`}
          >
            {checkingGps ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
                <span>Mendeteksi...</span>
              </>
            ) : (
              <>
                <span>📍 Dapatkan GPS HP</span>
              </>
            )}
          </button>
        </div>

        {employeeGpsResult ? (
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-4 animate-fadeIn">
            <div className="flex justify-between items-center border-b border-slate-200/60 pb-2.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">HASIL DETEKSI GPS HP</span>
              <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider ${
                employeeGpsResult.inRange 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                  : 'bg-rose-100 text-rose-800 border border-rose-200'
              }`}>
                {employeeGpsResult.inRange ? '✅ DI DALAM JANGKAUAN' : '❌ DI LUAR JANGKAUAN'}
              </span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold">
              <div className="bg-white p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Latitude</span>
                <span className="font-mono font-bold text-slate-700">{employeeGpsResult.latitude.toFixed(6)}</span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Longitude</span>
                <span className="font-mono font-bold text-slate-700">{employeeGpsResult.longitude.toFixed(6)}</span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Jarak ke Kantor</span>
                <span className={`font-bold ${employeeGpsResult.inRange ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {employeeGpsResult.distance >= 1000 
                    ? `${(employeeGpsResult.distance / 1000).toFixed(2)} km` 
                    : `${employeeGpsResult.distance.toFixed(0)} meter`
                  }
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Batas Jangkauan (+Toleransi)</span>
                <span className="text-indigo-600 font-bold block">
                  {storeLocation.radius || 50} meter
                  {employeeGpsResult.accuracy !== undefined && (
                    <span className="text-[9px] text-amber-600 block mt-0.5 font-extrabold uppercase">
                      +HP ±{Math.min(120, employeeGpsResult.accuracy).toFixed(0)}m
                    </span>
                  )}
                </span>
              </div>
            </div>

            {employeeGpsResult.address && (
              <div className="pt-2 border-t border-slate-200/60 bg-white/50 p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider mb-0.5">Alamat Terdeteksi</span>
                <p className="text-[10px] text-slate-600 font-bold leading-relaxed">{employeeGpsResult.address}</p>
              </div>
            )}
            
            <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100/40 text-[11px] text-slate-600 font-bold leading-relaxed flex items-start space-x-2">
              <span className="text-base select-none leading-none">💡</span>
              <span>
                {employeeGpsResult.inRange 
                  ? `Lokasi GPS Anda valid! Anda berada di radius aman (${employeeGpsResult.distance.toFixed(0)}m dari toko, dengan toleransi akurasi GPS HP sebesar ±${(employeeGpsResult.accuracy || 0).toFixed(0)}m). Silakan masukkan UID atau scan QR Code di bawah ini untuk melakukan absensi.` 
                  : `Anda berada di luar radius lokasi kantor. Jarak Anda saat ini ${employeeGpsResult.distance >= 1000 ? `${(employeeGpsResult.distance / 1000).toFixed(2)} km` : `${employeeGpsResult.distance.toFixed(0)} meter`}. Batas maksimal yang disetujui toko adalah ${storeLocation.radius || 50} meter ditambah toleransi HP Anda ±${(employeeGpsResult.accuracy || 0).toFixed(0)}m (Total: ${((storeLocation.radius || 50) + Math.min(120, employeeGpsResult.accuracy || 0)).toFixed(0)}m). Pastikan GPS HP aktif dan Anda berada di luar ruangan agar sinyal satelit lebih kuat.`}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-4">
            <p className="text-[11px] text-slate-500 font-bold leading-relaxed max-w-md mx-auto">
              Silakan klik tombol <strong className="text-indigo-600">📍 Dapatkan GPS HP</strong> di atas untuk mengukur posisi koordinat & jarak presisi Anda saat ini dari kantor <strong className="text-slate-700">{storeLocation.name}</strong>.
            </p>
          </div>
        )}
      </div>

      {/* MANUAL UID INPUT AND LIVE QR CODE CAMERA SCANNER CONTAINER */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-6">
        
        {/* Manual Input Section */}
        <div className="space-y-2">
          <label className="text-xs font-black text-slate-500 uppercase tracking-widest block">
            Isi Manual UID Karyawan
          </label>
          <div className="relative">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="Masukan UID atau NIK LENGKAP Anda (Contoh: EMP001, DG01112001)..."
              value={uidInput}
              onChange={(e) => {
                setUidInput(e.target.value);
                setFeedbackMsg(null);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-12 py-3.5 text-sm font-black text-slate-800 placeholder:text-slate-400 placeholder:font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all uppercase"
            />
            {uidInput && (
              <button
                type="button"
                onClick={() => {
                  setUidInput('');
                  setFeedbackMsg(null);
                }}
                className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Live Camera QR Scanner Section */}
        <div className="border-t border-slate-100 pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Camera className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                Scan QR Manual Kamera Belakang
              </span>
            </div>
            
            <button
              id="toggle-camera-btn"
              onClick={() => {
                setScannerActive(!scannerActive);
                setFeedbackMsg(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all flex items-center space-x-1.5 ${
                scannerActive 
                  ? 'bg-rose-500 text-white shadow-xs' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-100'
              }`}
            >
              {scannerActive ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
              <span>{scannerActive ? 'Matikan Kamera' : 'Nyalakan Kamera'}</span>
            </button>
          </div>

          {scannerActive && (
            <div className="relative max-w-sm mx-auto overflow-hidden rounded-2xl border-4 border-indigo-600 bg-slate-950 shadow-lg">
              <div 
                id="qr-reader-container" 
                className="w-full h-64 md:h-72"
              ></div>
              <div className="absolute inset-x-0 bottom-4 text-center z-10">
                <span className="bg-slate-950/80 backdrop-blur-xs text-[10px] font-extrabold text-white px-3 py-1 rounded-full uppercase tracking-widest border border-white/20">
                  Arahkan QR Code ke Kotak Kamera
                </span>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* 2. MATCHED EMPLOYEE DETAILS SECTION */}
      <AnimatePresence mode="wait">
        {matchedEmployee ? (
          <motion.div
            key={matchedEmployee.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 md:grid-cols-12 gap-6"
          >
            {/* Left Column: ID Card */}
            <div className="md:col-span-7 flex items-center justify-center py-2">
                {/* Left KTP style card wrapper */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-white via-blue-50/50 to-indigo-50/50 text-slate-800 p-6 md:p-8 shadow-xl border-4 border-blue-600 select-none w-full">
                  {/* Hologram details */}
                  <div className="absolute top-4 right-4 bg-blue-600/95 backdrop-blur-xs text-[9px] font-mono px-2 py-0.5 rounded-md border border-blue-400/30 text-white font-bold tracking-widest leading-none">
                    SECURE CHIP
                  </div>

                  <div className="relative z-10 grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
                    
                    {/* Portrait Column */}
                    <div className="sm:col-span-5 flex flex-col items-center">
                      <div className="relative w-36 h-48 bg-slate-100 border-3 border-blue-200 rounded-xl overflow-hidden shadow-md">
                        <img 
                          src={matchedEmployee.avatar} 
                          alt={matchedEmployee.name} 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="w-full bg-blue-600 border border-blue-500 rounded-xl p-2.5 text-center mt-3 shadow-md space-y-0.5">
                        <span className="text-xs font-black tracking-wider uppercase text-white block truncate">
                          {matchedEmployee.name}
                        </span>
                        <span className="text-[10px] font-extrabold tracking-widest text-blue-100 uppercase block">
                          {matchedEmployee.role}
                        </span>
                      </div>
                    </div>

                    {/* Info details column */}
                    <div className="sm:col-span-7 flex flex-col justify-between h-full space-y-4">
                      <div className="flex items-start space-x-3 pb-2 border-b border-blue-100">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden ${systemLogo ? 'bg-white border border-slate-100' : 'bg-blue-50 border border-blue-200'}`}>
                          <img src={systemLogo || defaultLogo} alt="Logo" className={`w-full h-full ${systemLogo ? 'object-contain p-0.5' : 'object-cover p-1'}`} referrerPolicy="no-referrer" />
                        </div>
                        <div>
                          <h4 className="text-xs font-black tracking-tight text-blue-950 leading-none">DG KOMPUTER</h4>
                          <p className="text-[8px] text-slate-500 leading-tight mt-1">
                            LK.IV Kel. Rimba Asam, Banyuasin
                          </p>
                        </div>
                      </div>

                      <div className="text-center sm:text-left">
                        <span className="text-[10px] font-black tracking-[0.2em] text-blue-700 uppercase block font-sans bg-blue-50 px-3 py-1 rounded-full border border-blue-100 inline-block">
                          KARTU PEGAWAI
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs font-semibold text-slate-700">
                        <div className="flex items-center space-x-2.5 bg-white border border-blue-100/70 shadow-xs px-3 py-1.5 rounded-xl">
                          <span className="text-blue-600 font-bold w-8">ID</span>
                          <span className="text-blue-200">|</span>
                          <span className="font-mono text-slate-400 font-bold">●●●●●● (Tersembunyi)</span>
                        </div>
                        <div className="flex items-center space-x-2.5 bg-white border border-blue-100/70 shadow-xs px-3 py-1.5 rounded-xl">
                          <span className="text-blue-600 font-bold w-8">DEP</span>
                          <span className="text-blue-200">|</span>
                          <span className="text-slate-800 font-bold">{matchedEmployee.department}</span>
                        </div>
                        <div className="flex items-center space-x-2.5 bg-white border border-blue-100/70 shadow-xs px-3 py-1.5 rounded-xl">
                          <span className="text-blue-600 font-bold w-8">TEL</span>
                          <span className="text-blue-200">|</span>
                          <span className="font-mono text-slate-800 font-bold">{matchedEmployee.phone || '083862024525'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-blue-100 pt-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="flex items-center space-x-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Aktif</span>
                          </div>


                        </div>

                        {/* Premium QR Code */}
                        <div className="flex items-center space-x-2 bg-blue-50/50 border border-blue-100/70 p-1 rounded-xl">
                          <PremiumQRCode value={matchedEmployee.nik || matchedEmployee.id} />
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
            </div>

            {/* Right Column: Interactive Absen Panel or Payment submission */}
            <div className="md:col-span-5 space-y-4">
              
              {/* Feedback messages inside portal */}
              {feedbackMsg && (
                <div className={`p-4 rounded-2xl border text-xs font-bold flex items-start space-x-2.5 ${
                  feedbackMsg.type === 'success' 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{feedbackMsg.text}</span>
                </div>
              )}

              {/* Status information */}
              {todayLog && (
                <div className="bg-slate-900 text-white rounded-3xl p-4 shadow-sm border border-slate-800">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-2">
                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Sesi Hari Ini</span>
                    <span className="text-[9px] font-black bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded-full uppercase">
                      {todayLog.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs font-bold font-mono text-slate-300">
                    <div>
                      <span className="text-[8px] text-slate-500 block uppercase font-sans">Masuk (In)</span>
                      <span className="text-emerald-400">{todayLog.clockIn}</span>
                    </div>
                    <div>
                      <span className="text-[8px] text-slate-500 block uppercase font-sans">Pulang (Out)</span>
                      <span>{todayLog.clockOut || '--:--:--'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* MAIN 3 OPTIONS ABSENSI BOX */}
              <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-4 font-semibold text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-indigo-600 font-extrabold uppercase tracking-widest block">PILIHAN AKTIVITAS KERJA</span>
                    {isAbsensiClosed && (
                      <span className="text-[9px] font-black bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                        🔒 Terkunci
                      </span>
                    )}
                  </div>

                  {isAbsensiClosed && (
                    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3.5 text-center space-y-1">
                      <span className="text-[10px] font-black text-rose-800 uppercase tracking-wide block">⚠️ ABSENSI DITUTUP SEMENTARA</span>
                      <p className="text-[9px] text-rose-600 leading-relaxed font-semibold">
                        Tombol absensi dinonaktifkan sementara oleh Admin karena sedang berada di luar jam operasional kerja.
                      </p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {/* OPTION 1: ABSEN MASUK */}
                    <button
                      disabled={(todayLog && todayLog.clockIn && todayLog.clockIn !== '--:--:--') || (todayLog && todayLog.status === 'Izin') || isAbsensiClosed || submitting || gpsLoading}
                      onClick={handleClockIn}
                      className={`w-full py-3.5 px-4 rounded-xl flex items-center justify-between font-extrabold text-xs transition-all border ${
                        ((todayLog && todayLog.clockIn && todayLog.clockIn !== '--:--:--') || (todayLog && todayLog.status === 'Izin') || isAbsensiClosed)
                          ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                          : gpsLoading 
                            ? 'bg-indigo-400 border-indigo-400 text-white cursor-wait animate-pulse'
                            : 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-100 active:scale-[0.98] cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <LogIn className="w-4.5 h-4.5" />
                        <span>{gpsLoading ? '📡 Mendeteksi Lokasi GPS...' : '1. Absen Masuk'}</span>
                      </div>
                      {todayLog && todayLog.clockIn && todayLog.clockIn !== '--:--:--' && <span className="text-[9px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">SUDAH</span>}
                    </button>

                    {/* OPTION 2: ABSEN PULANG */}
                    <button
                      disabled={(todayLog && todayLog.clockOut && todayLog.clockOut !== '--:--:--') || (todayLog && todayLog.status === 'Izin') || isAbsensiClosed || submitting || gpsLoading}
                      onClick={handleClockOut}
                      className={`w-full py-3.5 px-4 rounded-xl flex items-center justify-between font-extrabold text-xs transition-all border ${
                        ((todayLog && todayLog.clockOut && todayLog.clockOut !== '--:--:--') || (todayLog && todayLog.status === 'Izin') || isAbsensiClosed)
                          ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                          : gpsLoading
                            ? 'bg-rose-400 border-rose-400 text-white cursor-wait animate-pulse'
                            : 'bg-rose-600 border-rose-600 text-white hover:bg-rose-700 shadow-md shadow-rose-100 active:scale-[0.98] cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <LogOut className="w-4.5 h-4.5" />
                        <span>{gpsLoading ? '📡 Mendeteksi Lokasi GPS...' : '2. Absen Pulang'}</span>
                      </div>
                      {todayLog && todayLog.clockOut && todayLog.clockOut !== '--:--:--' && <span className="text-[9px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">SUDAH</span>}
                    </button>

                    {/* Geofence target information badge */}
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1.5">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">🔒 GEOFENCING AKTIF (KOORDINAT TOKO)</span>
                      <p className="text-[10px] text-slate-600 font-bold leading-relaxed">
                        Lokasi Absensi: <span className="text-indigo-600">{storeLocation.name}</span>
                      </p>
                      <div className="flex justify-between text-[9px] font-mono text-slate-400">
                        <span>Lat: {storeLocation.latitude.toFixed(6)}</span>
                        <span>Lng: {storeLocation.longitude.toFixed(6)}</span>
                        <span className="text-indigo-600 font-bold bg-indigo-50 px-1 rounded">R: {storeLocation.radius || 50}m</span>
                      </div>

                      {detectedCoords && (
                        <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[9px] font-semibold text-slate-500">
                          <span>Jarak Anda saat ini:</span>
                          <span className={detectedCoords.distance <= (storeLocation.radius || 50) ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                            {detectedCoords.distance >= 1000 ? `${(detectedCoords.distance / 1000).toFixed(2)} km` : `${detectedCoords.distance.toFixed(0)} meter`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* OPTION 3: IZIN TIDAK MASUK */}
                    <div className="border-t border-slate-100 pt-3">
                      {!showLeaveInput ? (
                        <button
                          disabled={!!todayLog || isAbsensiClosed || submitting}
                          onClick={() => {
                            setShowLeaveInput(true);
                            setFeedbackMsg(null);
                          }}
                          className={`w-full py-3 px-4 rounded-xl flex items-center justify-center space-x-2 font-bold text-xs transition-all border cursor-pointer ${
                            todayLog || isAbsensiClosed
                              ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-white border-amber-300 text-amber-700 hover:bg-amber-50 active:scale-95'
                          }`}
                        >
                          <FileText className="w-4 h-4" />
                          <span>3. Izin Tidak Masuk</span>
                        </button>
                      ) : (
                        <form onSubmit={handleLeaveSubmit} className="space-y-3 bg-slate-50 p-4 rounded-3xl border border-amber-200/60 animate-fadeIn text-left">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-amber-950 uppercase tracking-widest block">PENGAJUAN CUTI / IZIN</span>
                            <button 
                              type="button" 
                              onClick={() => setShowLeaveInput(false)}
                              className="text-xs text-slate-400 hover:text-slate-600 font-extrabold"
                            >
                              Batal
                            </button>
                          </div>

                          {/* JENIS PENGAJUAN SELECTOR */}
                          <div className="space-y-1">
                            <span className="text-[9px] font-bold text-amber-800 uppercase tracking-widest block">Jenis Pengajuan</span>
                            <div className="grid grid-cols-3 gap-1.5">
                              {(['Izin', 'Cuti', 'Sakit'] as const).map(t => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => setLeaveType(t)}
                                  className={`py-2 px-3 rounded-xl font-bold text-xs border transition-all ${
                                    leaveType === t
                                      ? 'bg-amber-600 border-amber-600 text-white shadow-sm'
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* DATE RANGE SELECTORS */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <span className="text-[9px] font-bold text-amber-800 uppercase tracking-widest block">Tanggal Mulai</span>
                              <input
                                type="date"
                                required
                                value={leaveStartDate}
                                onChange={e => setLeaveStartDate(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-amber-400/20 text-slate-700"
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-[9px] font-bold text-amber-800 uppercase tracking-widest block">Tanggal Selesai</span>
                              <input
                                type="date"
                                required
                                value={leaveEndDate}
                                onChange={e => setLeaveEndDate(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-amber-400/20 text-slate-700"
                              />
                            </div>
                          </div>

                          {/* REASON INPUT */}
                          <div className="space-y-1">
                            <span className="text-[9px] font-bold text-amber-800 uppercase tracking-widest block">Alasan / Keterangan</span>
                            <input
                              type="text"
                              placeholder="Sakit, keperluan keluarga mendesak, dsb."
                              required
                              value={leaveReason}
                              onChange={e => setLeaveReason(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-amber-400/20 focus:border-amber-500 text-slate-700"
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={submitting}
                            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black text-xs py-2.5 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer mt-1"
                          >
                            Kirim Pengajuan
                          </button>
                        </form>
                      )}
                    </div>

                    {/* LIST OF CURRENT EMPLOYEE'S LEAVE REQUESTS */}
                    {matchedEmployee && leaveRequests.filter(req => req.employeeId === matchedEmployee.id).length > 0 && (
                      <div className="border-t border-slate-100 pt-3 space-y-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block text-left">📋 STATUS PERSETUJUAN CUTI & IZIN ANDA</span>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {leaveRequests
                            .filter(req => req.employeeId === matchedEmployee.id)
                            .map(req => {
                              const badgeColor = 
                                req.status === 'Disetujui' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                req.status === 'Ditolak' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                                'bg-amber-50 text-amber-700 border-amber-100';
                              return (
                                <div key={req.id} className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex items-center justify-between text-xs">
                                  <div className="space-y-0.5 text-left">
                                    <div className="flex items-center space-x-1.5">
                                      <span className="font-bold text-slate-800">{req.type}</span>
                                      <span className="text-[10px] text-slate-400 font-medium">({req.startDate === req.endDate ? req.startDate : `${req.startDate} s/d ${req.endDate}`})</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 italic truncate max-w-[180px]">"{req.reason}"</p>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border uppercase tracking-wider ${badgeColor}`}>
                                    {req.status === 'Pending' ? 'Pending' : req.status}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}



                  </div>
                </div>

            </div>



            {/* Riwayat Absensi Pribadi Anda */}
            <div className="col-span-1 md:col-span-12 mt-4">
              <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <Clock className="w-5 h-5 text-indigo-600 shrink-0" />
                    <div>
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                        📋 Riwayat Absensi Pribadi Anda
                      </h3>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                        Menampilkan histori kehadiran untuk {matchedEmployee.name}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2.5 py-1 rounded-full uppercase">
                    {logs.filter(log => log.employeeId === matchedEmployee.id).length} Absensi
                  </span>
                </div>

                <div className="overflow-x-auto">
                  {logs.filter(log => log.employeeId === matchedEmployee.id).length === 0 ? (
                    <div className="py-8 text-center text-slate-400 space-y-2">
                      <span className="text-2xl block">📅</span>
                      <p className="text-[11px] font-bold">Belum ada riwayat absensi tercatat.</p>
                      <p className="text-[10px] text-slate-400">Silakan lakukan absen masuk atau pulang untuk mencatat riwayat pertama Anda.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
                      {logs
                        .filter(log => log.employeeId === matchedEmployee.id)
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((log) => (
                          <div key={log.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                            <div className="flex items-center space-x-3 min-w-0">
                              <div className="bg-slate-50 text-slate-500 w-10 h-10 rounded-xl flex flex-col items-center justify-center font-mono text-[9px] font-black shrink-0 border border-slate-100">
                                <span className="text-slate-400 leading-none mb-0.5 uppercase text-[8px]">
                                  {new Date(log.date).toLocaleString('id-ID', { month: 'short' })}
                                </span>
                                <span className="text-slate-800 text-xs font-black leading-none">
                                  {new Date(log.date).getDate()}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <span className="text-[11px] font-black text-slate-800 block">
                                  {formatIndonesianDate(log.date)}
                                </span>
                                {log.notes && (
                                  <span className="text-[10px] text-slate-400 font-semibold block truncate max-w-xs md:max-w-md">
                                    {log.notes}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center flex-wrap gap-2 sm:justify-end">
                              {/* Jam Masuk */}
                              <div className="flex items-center space-x-1.5 bg-emerald-50/50 border border-emerald-100/60 text-emerald-800 px-2.5 py-1 rounded-xl">
                                <LogIn className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <div className="text-left leading-none">
                                  <span className="text-[8px] text-emerald-600/70 block font-semibold uppercase">Masuk</span>
                                  <span className="font-mono text-[10px] font-black">{log.clockIn || '--:--:--'}</span>
                                </div>
                              </div>

                              {/* Jam Pulang */}
                              <div className="flex items-center space-x-1.5 bg-rose-50/50 border border-rose-100/60 text-rose-800 px-2.5 py-1 rounded-xl">
                                <LogOut className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                <div className="text-left leading-none">
                                  <span className="text-[8px] text-rose-600/70 block font-semibold uppercase">Pulang</span>
                                  <span className="font-mono text-[10px] font-black">{log.clockOut || '--:--:--'}</span>
                                </div>
                              </div>

                              {/* Jam Kerja */}
                              {log.workingHours !== undefined && (
                                <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-xl">
                                  <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                  <span className="font-mono text-[10px] font-black">{log.workingHours} Jam</span>
                                </div>
                              )}

                              {/* Status Badge */}
                              <span className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                                log.status === 'Hadir' || log.status === 'Terlambat'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : log.status === 'Pulang'
                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                    : log.status === 'Izin'
                                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                      : 'bg-rose-100 text-rose-800 border border-rose-200'
                              }`}>
                                {log.status}
                              </span>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              </div>
            </div>

          </motion.div>
        ) : (
          <motion.div
            key="empty-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-xs space-y-3"
          >
            <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto border border-dashed border-slate-200">
              <UserCheck className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Menunggu Kode UID Karyawan</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              Silakan isi manual UID Karyawan di atas atau nyalakan <strong className="text-indigo-600">Scan QR Kamera Belakang</strong> untuk memindai kode QR.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. CLAS KARYAWAN HARI INI (MASUK, TIDAK MASUK, IZIN) */}
      <div className="mt-8 space-y-6">
        <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
              📊 Status Kehadiran Karyawan Hari Ini
            </h3>
            <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
              Daftar Real-Time Berdasarkan Status Absensi
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* KELAS MASUK */}
          <div className="bg-emerald-50/40 border border-emerald-100 rounded-3xl p-5 flex flex-col h-[400px]">
            <div className="flex items-center justify-between border-b border-emerald-100 pb-3 mb-3">
              <span className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shrink-0"></span>
                <span className="text-xs font-black text-emerald-950 uppercase tracking-wider">MASUK ({listMasuk.length})</span>
              </span>
              <span className="text-[10px] bg-emerald-600 text-white font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-widest">
                HADIR
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
              {listMasuk.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4">
                  <span className="text-lg">😴</span>
                  <p className="text-[11px] text-emerald-800/60 font-semibold mt-1">Belum ada karyawan masuk hari ini</p>
                </div>
              ) : (
                listMasuk.map(emp => {
                  const log = todayLogs.find(l => l.employeeId === emp.id);
                  return (
                    <div key={emp.id} className="bg-white p-3 rounded-2xl border border-emerald-100 shadow-xs flex items-center space-x-3 transition-all hover:scale-[1.02]">
                      <img src={emp.avatar} alt={emp.name} className="w-9 h-9 rounded-xl object-cover border border-emerald-100 shrink-0" referrerPolicy="no-referrer" />
                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] font-black text-slate-800 block truncate">{emp.name}</span>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          <span className="text-[9px] font-bold text-slate-400 font-mono">ID: ●●●●●●</span>
                          <span className="text-[9px] font-extrabold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded font-mono">
                            {log?.clockIn}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* KELAS TIDAK MASUK */}
          <div className="bg-rose-50/40 border border-rose-100 rounded-3xl p-5 flex flex-col h-[400px]">
            <div className="flex items-center justify-between border-b border-rose-100 pb-3 mb-3">
              <span className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 bg-rose-500 rounded-full shrink-0"></span>
                <span className="text-xs font-black text-rose-950 uppercase tracking-wider">TIDAK MASUK ({listTidakMasuk.length})</span>
              </span>
              <span className="text-[10px] bg-rose-600 text-white font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-widest">
                ABSEN
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
              {listTidakMasuk.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4">
                  <span className="text-lg">🎉</span>
                  <p className="text-[11px] text-rose-800/60 font-semibold mt-1">Semua karyawan sudah berpartisipasi</p>
                </div>
              ) : (
                listTidakMasuk.map(emp => (
                  <div key={emp.id} className="bg-white p-3 rounded-2xl border border-rose-100 shadow-xs flex items-center space-x-3 transition-all hover:scale-[1.02]">
                    <img src={emp.avatar} alt={emp.name} className="w-9 h-9 rounded-xl object-cover border border-rose-100 shrink-0" referrerPolicy="no-referrer" />
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] font-black text-slate-800 block truncate">{emp.name}</span>
                      <span className="text-[9px] font-bold text-slate-400 block mt-0.5">UID: <span className="font-mono font-bold text-slate-400">●●●●●● (Tersembunyi)</span></span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* KELAS IZIN */}
          <div className="bg-amber-50/40 border border-amber-100 rounded-3xl p-5 flex flex-col h-[400px]">
            <div className="flex items-center justify-between border-b border-amber-100 pb-3 mb-3">
              <span className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 bg-amber-500 rounded-full shrink-0"></span>
                <span className="text-xs font-black text-amber-950 uppercase tracking-wider">IZIN ({listIzin.length})</span>
              </span>
              <span className="text-[10px] bg-amber-600 text-white font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-widest">
                CUTI
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
              {listIzin.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4">
                  <span className="text-lg">📄</span>
                  <p className="text-[11px] text-amber-800/60 font-semibold mt-1">Tidak ada karyawan izin hari ini</p>
                </div>
              ) : (
                listIzin.map(emp => {
                  const log = todayLogs.find(l => l.employeeId === emp.id);
                  return (
                    <div key={emp.id} className="bg-white p-3 rounded-2xl border border-amber-100 shadow-xs flex items-center space-x-3 transition-all hover:scale-[1.02]">
                      <img src={emp.avatar} alt={emp.name} className="w-9 h-9 rounded-xl object-cover border border-amber-100 shrink-0" referrerPolicy="no-referrer" />
                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] font-black text-slate-800 block truncate">{emp.name}</span>
                        <div className="mt-0.5 space-y-0.5">
                          <span className="text-[9px] font-bold text-slate-400">ID: <span className="font-mono text-slate-400">●●●●●●</span></span>
                          <p className="text-[9px] font-semibold text-amber-800 italic truncate bg-amber-50 px-1.5 py-0.5 rounded">
                            "{log?.notes || 'Izin Mandiri'}"
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>



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
