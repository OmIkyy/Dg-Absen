# ⏰ Panduan Instalasi Aplikasi (PWA) & Alarm Absensi Harian

Dokumen ini berisi panduan lengkap untuk karyawan dan admin tentang cara menginstal sistem absensi ini menjadi aplikasi di ponsel (PWA) serta cara mengonfigurasi perangkat agar alarm pengingat absen harian selalu berbunyi nyaring, bahkan saat ponsel dalam keadaan standby, layar mati, atau aplikasi sedang ditutup.

---

## 📲 Cara Download / Instal Aplikasi Absensi di Handphone

Dengan menginstal website absensi ini menjadi aplikasi (PWA/Progressive Web App), aplikasi akan berjalan lebih cepat, hemat kuota, dan yang terpenting **mengizinkan alarm harian berbunyi di latar belakang**.

### 🤖 1. Pengguna Android (Google Chrome)
1. Buka browser **Google Chrome** di HP Anda.
2. Masuk ke link website absensi ini.
3. Klik tombol **titik tiga ( ⋮ )** di pojok kanan atas browser Google Chrome.
4. Pilih menu **"Instal aplikasi"** atau **"Tambahkan ke Layar Utama"**.
5. Konfirmasi pemasangan. Aplikasi akan otomatis muncul di daftar aplikasi HP Anda dengan logo absensi resmi.

### 🍏 2. Pengguna iPhone / iOS (Safari)
*Catatan khusus: Di perangkat Apple (iOS), izin notifikasi & alarm harian hanya bisa aktif setelah website ditambahkan ke layar utama terlebih dahulu.*
1. Buka browser bawaan **Safari** di iPhone Anda.
2. Masuk ke link website absensi ini.
3. Klik tombol **"Bagikan"** (ikon kotak dengan panah ke atas 📤 di bagian bawah layar Safari).
4. Gulir ke bawah dan ketuk pilihan **"Tambahkan ke Layar Utama" (Add to Home Screen)**.
5. Tekan **"Tambah" (Add)** di pojok kanan atas.
6. Sekarang, tutup Safari dan **buka aplikasi absensi dari ikon yang baru muncul di layar utama iPhone Anda**.

---

## 🔔 Cara Mengaktifkan Alarm Pengingat Harian agar Selalu Aktif

Setelah aplikasi berhasil diinstal di HP Anda, ikuti langkah-langkah penting berikut agar alarm pengingat harian (Absen Masuk & Absen Pulang) dapat berbunyi tepat waktu:

1. **Buka Aplikasi Absensi** yang sudah Anda instal di layar utama HP Anda.
2. Masukkan **ID Karyawan** Anda pada halaman awal agar sistem mendeteksi akun Anda.
3. Anda akan melihat **banner kuning di bagian atas** dengan tombol berwarna jingga bertuliskan:  
   👉 **"Aktifkan Notifikasi Sekarang"**
4. Tekan tombol tersebut. Browser/ponsel Anda akan menampilkan kotak persetujuan (pop-up) dari sistem operasi.
5. Pilih **"Izinkan" (Allow)**.
6. **Selesai!** Sistem secara otomatis akan menjadwalkan alarm harian selama 7 hari ke depan. Anda akan menerima notifikasi suara dan teks tepat pada jam masuk dan pulang kerja Anda setiap harinya.

---

## 💡 Mengapa Alarm Sangat Direkomendasikan Melalui PWA?
* **Latar Belakang Mandiri (Background Standby):** Begitu Anda memberikan izin notifikasi, sistem absensi menggunakan Service Worker modern yang terdaftar di sistem HP. Ponsel Anda akan menyimpan jadwal alarm secara lokal sehingga alarm tetap berbunyi sekalipun HP sedang terkunci di saku atau aplikasi sedang tidak dibuka.
* **Toleransi Terlewat:** Jika Anda terlambat membuka aplikasi melampaui jam masuk kerja, begitu Anda membuka aplikasi kembali, sistem akan mendeteksi keterlambatan tersebut dan memberikan peringatan suara serta pengingat visual instan agar Anda segera melakukan absensi.

