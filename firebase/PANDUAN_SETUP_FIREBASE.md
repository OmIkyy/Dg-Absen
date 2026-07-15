# 🔔 Panduan Menghubungkan Firebase Cloud Messaging (FCM) untuk Alarm & Push Notifikasi

Dokumen ini menjelaskan langkah-demi-langkah cara membuat proyek di Firebase Console, mendapatkan kredensial, dan menghubungkannya ke aplikasi Absensi agar **notifikasi alarm tetap berbunyi di HP karyawan meskipun aplikasi telah ditutup, HP terkunci, atau saat HP baru dinyalakan kembali**.

---

## 📌 Mengapa Menggunakan Firebase Cloud Messaging?
Ketika karyawan keluar dari aplikasi atau mematikan layar HP mereka, proses JavaScript biasa di browser akan dihentikan oleh sistem operasi Android/iOS. 
Dengan menggunakan **Service Worker** yang tersambung ke **Firebase Cloud Messaging (FCM)**, Google Play Services di perangkat HP akan tetap mendengarkan sinyal "Push Alarm" dari admin dan langsung membangunkan HP karyawan untuk menampilkan notifikasi alarm secara instan.

---

## 🛠️ Langkah 1: Membuat Proyek Firebase Baru

1. Buka **[Firebase Console](https://console.firebase.google.com/)** di browser Anda.
2. Masuk menggunakan akun Google Anda.
3. Klik tombol **"Add project"** (Tambah proyek).
4. Masukkan nama proyek Anda, misalnya: `absensi-dg-komputer`.
5. Klik **"Continue"**. Anda bisa mengaktifkan atau menonaktifkan Google Analytics (bebas, disarankan dinonaktifkan jika tidak diperlukan agar proses lebih cepat).
6. Klik **"Create project"** dan tunggu hingga selesai, lalu klik **"Continue"**.

---

## 💻 Langkah 2: Mendaftarkan Aplikasi Web di Firebase

Setelah masuk ke dashboard proyek Firebase Anda:
1. Di tengah halaman dashboard, klik ikon **Web (`</>`)** untuk menambahkan aplikasi web.
2. Masukkan nama panggilan aplikasi, misalnya: `Absensi Web`.
3. Centang pilihan **"Also set up Firebase Hosting..."** jika Anda berencana meng-host di Firebase (opsional).
4. Klik **"Register app"**.
5. Firebase akan menampilkan kode konfigurasi JavaScript (**Firebase SDK config**). Salin nilai-nilai berikut karena Anda akan membutuhkannya untuk konfigurasi:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

---

## 🔑 Langkah 3: Mengambil Web Push Certificate (VAPID Key)

Kunci VAPID sangat penting agar browser mengizinkan Firebase mengirimkan notifikasi push secara aman tanpa perlu login:
1. Di Firebase Console, klik ikon roda gigi ⚙️ (**Project settings**) di menu samping kiri atas.
2. Pilih tab **"Cloud Messaging"** di bagian atas halaman.
3. Gulir ke bawah hingga bagian **"Web configuration"** -> **"Web Push certificates"**.
4. Klik tombol **"Generate key pair"**.
5. Anda akan mendapatkan baris kode panjang acak. Ini adalah **VAPID Key / Web Push Public Key** Anda. Salin kunci ini!

---

## ⚙️ Langkah 4: Mengonfigurasi Aplikasi Absensi Anda

Sekarang masukkan kredensial yang sudah Anda dapatkan ke dalam file konfigurasi proyek Anda.

### 1. Update File `.env` Anda
Buka file `.env` di server atau dashboard panel hosting Anda, lalu isi variabel berikut dengan data yang Anda salin tadi:

```env
# Firebase Cloud Messaging (FCM)
VITE_FIREBASE_API_KEY=Isi_dengan_apiKey_dari_Langkah_2
VITE_FIREBASE_PROJECT_ID=Isi_dengan_projectId_dari_Langkah_2
VITE_FIREBASE_MESSAGING_SENDER_ID=Isi_dengan_messagingSenderId_dari_Langkah_2
VITE_FIREBASE_APP_ID=Isi_dengan_appId_dari_Langkah_2
VITE_FIREBASE_VAPID_KEY=Isi_dengan_VAPID_Key_dari_Langkah_3
```

### 2. Update File `/public/firebase-messaging-sw.js`
Agar browser karyawan dapat mendengarkan notifikasi saat HP mereka mati atau aplikasi ditutup, sesuaikan konfigurasi di file `/public/firebase-messaging-sw.js` yang telah kami sediakan dengan memasukkan variabel milik Anda di sana.

---

## 🚨 Cara Kerja Pengiriman Notifikasi dari Admin

1. **Karyawan Membuka Web**: Saat karyawan mencocokkan identitas mereka untuk absensi pertama kali di HP mereka, browser secara otomatis meminta izin notifikasi dan mendaftarkan kode token FCM unik mereka ke tabel `fcm_tokens` di database.
2. **Admin Menekan Alarm**: Di panel admin, saat pengaturan waktu alarm aktif atau tombol alarm pengingat dipicu, sistem akan mengambil daftar token FCM aktif dan mengirimkan perintah push notification melalui Firebase API.
3. **Ponsel Terkunci / Mati**: Begitu internet aktif di HP karyawan, Google Play Services menerima sinyal ini dan Service Worker (`firebase-messaging-sw.js`) akan langsung memicu getaran keras (`vibrate`) dan memutar alarm pengingat.

---

### 💡 Tips Tambahan untuk Menjamin Alarm Berfungsi:
- **Izinkan Notifikasi di HP**: Pastikan karyawan memilih **"Allow" (Izinkan)** ketika muncul pop-up izin notifikasi di browser HP mereka (Google Chrome, Edge, atau Safari).
- **Pengaturan Hemat Daya HP**: Beberapa HP Android (seperti Xiaomi, Oppo, Vivo) memiliki manajemen baterai yang agresif. Harap beri tahu karyawan untuk mengubah setelan aplikasi browser mereka menjadi **"No Restrictions" (Tanpa Pembatasan)** pada menu Penghemat Baterai agar Service Worker tidak dimatikan paksa oleh Android.
