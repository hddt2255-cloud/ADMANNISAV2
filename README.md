# Aplikasi Pengelolaan Dana BOS & RKAS (Rincian Kertas Kerja Perbulan)

Aplikasi Web Pengelolaan Dana BOSP Reguler untuk **SDIT ANNISA** (NPSN: 20231556) berbasis **Rincian Kertas Kerja Perbulan (Tahun Anggaran 2026)**.

---

## 🌟 Fitur Utama

1. **Kosongkan Data Awal (Empty Initial State)**:
   - Aplikasi dimulai dalam keadaan bersih/kosong untuk input data bulanan baru.
   - Disediakan tombol **"📥 Muat Data PDF Contoh"** untuk memasukkan data asli dari dokumen PDF (Juli, Agustus, Oktober, November, Desember 2026) kapan saja.

2. **Penyimpanan Terstruktur Per Bulan (Januari - Desember 2026)**:
   - Data anggaran dan rincian belanja disimpan terpisah dan aman secara lokal (*localStorage*) sesuai bulannya.
   - Pilihan cepat navigasi 12 bulan dengan indikator jumlah item & total nominal belanja per bulan.

3. **Format Laporan Resmi RKAS Perbulan**:
   - Tampilan persis seperti dokumen fisik resmi "Rincian Kertas Kerja Perbulan".
   - Dilengkapi Header Informasi Sekolah (NPSN, SDIT ANNISA, Alamat, Kota Bekasi, Provinsi Jawa Barat).
   - Dilengkapi Blok Tanda Tangan Resmi (Komite Sekolah: Citra Karmila, A.Md; Kepala Sekolah: Abdul Yakub, S.Ag; Bendahara Sekolah: Andi Purnomo).

4. **Ekspor & Impor Data Lengkap**:
   - **Ekspor Excel Bulanan**: Mengunduh file `.xlsx` untuk bulan aktif.
   - **Ekspor Excel 12 Bulan**: Mengunduh file `.xlsx` berisi 12 sheet terpisah untuk setiap bulan.
   - **Cetak / PDF Resmi**: Cetak antarmuka langsung ke PDF / printer fisik (`Ctrl + P`).
   - **Backup & Restore JSON**: Simpan dan pulihkan seluruh data aplikasi melalui file JSON.

---

## 🚀 Cara Menjalankan Aplikasi

### Opsi 1: Buka Langsung Tanpa Install (Sangat Mudah & Cepat)
1. Buka folder `C:\Users\Administrator\.gemini\antigravity\scratch\aplikasi-bos`.
2. Klik dua kali file **`index.html`** untuk membuanya langsung di Google Chrome, Microsoft Edge, atau Web Browser favorit Anda.

### Opsi 2: Menggunakan Node.js / Vite
1. Buka Terminal di folder `aplikasi-bos`.
2. Jalankan perintah:
   ```bash
   npm install
   npm run dev
   ```
3. Akses URL lokal yang muncul (misalnya `http://localhost:5173`).