---

*Selamat menggunakan Sistem Absensi Pintar DG Komputer! Jika Anda menemui kendala mengenai notifikasi, silakan buka menu Pengaturan Aplikasi di ponsel Anda dan pastikan Izin Notifikasi untuk aplikasi ini sudah diatur ke posisi 'Aktif'.*

---

## ⚙️ Panduan Konfigurasi Environment Variables (Koneksi Database & Notifikasi)

Untuk menghubungkan aplikasi ini dengan database Supabase Anda serta mengaktifkan fitur notifikasi alarm push via Firebase, Anda perlu mengisi variable di file `.env` Anda.

Berikut adalah panduan lengkap di mana letak masing-masing data tersebut di Dashboard layanan:

### ⚡ 1. Di mana Letak URL & API Key Supabase?

1. Masuk ke akun Anda di **[Supabase Dashboard](https://supabase.com)** dan buka proyek Anda.
2. Di menu bilah sisi kiri, klik ikon gerigi ⚙️ (**Project Settings**).
3. Setelah masuk ke halaman Settings, pilih menu **API** pada submenu di sebelah kiri.
4. Anda akan melihat dua bagian utama berikut:
   * **Project URL**:
     * Cari kolom bertuliskan **URL**. 
     * Salin link tersebut (misalnya `https://xyzabc.supabase.co`) dan masukkan ke **`VITE_SUPABASE_URL`**.
   * **Project API keys**:
      * Cari baris kunci bertuliskan **`anon` / `public`**.
      * Klik tombol **Copy** untuk menyalin kunci panjang tersebut, lalu masukkan ke **`VITE_SUPABASE_ANON_KEY`**.

---

### 🔥 2. Di mana Letak Kunci Firebase (FCM / Notifikasi Push)?

Notifikasi push dan alarm real-time di latar belakang menggunakan layanan **Firebase Cloud Messaging**. Berikut cara mendapatkan konfigurasinya:

1. Buka **[Firebase Console](https://console.firebase.google.com/)** dan buat atau pilih proyek Anda.
2. Klik ikon gerigi ⚙️ di sebelah tulisan **Project Overview** di bilah menu kiri, lalu pilih **Project settings**.
3. Di tab **General**, gulir ke bawah ke bagian **Your apps**.
   * *Jika belum memiliki aplikasi Web:* Klik tombol **Add app** (pilih ikon `< />` atau Web), masukkan nama aplikasi, lalu klik **Register app**.
4. Di bagian **Firebase SDK snippet**, pilih opsi **Config**. Anda akan melihat objek konfigurasi JavaScript seperti berikut:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     projectId: "proyek-anda",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef"
   };
   ```
5. Salin masing-masing nilai di atas dan tempelkan ke file `.env` sesuai dengan variabelnya:
   * `apiKey` ➔ **`VITE_FIREBASE_API_KEY`**
   * `projectId` ➔ **`VITE_FIREBASE_PROJECT_ID`**
   * `messagingSenderId` ➔ **`VITE_FIREBASE_MESSAGING_SENDER_ID`**
   * `appId` ➔ **`VITE_FIREBASE_APP_ID`**

6. **Mendapatkan VAPID Key (Web Push Certificate):**
   * Masih di halaman **Project settings**, klik tab **Cloud Messaging** di bagian atas.
   * Gulir ke bawah hingga Anda menemukan bagian **Web configuration** > **Web Push certificates**.
   * Jika belum ada key yang digenerate, klik tombol **Generate key pair**.
   * Salin kode panjang yang muncul di kolom **Key pair** tersebut, lalu masukkan ke variabel **`VITE_FIREBASE_VAPID_KEY`** di file `.env` Anda.

