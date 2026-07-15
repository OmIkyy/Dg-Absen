// ====================================================================
// SERVICE WORKER UNTUK FIREBASE CLOUD MESSAGING (FCM) BACKGROUND PUSH
// ====================================================================
// File ini wajib diletakkan di folder public/ agar dapat diakses oleh browser di:
// https://domain-anda.com/firebase-messaging-sw.js
// ====================================================================

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// --------------------------------------------------------------------
// SILAKAN SUNTING BAGIAN INI DENGAN KONFIGURASI DARI FIREBASE CONSOLE ANDA:
// (Lihat Panduan Lengkap di folder /firebase/PANDUAN_SETUP_FIREBASE.md)
// --------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_FIREBASE_PROJECT_ID",
  storageBucket: "YOUR_FIREBASE_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
  appId: "YOUR_FIREBASE_APP_ID"
};

// Inisialisasi Firebase App
firebase.initializeApp(firebaseConfig);

// Ambil instansi Firebase Messaging
const messaging = firebase.messaging();

// Handle pesan masuk saat aplikasi sedang di latar belakang (background), ditutup, atau HP baru menyala kembali
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Menerima pesan push latar belakang:', payload);

  const title = payload.notification?.title || payload.data?.title || '🔔 Pengingat Absensi';
  const body = payload.notification?.body || payload.data?.body || 'Waktunya melakukan absensi masuk/pulang hari ini!';
  const icon = payload.notification?.icon || payload.data?.icon || '/logo.jpg';
  const tag = payload.data?.tag || 'absensi-alarm';

  const notificationOptions = {
    body: body,
    icon: icon,
    badge: '/logo.jpg',
    vibrate: [500, 150, 500, 150, 500, 150, 500], // Pola getaran alarm HP
    requireInteraction: true, // Notifikasi tidak akan hilang sampai ditutup/diklik pengguna
    renotify: true,
    tag: tag,
    data: payload.data || {}
  };

  return self.registration.showNotification(title, notificationOptions);
});

// Aksi ketika notifikasi push diklik oleh karyawan
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Buka atau fokus kembali ke tab aplikasi Absensi
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Cari tab yang sudah terbuka, lalu fokuskan
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Jika tab tidak terbuka, buka halaman utama
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
