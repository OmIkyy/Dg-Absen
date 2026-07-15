import { supabase } from './supabaseClient';

export interface OneSignalConfig {
  appId: string;
  apiKey: string;
  enabled: boolean;
}

// Get OneSignal config from local storage or fallback to env variables
export function getOneSignalConfig(): OneSignalConfig {
  const saved = localStorage.getItem('absensi_onesignal_settings');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        appId: parsed.appId || '',
        apiKey: parsed.apiKey || '',
        enabled: parsed.enabled !== false,
      };
    } catch (e) {
      console.error('Error loading local OneSignal config:', e);
    }
  }

  // Fallback to env
  const metaEnv = (import.meta as any).env || {};
  return {
    appId: metaEnv.VITE_ONESIGNAL_APP_ID || '',
    apiKey: metaEnv.VITE_ONESIGNAL_REST_API_KEY || '',
    enabled: !!(metaEnv.VITE_ONESIGNAL_APP_ID),
  };
}

// Save OneSignal config
export function saveOneSignalConfig(config: OneSignalConfig) {
  localStorage.setItem('absensi_onesignal_settings', JSON.stringify(config));
  window.dispatchEvent(new Event('absensi_onesignal_settings_updated'));
}

// Initialize OneSignal on client-side
export function initOneSignal() {
  if (typeof window === 'undefined') return;
  const config = getOneSignalConfig();
  if (!config.enabled || !config.appId) {
    console.log('[OneSignal] SDK not initialized: App ID not configured or disabled.');
    return;
  }

  // Create or retrieve global OneSignal deferred array
  (window as any).OneSignalDeferred = (window as any).OneSignalDeferred || [];

  // Inject script if not present
  if (!document.getElementById('onesignal-sdk')) {
    const script = document.createElement('script');
    script.id = 'onesignal-sdk';
    script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    script.async = true;
    document.head.appendChild(script);
  }

  // Queue initialization
  (window as any).OneSignalDeferred.push(async function(OneSignal: any) {
    try {
      await OneSignal.init({
        appId: config.appId,
        allowLocalhostAsSecureOrigin: true,
        notifyButton: {
          enable: false,
        },
      });
      console.log('[OneSignal] SDK successfully initialized with App ID:', config.appId);
    } catch (err) {
      console.error('[OneSignal] Init error:', err);
    }
  });
}

// Trigger browser native subscription modal
export function promptOneSignalPush() {
  if (typeof window === 'undefined') return;
  (window as any).OneSignalDeferred = (window as any).OneSignalDeferred || [];
  (window as any).OneSignalDeferred.push(async function(OneSignal: any) {
    try {
      await OneSignal.Notifications.requestPermission();
      console.log('[OneSignal] Requested Notification Permission');
    } catch (err) {
      console.error('[OneSignal] Permission prompt error:', err);
    }
  });
}

// Send OneSignal push notification using REST API
export async function sendOneSignalPushNotification(title: string, body: string): Promise<boolean> {
  const config = getOneSignalConfig();
  if (!config.enabled || !config.appId || !config.apiKey) {
    console.warn('[OneSignal] Cannot send push notification: missing appId or apiKey in configuration.');
    return false;
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Basic ${config.apiKey}`
      },
      body: JSON.stringify({
        app_id: config.appId,
        included_segments: ['Subscribed Users'],
        headings: { en: title, id: title },
        contents: { en: body, id: body },
        chrome_web_icon: 'https://ais-pre-kxhww2t5meibwb3b2ncvg6-354059991858.asia-east1.run.app/logo.jpg',
        firefox_icon: 'https://ais-pre-kxhww2t5meibwb3b2ncvg6-354059991858.asia-east1.run.app/logo.jpg',
      })
    });

    const data = await response.json();
    if (response.ok) {
      console.log('[OneSignal] Push notification sent successfully:', data);
      return true;
    } else {
      console.error('[OneSignal] API responded with error:', data);
      return false;
    }
  } catch (err) {
    console.error('[OneSignal] Network error sending push notification:', err);
    return false;
  }
}
