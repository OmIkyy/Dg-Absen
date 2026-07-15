import React, { useState, useEffect } from 'react';
import { Calendar, Clock, ShieldAlert, User, Database } from 'lucide-react';
// @ts-ignore
import defaultLogo from '../assets/logo.png';

interface HeaderProps {
  activeTab: 'employee' | 'admin' | '404';
  setActiveTab: (tab: 'employee' | 'admin' | '404') => void;
  isLockedEmployee?: boolean;
  systemLogo?: string;
  isAdminUnlocked?: boolean;
}

export default function Header({ activeTab, setActiveTab, isLockedEmployee = false, systemLogo = '', isAdminUnlocked = false }: HeaderProps) {
  const [time, setTime] = useState<Date>(new Date());
  const [logoSrc, setLogoSrc] = useState<string>('');
  const [logoError, setLogoError] = useState<boolean>(false);

  useEffect(() => {
    if (systemLogo) {
      setLogoSrc(systemLogo);
      setLogoError(false);
    } else {
      setLogoSrc(defaultLogo);
      setLogoError(false);
    }
  }, [systemLogo]);

  const handleLogoError = () => {
    if (logoSrc === defaultLogo) {
      setLogoSrc('/logo.jpg');
    } else {
      setLogoError(true);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <header className="bg-white border-b border-slate-100 sticky top-0 z-50 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 hover:scale-105 overflow-hidden ${(!logoError && logoSrc && logoSrc !== '/logo.png' && logoSrc !== '/logo.jpg') ? 'bg-white border border-slate-100' : 'bg-indigo-600 text-white shadow-md shadow-indigo-100'}`}>
              {!logoError && logoSrc ? (
                <img
                  src={logoSrc}
                  alt="Logo"
                  className={`w-full h-full ${(!logoError && logoSrc && logoSrc !== '/logo.png' && logoSrc !== '/logo.jpg') ? 'object-contain p-0.5' : 'object-cover'}`}
                  onError={handleLogoError}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Database className="w-5 h-5" />
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Absensi Karyawan Dg-Komputer
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Sistem Absensi Karyawan Terintegrasi
              </p>
            </div>
          </div>

          {/* Real-time Clock Dashboard */}
          <div className="flex items-center gap-4 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 self-start md:self-center">
            <div className="text-indigo-600">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div className="border-r border-slate-200 pr-3 mr-1">
              <span className="text-sm font-semibold font-mono text-slate-800">
                {formatTime(time)}
              </span>
              <span className="text-[10px] block font-semibold text-slate-400">WIB (Jakarta)</span>
            </div>
            <div className="flex items-center text-xs font-medium text-slate-600">
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
              {formatDate(time)}
            </div>
          </div>

          {/* Interactive Portal Switcher */}
          {isAdminUnlocked && (
            !isLockedEmployee ? (
              <div className="bg-slate-100 p-1 rounded-xl flex items-center space-x-1 border border-slate-200">
                <button
                  id="switch-employee-btn"
                  onClick={() => setActiveTab('employee')}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300 ${
                    activeTab === 'employee'
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>Portal Karyawan</span>
                </button>
                <button
                  id="switch-admin-btn"
                  onClick={() => setActiveTab('admin')}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300 ${
                    activeTab === 'admin'
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>Dashboard Admin</span>
                </button>
              </div>
            ) : (
              <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-4 py-2 rounded-xl flex items-center space-x-2 text-xs font-bold shadow-xs">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                <span>Portal Karyawan Terkunci</span>
              </div>
            )
          )}

        </div>
      </div>
    </header>
  );
}
