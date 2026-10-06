const GOOGLE_SHEETS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx1p4pJlOepzP4zK6tcJ91sKJYJrq0-fBsTl3bl_0h9UmIlpy-R3wdsyvJE6C0caj8/exec';
const OLD_APPS_SCRIPT_URL_PATTERN = 'AKfycbyN05PIWa01Ey0jLnkNRyIdg4i3HJOCxKfMPhQ8fbpdYm6wt8kKYlx1KtvTnsgdCxol';

let isSyncingToCloud = false;
let isFetchingFromCloud = false;
let lastCloudFetchTime = 0;
let pendingSyncPayload = null;
let lastSyncTimestamp = null;

function updateCloudBadge(state, message) {
  const badge = document.getElementById('cloudSyncStatusToast');
  if (!badge) return;

  badge.className = 'cloud-sync-badge ' + (state || '');
  const icon = badge.querySelector('i');
  const textSpan = badge.querySelector('.sync-text');
  const detailSpan = badge.querySelector('.sync-detail');

  if (state === 'syncing') {
    if (icon) icon.className = 'fa-solid fa-rotate fa-spin';
    if (textSpan) textSpan.textContent = message || 'Menyinkronkan...';
    if (detailSpan) detailSpan.textContent = '';
  } else if (state === 'error') {
    if (icon) icon.className = 'fa-solid fa-triangle-exclamation';
    if (textSpan) textSpan.textContent = message || 'Offline';
    if (detailSpan) detailSpan.textContent = '(Gagal)';
  } else {
    if (icon) icon.className = 'fa-solid fa-cloud-arrow-down';
    if (textSpan) textSpan.textContent = 'Cloud';
    const timeStr = lastSyncTimestamp ? `(${new Date(lastSyncTimestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})` : '(Sinkron)';
    if (detailSpan) detailSpan.textContent = timeStr;
  }
}

function triggerManualSync() {
  updateCloudBadge('syncing', 'Menyinkronkan...');
  syncFromGoogleSheetsCloud(true, (success) => {
    if (success) {
      alert('✅ Sinkronisasi berhasil! Seluruh data terbaru dari Cloud telah dimuat.');
    } else {
      alert('⚠️ Gagal terhubung ke Cloud. Pastikan koneksi internet aktif.');
    }
  });
}

function prepareCloudPayload() {
  const payload = {};
  
  // 1. Master Table Arrays
  const tableKeys = ['guru', 'siswa', 'masuk', 'keluar', 'lulusan', 'kelas', 'administrasi', 'inventaris', 'ruangan', 'uks', 'perpustakaan'];
  tableKeys.forEach(k => {
    if (Array.isArray(db[k]) && db[k].length > 0) {
      payload[k] = db[k];
    } else {
      // Wajib kirim 1 baris objek kosong bertaut header agar Google Apps Script benar-benar mengosongkan sheet di Google Spreadsheet
      const cols = (typeof TABLE_CFG !== 'undefined' && TABLE_CFG[k] && TABLE_CFG[k][1]) ? TABLE_CFG[k][1] : ['Nama', 'NISN', 'Kelas'];
      const blankRow = {};
      cols.forEach(c => { blankRow[c] = ''; });
      payload[k] = [blankRow];
    }
  });

  // 2. Berita (ensure fotos array is properly serialized for Google Sheets)
  if (Array.isArray(db.berita)) {
    payload.berita = db.berita.map(b => {
      let fotosStr = '';
      if (Array.isArray(b.fotos)) {
        fotosStr = b.fotos.join(', ');
      } else if (typeof b.fotos === 'string') {
        fotosStr = b.fotos;
      } else if (b.foto) {
        fotosStr = b.foto;
      }
      return {
        judul: b.judul || '',
        kategori: b.kategori || 'Berita',
        tanggal: b.tanggal || '',
        fotos: fotosStr,
        ringkasan: b.ringkasan || ''
      };
    });
  } else {
    payload.berita = [];
  }

  // 3. Profil (wrap in array of 1 object so Google Sheets persists it as a sheet)
  const p = db.profil || DEFAULT_PROFIL;
  payload.profil = [{
    namaSekolah: p.namaSekolah || 'SDIT ANNISA',
    tagline: p.tagline || '',
    akreditasi: p.akreditasi || 'A (Sangat Baik)',
    npsn: p.npsn || '20231556',
    kota: p.kota || 'Jakarta',
    namaKepala: p.namaKepala || 'Abdul Yakub, S.Ag',
    jabatanKepala: p.jabatanKepala || 'Kepala Sekolah SDIT ANNISA',
    fotoKepala: p.fotoKepala || '',
    sambutanText: p.sambutanText || '',
    visiText: p.visiText || '',
    misiList: Array.isArray(p.misiList) ? JSON.stringify(p.misiList) : (p.misiList || ''),
    namaLengkap: p.namaLengkap || '',
    alamat: p.alamat || '',
    telepon: p.telepon || '',
    email: p.email || ''
  }];

  // 4. Pengaturan (wrap in array of 1 object)
  const currentPeng = db.pengaturan || DEFAULT_PENGATURAN;
  payload.pengaturan = [{
    namaSekolah: currentPeng.namaSekolah || 'SDIT ANNISA',
    alamatSekolah: currentPeng.alamatSekolah || '',
    kepalaSekolah: currentPeng.kepalaSekolah || 'Abdul Yakub, S.Ag',
    tahunAjaran: currentPeng.tahunAjaran || '2026/2027',
    logo: currentPeng.logo || '',
    kopSurat: currentPeng.kopSurat || '',
    appsScriptUrl: GOOGLE_SHEETS_WEB_APP_URL,
    driveFolderId: currentPeng.driveFolderId || ''
  }];

  return payload;
}

function syncToGoogleSheetsCloud() {
  if (!GOOGLE_SHEETS_WEB_APP_URL || GOOGLE_SHEETS_WEB_APP_URL.trim() === '') return;

  const payload = prepareCloudPayload();

  if (isSyncingToCloud) {
    pendingSyncPayload = payload;
    return;
  }

  isSyncingToCloud = true;
  updateCloudBadge('syncing', 'Menyimpan...');

  fetch(GOOGLE_SHEETS_WEB_APP_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  })
  .then(() => {
    isSyncingToCloud = false;
    lastSyncTimestamp = Date.now();
    updateCloudBadge('synced');
    if (pendingSyncPayload) {
      const next = pendingSyncPayload;
      pendingSyncPayload = null;
      syncToGoogleSheetsCloud();
    }
  })
  .catch(err => {
    isSyncingToCloud = false;
    console.warn('Sync to cloud failed', err);
    updateCloudBadge('error', 'Gagal Simpan');
  });
}

function syncFromGoogleSheetsCloud(showToast = true, callback = null) {
  if (!GOOGLE_SHEETS_WEB_APP_URL || GOOGLE_SHEETS_WEB_APP_URL.trim() === '') {
    if (callback) callback(false);
    return;
  }

  // Cegah request ganda bertumpuk yang menyebabkan delay dan konflik data
  if (isFetchingFromCloud) {
    if (callback) callback(false);
    return;
  }

  // Throttle auto-sync otomatis (tab-switch/visibilitychange): minimal jeda 10 detik
  const now = Date.now();
  if (!showToast && (now - lastCloudFetchTime < 10000)) {
    if (callback) callback(true);
    return;
  }

  isFetchingFromCloud = true;
  updateCloudBadge('syncing', 'Memuat Cloud...');

  fetch(GOOGLE_SHEETS_WEB_APP_URL)
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(cloudDb => {
      isFetchingFromCloud = false;
      lastCloudFetchTime = Date.now();
      if (!cloudDb || typeof cloudDb !== 'object') {
        throw new Error('Data cloud tidak valid');
      }

      let hasNewCloudData = false;

      // 1. Parse tables
      const tableKeys = ['guru', 'siswa', 'masuk', 'keluar', 'lulusan', 'kelas', 'administrasi', 'inventaris', 'ruangan', 'uks', 'perpustakaan'];
      tableKeys.forEach(k => {
        if (cloudDb[k] !== undefined && Array.isArray(cloudDb[k])) {
          // Filter out any blank schema marker row (where all values are empty)
          const validRows = cloudDb[k].filter(row => row && typeof row === 'object' && Object.values(row).some(v => v !== null && String(v).trim() !== ''));
          
          if (validRows.length > 0) {
            // Merge with local to preserve any local photo/attachment dataUrl if cloud cell is empty
            if (db[k] && Array.isArray(db[k]) && db[k].length > 0) {
              validRows.forEach((cloudRow, cIdx) => {
                const localRow = db[k].find(l => l.Nama && cloudRow.Nama && l.Nama.trim().toLowerCase() === cloudRow.Nama.trim().toLowerCase()) || db[k][cIdx];
                if (localRow) {
                  if (localRow.Foto && (!cloudRow.Foto || cloudRow.Foto.trim() === '')) {
                    cloudRow.Foto = localRow.Foto;
                  }
                  if (localRow['File Surat'] && (!cloudRow['File Surat'] || cloudRow['File Surat'].trim() === '')) {
                    cloudRow['File Surat'] = localRow['File Surat'];
                  }
                }
              });
            }
            db[k] = validRows;
            hasNewCloudData = true;
            if (k === 'siswa') {
              localStorage.removeItem('sdit_siswa_cleared');
            }
          } else {
            // Cloud table is empty -> user deleted/emptied this table in cloud or on another device!
            // Keep local state in sync: set local to empty!
            if (db[k] && Array.isArray(db[k]) && db[k].length > 0) {
              hasNewCloudData = true;
            }
            db[k] = [];
            if (k === 'siswa') {
              localStorage.setItem('sdit_siswa_cleared', 'true');
            }
          }
        }
      });

      // 2. Parse berita
      if (cloudDb.berita && Array.isArray(cloudDb.berita) && cloudDb.berita.length > 0) {
        db.berita = cloudDb.berita.map(b => {
          let fotosArr = [];
          if (Array.isArray(b.fotos)) {
            fotosArr = b.fotos;
          } else if (typeof b.fotos === 'string' && b.fotos.trim() !== '') {
            if (b.fotos.startsWith('[')) {
              try { fotosArr = JSON.parse(b.fotos); } catch(e) { fotosArr = [b.fotos]; }
            } else {
              fotosArr = b.fotos.split(',').map(s => s.trim()).filter(Boolean);
            }
          } else if (b.foto) {
            fotosArr = [b.foto];
          }
          return {
            ...b,
            fotos: fotosArr.length > 0 ? fotosArr : ['https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=600&q=80'],
            foto: fotosArr[0] || b.foto || ''
          };
        });
        hasNewCloudData = true;
      } else if (!db.berita || db.berita.length === 0) {
        db.berita = DEFAULT_BERITA_LIST;
      }

      // 3. Parse profil
      if (cloudDb.profil) {
        const rawProfil = Array.isArray(cloudDb.profil) ? cloudDb.profil[0] : cloudDb.profil;
        if (rawProfil && typeof rawProfil === 'object' && Object.keys(rawProfil).length > 0) {
          let misiList = DEFAULT_PROFIL.misiList;
          if (rawProfil.misiList) {
            if (Array.isArray(rawProfil.misiList)) {
              misiList = rawProfil.misiList;
            } else if (typeof rawProfil.misiList === 'string') {
              try {
                misiList = JSON.parse(rawProfil.misiList);
              } catch(e) {
                misiList = rawProfil.misiList.split('\n').map(s => s.trim()).filter(Boolean);
              }
            }
          }
          db.profil = {
            ...DEFAULT_PROFIL,
            ...rawProfil,
            misiList: misiList
          };
          hasNewCloudData = true;
        }
      }

      // 4. Parse pengaturan
      if (cloudDb.pengaturan) {
        const rawPeng = Array.isArray(cloudDb.pengaturan) ? cloudDb.pengaturan[0] : cloudDb.pengaturan;
        if (rawPeng && typeof rawPeng === 'object' && Object.keys(rawPeng).length > 0) {
          const sanitizedUrl = (rawPeng.appsScriptUrl && !rawPeng.appsScriptUrl.includes(OLD_APPS_SCRIPT_URL_PATTERN)) 
            ? rawPeng.appsScriptUrl 
            : GOOGLE_SHEETS_WEB_APP_URL;
          db.pengaturan = {
            ...DEFAULT_PENGATURAN,
            ...rawPeng,
            appsScriptUrl: sanitizedUrl
          };
          hasNewCloudData = true;
        }
      }

      lastSyncTimestamp = Date.now();
      saveDatabaseLocalOnly();
      refreshAllViews();
      updateCloudBadge('synced');

      if (callback) callback(true);
    })
    .catch(err => {
      isFetchingFromCloud = false;
      console.warn('Gagal mengambil data dari Google Sheets:', err);
      updateCloudBadge('error', 'Offline');
      if (callback) callback(false);
    });
}

function refreshAllViews() {
  applySchoolBranding();
  updateCurrentDate();

  const imp = document.getElementById('importContainer');
  if (imp) {
    imp.style.display = (db.siswa && db.siswa.length > 0) ? 'none' : 'block';
  }

  if (currentSectionId === 'dashboard') {
    renderBeritaGrid();
    updateDashboardStats();
    renderDashboardCharts();
  } else if (currentSectionId === 'profil') {
    renderProfilView();
  } else if (currentSectionId === 'pengaturan') {
    populatePengaturanForm();
  } else {
    renderTable(currentSectionId);
  }
}

function applySchoolBranding() {
  const p = db.profil || DEFAULT_PROFIL;
  const peng = db.pengaturan || DEFAULT_PENGATURAN;
  const schoolName = p.namaSekolah || peng.namaSekolah || 'SDIT ANNISA';

  const headerTag = document.querySelector('.school-tag-badge');
  if (headerTag) headerTag.innerHTML = `<i class="fa-solid fa-shield-halved"></i> ${esc(schoolName)}`;

  const brandTitle = document.querySelector('.brand-info h2');
  if (brandTitle) brandTitle.textContent = schoolName;

  const bannerTitle = document.querySelector('.welcome-banner-title');
  if (bannerTitle) bannerTitle.textContent = `Selamat Datang di ${schoolName}`;

  if (peng.logo) {
    const directLogo = getDirectImageSrc(peng.logo);
    document.querySelectorAll('.brand-logo-img, .top-bar-logo, .welcome-banner-logo').forEach(img => {
      img.src = directLogo;
    });
  }
}

/* ==========================================================================
   SDIT ANNISA - APP LOGIC & GOOGLE SHEETS CLOUD SYNC (APP.JS)
   ========================================================================== */

const DB_KEY = 'sdit_annisa_db_v2';
const ADMIN_PASSWORD_CORRECT = 'hdt123';

// INITIAL DEFAULT STATE (NPSN: 20231556, NAMA KEPALA SEKOLAH: Abdul Yakub, S.Ag)
const DEFAULT_PENGATURAN = {
  namaSekolah: 'SDIT ANNISA',
  alamatSekolah: 'Kec. Jatiasih',
  kepalaSekolah: 'Abdul Yakub, S.Ag',
  tahunAjaran: '2026/2027',
  logo: '',
  kopSurat: '',
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbx1p4pJlOepzP4zK6tcJ91sKJYJrq0-fBsTl3bl_0h9UmIlpy-R3wdsyvJE6C0caj8/exec',
  driveFolderId: '1U3WB4loqnuxck2x1We5fxH9EeJLuVkrr'
};

const DEFAULT_PROFIL = {
  namaSekolah: 'SDIT ANNISA',
  tagline: 'Mendidik Generasi Rabbani yang Unggul, Beradab, dan Bertaqwa Berlandaskan Al-Qur\'an dan As-Sunnah.',
  akreditasi: 'A (Sangat Baik)',
  npsn: '20231556',
  kota: 'Jakarta Selatan',
  namaKepala: 'Abdul Yakub, S.Ag',
  jabatanKepala: 'Kepala Sekolah SDIT ANNISA',
  fotoKepala: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80',
  sambutanText: `Assalamu'alaikum Warahmatullahi Wabarakatuh.

Puji syukur kehadirat Allah SWT yang telah memberikan rahmat dan karunia-Nya. SDIT ANNISA berkomitmen penuh untuk menghadirkan pendidikan Islam terpadu berkelas tinggi yang menyeimbangkan antara ilmu syar'i, pembentukan karakter akhlakul karimah, serta keunggulan akademik dan penguasaan sains teknologi.

Kami percaya bahwa setiap anak adalah amanah berharga yang memiliki potensi istimewa. Dengan bimbingan para pendidik yang berdedikasi dan ikhlas, mari bersama-sama kita wujudkan generasi Rabbani yang siap memimpin masa depan.`,
  visiText: '"Menjadi Sekolah Dasar Islam Terpadu Unggulan yang Membentuk Generasi Rabbani, Berakhlak Mulia, Cerdas, Mandiri, dan Berwawasan Global pada Tahun 2030."',
  misiList: [
    "Menyelenggarakan pendidikan Islam terpadu yang mengintegrasikan nilai Al-Qur'an dan As-Sunnah dalam setiap pembelajaran.",
    "Membimbing pembiasaan ibadah harian, adab sopan santun, dan tahfidz Al-Qur'an juz 30 & 29.",
    "Mengembangkan potensi minat bakat siswa secara optimal melalui kurikulum berbasis karakter & STEM.",
    "Menjalin kemitraan sinergis yang erat dengan orang tua dan masyarakat dalam pendidikan anak."
  ],
  namaLengkap: 'SDIT ANNISA (Sekolah Dasar Islam Terpadu)',
  alamat: 'Jl. Wibawa Mukti II No.05 RT.03 RW.06 Jatiasih, Jatiasih Bekasi',
  telepon: '(021) 8243-1220',
  email: 'info@sditannisa.sch.id • sditannisa2.netlify.app'
};

const DEFAULT_BERITA_LIST = [
  {
    judul: "Kemendikdasmen Sambut Tahun Ajaran Baru",
    kategori: "Pendidikan",
    tanggal: "16 Juli 2026",
    penulis: "Humas SMPN 32",
    views: 253,
    foto: "poster_kemendikdasmen.png",
    fotos: [
      "poster_kemendikdasmen.png",
      "https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=800&q=80"
    ],
    ringkasan: "Kementerian Pendidikan Dasar dan Menengah (Kemendikdasmen) secara resmi menyambut dimulainya tahun ajaran baru dengan menggaungkan kampanye digital bertajuk Selamat Kembali Bersekolah!.",
    konten: `Kementerian Pendidikan Dasar dan Menengah (Kemendikdasmen) secara resmi menyambut dimulainya tahun ajaran baru dengan menggaungkan kampanye digital bertajuk " Selamat Kembali Bersekolah! ". Poster edukatif ini dirilis untuk memotivasi seluruh elemen pendidikan di Indonesia agar memulai proses belajar mengajar dengan penuh semangat, keceriaan, dan optimisme.

Melalui visualisasi yang inklusif dan bersahabat, Kemendikdasmen menyampaikan pesan hangat dan apresiasi mendalam kepada para pendidik di seluruh penjuru tanah air melalui kalimat " Salam untuk Bapak & Ibu Guru Tercinta! ". Guru dinilai memegang peran krusial sebagai pilar utama dalam membimbing dan mencerdaskan generasi penerus bangsa.

Kampanye ini juga menegaskan komitmen pemerintah dalam menciptakan lingkungan belajar yang ramah, aman, dan menyenangkan bagi setiap peserta didik, tanpa terkecuali. Seluruh satuan pendidikan didorong untuk terus berinovasi dalam metode pengajaran serta memperkuat pendidikan karakter generasi penerus bangsa.`
  },
  {
    judul: "AUDISI GOT TALENT 2022",
    kategori: "Kreativitas",
    tanggal: "14 Juli 2026",
    penulis: "Humas SMPN 32",
    views: 198,
    foto: "thumb_gottalent.png",
    fotos: [
      "thumb_gottalent.png",
      "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80"
    ],
    ringkasan: "Ajang unjuk bakat dan kreativitas siswa dalam bidang seni musik, tari, vokal, dan kreasi modern untuk mengasah kepercayaan diri dan potensi generasi muda.",
    konten: `Ajang pencarian bakat dan kreativitas "GOT TALENT AUDITION" kembali diselenggarakan dengan semarak dan antusiasme luar biasa dari para siswa dan siswi.

Kegiatan ini bertujuan untuk menggali potensi terpendam para peserta didik di luar bidang akademik, meliputi seni tari tradisional maupun modern, olah vokal, musik instrumen, drama teatrikal, serta keterampilan kreasi unik lainnya. Seluruh peserta menampilkan performa terbaik mereka di hadapan dewan juri tamu dan rekan-rekan sebaya.

Diharapkan melalui kegiatan audisi bakat ini, para siswa semakin percaya diri dalam mengekspresikan minat positif, berani tampil di panggung publik, dan terus mengembangkan bakat seni yang bernilai tinggi.`
  },
  {
    judul: "Mendikbud: Asesmen Nasional Tidak Sama dengan PBB",
    kategori: "Kebijakan",
    tanggal: "10 Juli 2026",
    penulis: "Biro Humas",
    views: 312,
    foto: "thumb_mendikbud.png",
    fotos: [
      "thumb_mendikbud.png",
      "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=800&q=80"
    ],
    ringkasan: "Penegasan penting mengenai paradigma Asesmen Nasional yang berfokus pada pemetaan mutu sistem pendidikan dan evaluasi proses belajar.",
    konten: `Menteri Pendidikan menegaskan kembali bahwa pelaksanaan Asesmen Nasional (AN) memiliki orientasi dan paradigma yang sangat berbeda dengan evaluasi standar lama maupun ujian pemeringkatan individu.

Asesmen Nasional dirancang bukan untuk menghakimi capaian belajar murid secara personal ataupun menentukan kelulusan, melainkan sebagai instrumen pemetaan komprehensif terhadap kualitas input, proses, dan output pembelajaran di seluruh satuan pendidikan.

Evaluasi ini mencakup Asesmen Kompetensi Minimum (AKM) untuk literasi dan numerasi, Survei Karakter, serta Survei Lingkungan Belajar demi terwujudnya iklim sekolah yang aman, inklusif, dan berorientasi pada kemajuan peserta didik.`
  },
  {
    judul: "Sayangi Bumi dengan Menjaga Lingkungan",
    kategori: "Lingkungan",
    tanggal: "05 Juli 2026",
    penulis: "Tim Adiwiyata",
    views: 185,
    foto: "thumb_sayangibumi.png",
    fotos: [
      "thumb_sayangibumi.png",
      "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=800&q=80"
    ],
    ringkasan: "Gerakan kepedulian lingkungan hidup sekolah melalui pengurangan sampah plastik, daur ulang kreatif, dan penanaman pohon penghijauan.",
    konten: `Kepedulian terhadap kelestarian alam dan lingkungan hidup merupakan bagian tak terpisahkan dari pembentukan karakter generasi beradab dan berbudaya lingkungan.

Melalui program 'Sayangi Bumi dengan Menjaga Lingkungan', seluruh warga sekolah diajak secara konsisten untuk memilah sampah organik dan anorganik, membawa tumbler ramah lingkungan, serta merawat taman kelas masing-masing.

Semangat cinta lingkungan ini ditanamkan sejak dini agar generasi muda memiliki kesadaran ekologis yang tinggi dan mampu menjaga kelestarian bumi di masa mendatang.`
  },
  {
    judul: "Kabinet Merah Putih Periode 2024-2029",
    kategori: "Wawasan",
    tanggal: "28 Juni 2026",
    penulis: "Humas Sekolah",
    views: 420,
    foto: "thumb_kabinet.png",
    fotos: [
      "thumb_kabinet.png",
      "https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=800&q=80"
    ],
    ringkasan: "Sosialisasi wawasan kebangsaan dan pengenalan kepemimpinan nasional Kabinet Merah Putih Periode 2024-2029 kepada peserta didik.",
    konten: `Dalam rangka menumbuhkan wawasan kebangsaan dan pemahaman tata kelola pemerintahan Indonesia, sekolah menyelenggarakan sesi literasi kewarganegaraan mengenai susunan Kabinet Merah Putih Periode 2024-2029.

Peserta didik diberikan edukasi interaktif mengenai tugas kementerian, peran pimpinan negara, serta pentingnya semangat gotong royong dan integritas dalam membangun Indonesia yang maju, adil, dan sejahtera.`
  },
  {
    judul: "ARLETA NOVERIA CELI RAIH JUARA 1 LOMBA BACA PUISI KEMERDEKAAN",
    kategori: "Prestasi",
    tanggal: "20 Juni 2026",
    penulis: "Humas Kesiswaan",
    views: 340,
    foto: "thumb_puisi.png",
    fotos: [
      "thumb_puisi.png",
      "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=800&q=80"
    ],
    ringkasan: "Prestasi membanggakan ananda Arleta Noveria Celi berhasil meraih Juara 1 dalam Lomba Baca Puisi Kemerdekaan Tingkat Kota.",
    konten: `Keluarga besar sekolah mengucapkan selamat dan bangga atas capaian ananda Arleta Noveria Celi yang berhasil meraih Juara 1 dalam Lomba Baca Puisi Kemerdekaan.

Dengan pembawaan yang penuh penghayatan, artikulasi intonasi yang memukau, dan ekspresi patriotik yang mendalam, Arleta berhasil menyisihkan puluhan peserta dari berbagai sekolah. Semoga prestasi ini menjadi pemicu semangat untuk terus berkarya di bidang sastra dan seni budaya.`
  },
  {
    judul: "SMPN 32 Bekasi Sukses Tuntaskan TKA 2026",
    kategori: "Akademik",
    tanggal: "15 Juni 2026",
    penulis: "Humas Kurikulum",
    views: 275,
    foto: "thumb_tka.png",
    fotos: [
      "thumb_tka.png",
      "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=800&q=80"
    ],
    ringkasan: "Pelaksanaan Tes Kendali Mutu Akademik (TKA) 2026 berjalan tertib, lancar, dan berintegritas tinggi dengan dukungan sistem CBT yang stabil.",
    konten: `Pelaksanaan Tes Kendali Mutu Akademik (TKA) Tahun 2026 telah sukses dirampungkan dengan tingkat kehadiran 100% dan integritas pelaksanaan yang sangat baik.

Seluruh ruang ujian berbasis komputer (CBT) beroperasi optimal dengan kesiapan perangkat yang prima. Evaluasi berkala ini menjadi tolak ukur penting dalam mengevaluasi efektivitas kurikulum dan kesiapan siswa melangkah ke jenjang berikutnya.`
  },
  {
    judul: "Penerimaan Peserta Didik Baru (PPDB) T.A 2026/2027 Resmi Dibuka",
    kategori: "Pengumuman",
    tanggal: "12 Agustus 2026",
    penulis: "Sekretariat PPDB",
    views: 510,
    foto: "https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=800&q=80",
    fotos: [
      "https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=800&q=80"
    ],
    ringkasan: "SDIT ANNISA secara resmi membuka pendaftaran calon peserta didik baru tahun ajaran 2026/2027 Gelombang 1. Segera daftarkan putra-putri Anda sebelum kuota terpenuhi.",
    konten: `Bismillahirrohmanirrohim.

SDIT ANNISA secara resmi mengumumkan pembukaan Penerimaan Peserta Didik Baru (PPDB) Tahun Ajaran 2026/2027 Gelombang 1 untuk jenjang Sekolah Dasar (SD).

Keunggulan Kurikulum & Pembiasaan Rabbani:
1. Integrasi Kurikulum Merdeka & Kurikulum Karakter Rabbani: Menyeimbangkan capaian akademik sains teknologi dengan keteladanan akhlakul karimah.
2. Tahfidz Al-Qur'an Intensif: Bimbingan target hafalan Juz 30 & 29 dengan metode mutqin dan asatidz bersanad.
3. Pembiasaan Adab Islami Harian: Sholat Dhuha, sholat berjamaah tepat waktu, dzikir pagi-petang, serta budaya 5S (Senyum, Salam, Sapa, Sopan, Santun).
4. Pembelajaran Interaktif & STEM: Menstimulasi nalar kritis, kreativitas, dan kepemimpinan santri sejak dini.

Syarat & Alur Pendaftaran:
- Mengisi formulir pendaftaran melalui sekretariat sekolah atau portal online.
- Menyerahkan fotokopi Akta Kelahiran, Kartu Keluarga (KK), dan KTP Orang Tua.
- Mengikuti observasi kesiapan belajar dan pemetaan minat bakat santri.

Informasi & Konsultasi Langsung:
Sekretariat PPDB SDIT ANNISA
Jl. Wibawa Mukti II No.05 RT.03 RW.06 Jatiasih, Jatiasih Bekasi
Telepon: (021) 8243-1220`
  },
  {
    judul: "Juara 1 Lomba Tahfidz Al-Qur'an Juz 30 Tingkat Kota Bekasi",
    kategori: "Prestasi",
    tanggal: "08 Agustus 2026",
    penulis: "Koordinator Tahfidz",
    views: 480,
    foto: "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=800&q=80",
    fotos: [
      "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1588072432836-e10032774350?auto=format&fit=crop&w=800&q=80"
    ],
    ringkasan: "Selamat kepada ananda Umar Jordan atas raihan pretasi membanggakan meraih Juara 1 Musabaqah Hifdzil Qur'an (MHQ) Juz 30 antar SD/MI se-Kota Bekasi.",
    konten: `Alhamdulillah wa Syukurillah!

Keluarga besar SDIT ANNISA mengucapkan selamat dan apresiasi setinggi-tingginya kepada ananda Umar Jordan (Kelas 5) yang telah berhasil menorehkan prestasi gemilang sebagai Juara 1 Musabaqah Hifdzil Qur'an (MHQ) Juz 30 Tingkat SD/MI se-Kota Bekasi.

Ajang bergengsi ini diikuti oleh ratusan santri dari berbagai sekolah dasar Islam se-Kota Bekasi. Berkat kelancaran hafalan, ketepatan makharijul huruf, serta keindahan tajwid yang dibawakan dengan tenang dan percaya diri, Ananda Umar berhasil memperoleh skor tertinggi dari dewan juri.`
  }
];

const DEFAULT_INVENTARIS_LIST = [
  { "Nama Ruang": "Ruang Kelas 1", "Nama Barang": "Meja Siswa", "Jumlah": "20", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Kayu Jati Awet" },
  { "Nama Ruang": "Ruang Kelas 1", "Nama Barang": "Kursi Siswa", "Jumlah": "20", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Kayu Jati Awet" },
  { "Nama Ruang": "Ruang Kelas 1", "Nama Barang": "Meja Guru", "Jumlah": "1", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Lengkap Laci" },
  { "Nama Ruang": "Ruang Kelas 1", "Nama Barang": "Kursi Guru", "Jumlah": "1", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Busa Empuk" },
  { "Nama Ruang": "Ruang Kelas 1", "Nama Barang": "Papan Tulis Whiteboard", "Jumlah": "1", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Ukuran 120x240 cm" },
  
  { "Nama Ruang": "Ruang Kelas 2", "Nama Barang": "Meja Siswa", "Jumlah": "22", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Standar Sekolah" },
  { "Nama Ruang": "Ruang Kelas 2", "Nama Barang": "Kursi Siswa", "Jumlah": "22", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Standar Sekolah" },
  { "Nama Ruang": "Ruang Kelas 2", "Nama Barang": "Meja Guru", "Jumlah": "1", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Lengkap Laci" },
  { "Nama Ruang": "Ruang Kelas 2", "Nama Barang": "Kursi Guru", "Jumlah": "1", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Busa Empuk" },

  { "Nama Ruang": "Ruang Guru", "Nama Barang": "Meja Kerja Guru", "Jumlah": "15", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Sekat Partisi" },
  { "Nama Ruang": "Ruang Guru", "Nama Barang": "Kursi Kerja Putar", "Jumlah": "15", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Roda Rapi" },
  { "Nama Ruang": "Ruang Guru", "Nama Barang": "Lemari Arsip Besi", "Jumlah": "4", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Pintu Kunci" },
  { "Nama Ruang": "Ruang Guru", "Nama Barang": "Printer Laserjet", "Jumlah": "2", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Siap Pakai" },

  { "Nama Ruang": "Perpustakaan", "Nama Barang": "Rak Buku Kayu Tingkat", "Jumlah": "8", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Kapasitas Besar" },
  { "Nama Ruang": "Perpustakaan", "Nama Barang": "Meja Baca Lesehan", "Jumlah": "6", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Bahan Kayu" },
  { "Nama Ruang": "Perpustakaan", "Nama Barang": "Karpet Empuk Baca", "Jumlah": "4", "Satuan": "Roll", "Kondisi": "Baik", "Keterangan": "Bersih Wangi" },

  { "Nama Ruang": "Ruang UKS", "Nama Barang": "Tempat Tidur Pasien", "Jumlah": "2", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Lengkap Kasur Bantal" },
  { "Nama Ruang": "Ruang UKS", "Nama Barang": "Lemari Obat P3K", "Jumlah": "1", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Kaca Transparan" },
  { "Nama Ruang": "Ruang UKS", "Nama Barang": "Timbangan & Pengukur Tinggi", "Jumlah": "1", "Satuan": "Unit", "Kondisi": "Baik", "Keterangan": "Digital Presisi" }
];

const DEFAULT_GURU_LIST = [
  { "Nama": "Abdul Yakub, S.Ag", "Jabatan": "Kepala Sekolah", "Foto": "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Ustadz Ahmad Fauzi, S.Pd.I", "Jabatan": "Wali Kelas 1A-IBNU SINA", "Foto": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Ustadzah Siti Fatimah, S.Pd", "Jabatan": "Wali Kelas 1B", "Foto": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Ustadzah Maryam, S.Pd.SD", "Jabatan": "Wali Kelas 2A-IBNU BATUTA", "Foto": "https://images.unsplash.com/photo-1580894732444-8ecded7900cd?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Ustadz Salman Al Farisi, S.Pd", "Jabatan": "Wali Kelas 2B-IBNU AL NAFIS", "Foto": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Ustadzah Khadijah, S.Pd.I", "Jabatan": "Wali Kelas 3A-AL JABAR", "Foto": "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Ustadz Zulkifli, S.Pd", "Jabatan": "Wali Kelas 3B-AL KHAWARIZMI", "Foto": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Ustadzah Aisyah Rahma, S.Pd", "Jabatan": "Wali Kelas 4A-AL KINDI", "Foto": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Ustadz Ridwan Malik, S.Pd", "Jabatan": "Wali Kelas 4B-AL GAZALI", "Foto": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Ustadzah Nurul Hidayah, S.Pd", "Jabatan": "Wali Kelas 5A-AR RUMI", "Foto": "https://images.unsplash.com/photo-1548142813-c348350df52b?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Ustadz Farhan Syarif, S.Pd.I", "Jabatan": "Wali Kelas 5B-AL FARABI", "Foto": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Ustadz Ibrahim Lubis, M.Pd", "Jabatan": "Wali Kelas 6A-AL BIRUNI", "Foto": "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Ustadzah Diana Fitri, S.Pd", "Jabatan": "Wali Kelas 6B-AL BATTANI", "Foto": "https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Ustadz Hafizurrahman, Al-Hafidz", "Jabatan": "Koordinator Tahfidz Al-Qur'an", "Foto": "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Ustadz Dedi Kurniawan, S.Pd", "Jabatan": "Guru PJOK & Olahraga", "Foto": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "M. Yusuf, S.Kom", "Jabatan": "Operator IT & Dapodik", "Foto": "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Rina Marlina, S.E", "Jabatan": "Kepala Tata Usaha & Keuangan", "Foto": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80" }
];

const DEFAULT_RUANGAN_LIST = [
  { "Kode Ruang": "R-01", "Nama Ruang": "Ruang Kelas 1", "Jenis": "Ruang Teori/Kelas", "Penanggung Jawab": "Ustadz Ahmad Fauzi, S.Pd.I", "Luas": "56 m²", "Kondisi": "Baik", "Keterangan": "Gedung A Lt. 1" },
  { "Kode Ruang": "R-02", "Nama Ruang": "Ruang Kelas 2", "Jenis": "Ruang Teori/Kelas", "Penanggung Jawab": "Ustadzah Maryam, S.Pd.SD", "Luas": "56 m²", "Kondisi": "Baik", "Keterangan": "Gedung A Lt. 1" },
  { "Kode Ruang": "R-03", "Nama Ruang": "Ruang Kelas 3", "Jenis": "Ruang Teori/Kelas", "Penanggung Jawab": "Ustadz Zulkifli, S.Pd", "Luas": "56 m²", "Kondisi": "Baik", "Keterangan": "Gedung A Lt. 2" },
  { "Kode Ruang": "R-04", "Nama Ruang": "Ruang Kelas 4", "Jenis": "Ruang Teori/Kelas", "Penanggung Jawab": "Ustadzah Aisyah Rahma, S.Pd", "Luas": "56 m²", "Kondisi": "Baik", "Keterangan": "Gedung B Lt. 1" },
  { "Kode Ruang": "R-05", "Nama Ruang": "Ruang Kelas 5", "Jenis": "Ruang Teori/Kelas", "Penanggung Jawab": "Ustadz Farhan Syarif, S.Pd.I", "Luas": "56 m²", "Kondisi": "Baik", "Keterangan": "Gedung B Lt. 2" },
  { "Kode Ruang": "R-06", "Nama Ruang": "Ruang Kelas 6", "Jenis": "Ruang Teori/Kelas", "Penanggung Jawab": "Ustadz Ibrahim Lubis, M.Pd", "Luas": "56 m²", "Kondisi": "Baik", "Keterangan": "Gedung B Lt. 2" },
  { "Kode Ruang": "R-07", "Nama Ruang": "Ruang Guru & Kepala Sekolah", "Jenis": "Ruang Kantor", "Penanggung Jawab": "Abdul Yakub, S.Ag", "Luas": "84 m²", "Kondisi": "Baik", "Keterangan": "Gedung Utama" },
  { "Kode Ruang": "R-08", "Nama Ruang": "Perpustakaan", "Jenis": "Ruang Khusus", "Penanggung Jawab": "Rina Marlina, S.E", "Luas": "64 m²", "Kondisi": "Baik", "Keterangan": "Gedung Utama Lt. 1" },
  { "Kode Ruang": "R-09", "Nama Ruang": "Ruang UKS", "Jenis": "Ruang Khusus", "Penanggung Jawab": "Ustadzah Nurul Hidayah", "Luas": "28 m²", "Kondisi": "Baik", "Keterangan": "Gedung Utama Lt. 1" },
  { "Kode Ruang": "R-10", "Nama Ruang": "Musholla Nurul Ilmi", "Jenis": "Tempat Ibadah", "Penanggung Jawab": "Ustadz Hafizurrahman", "Luas": "120 m²", "Kondisi": "Baik", "Keterangan": "Area Tengah" }
];

const DEFAULT_ADMINISTRASI_LIST = [
  { "Jenis Surat": "Surat Keluar", "Nomor Surat": "012/SDIT-ANN/ADM/VIII/2026", "Tanggal": "10/08/2026", "Perihal": "Pemberitahuan Kegiatan Outing Class Santri", "Tujuan/Pemohon": "Seluruh Orang Tua / Wali Santri", "File Surat": "", "Keterangan": "Telah didistribusikan" },
  { "Jenis Surat": "Surat Masuk", "Nomor Surat": "421.2/105/Disdik/2026", "Tanggal": "05/08/2026", "Perihal": "Edaran Kalender Pendidikan T.A 2026/2027", "Tujuan/Pemohon": "Dinas Pendidikan Kota Bekasi", "File Surat": "", "Keterangan": "Arsip Tata Usaha" },
  { "Jenis Surat": "Surat Keterangan", "Nomor Surat": "045/SDIT-ANN/SK/VII/2026", "Tanggal": "25/07/2026", "Perihal": "Surat Keterangan Aktif Belajar Santri", "Tujuan/Pemohon": "Orang Tua Ananda Jordan", "File Surat": "", "Keterangan": "Keperluan Beasiswa" },
  { "Jenis Surat": "Surat Keputusan", "Nomor Surat": "001/SK-KS/SDIT-ANN/VII/2026", "Tanggal": "15/07/2026", "Perihal": "Pembagian Tugas Mengajar & Wali Kelas T.A 2026/2027", "Tujuan/Pemohon": "Dewan Guru & Tendik", "File Surat": "", "Keterangan": "Berlaku 1 Tahun" }
];

const DEFAULT_UKS_LIST = [
  { "Tanggal": "08/08/2026", "Nama Siswa": "Abdurohman Al Ghozali", "Kelas": "Kelas 3B-AL KHAWARIZMI", "Keluhan": "Pusing dan lemas saat upacara", "Tindakan": "Istirahat di tempat tidur UKS, minum air hangat", "Obat": "Minyak kayu putih & teh manis hangat", "Petugas": "Ustadzah Nurul", "Keterangan": "Sudah membaik dan kembali ke kelas" },
  { "Tanggal": "05/08/2026", "Nama Siswa": "ABIZAR HAFIZ NASUTION", "Kelas": "Kelas 3B-AL KHAWARIZMI", "Keluhan": "Luka gores ringan di lutut saat istirahat", "Tindakan": "Pembersihan luka dengan antiseptik dan plester", "Obat": "Betadine & Kassa steril", "Petugas": "Ustadzah Maryam", "Keterangan": "Luka ringan sudah tertutup rapi" }
];

const DEFAULT_PERPUSTAKAAN_LIST = [
  { "Kode Buku": "BK-001", "Judul": "Buku Tematik Terpadu Kurikulum Merdeka Kelas 1-6", "Pengarang": "Kemendikbudristek", "Penerbit": "Pusat Kurikulum dan Perbukuan", "Tahun": "2024", "Jumlah": "120", "Kondisi": "Sangat Baik", "Keterangan": "Buku Pegangan Siswa" },
  { "Kode Buku": "BK-002", "Judul": "Ensiklopedia Mukjizat Al-Qur'an dan Sains Modern", "Pengarang": "Dr. Nadiah Thayyarah", "Penerbit": "Kharisma Ilmu", "Tahun": "2023", "Jumlah": "15", "Kondisi": "Baik", "Keterangan": "Buku Referensi" },
  { "Kode Buku": "BK-003", "Judul": "Kisah 25 Nabi dan Rasul untuk Generasi Robbani", "Pengarang": "Nizar Sa'ad Jabal, Lc.", "Penerbit": "Qids Edukasi", "Tahun": "2024", "Jumlah": "30", "Kondisi": "Baik", "Keterangan": "Buku Bacaan Santri" },
  { "Kode Buku": "BK-004", "Judul": "Kamus Bergambar Bahasa Arab - Inggris - Indonesia", "Pengarang": "Tim Bahasa Robbani", "Penerbit": "Gema Insani", "Tahun": "2023", "Jumlah": "25", "Kondisi": "Baik", "Keterangan": "Pojok Literasi" }
];

const DEFAULT_LULUSAN_LIST = [
  { "Nama": "Muhammad Rayhan Al-Ghifari", "Tahun": "Angkatan 2025/2026", "Foto": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Zahra Khairunnisa Putri", "Tahun": "Angkatan 2025/2026", "Foto": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80" },
  { "Nama": "Fathir Ar-Rasyid", "Tahun": "Angkatan 2024/2025", "Foto": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80" }
];

const DEFAULT_KELAS_LIST = [
  { "Nama Kelas": "Kelas 1A-IBNU SINA", "Wali Kelas": "Ustadz Ahmad Fauzi, S.Pd.I", "Tahun Pelajaran": "2026/2027", "Ruang": "Ruang Kelas 1", "Keterangan": "Fase A" },
  { "Nama Kelas": "Kelas 1B", "Wali Kelas": "Ustadzah Siti Fatimah, S.Pd", "Tahun Pelajaran": "2026/2027", "Ruang": "Ruang Kelas 1", "Keterangan": "Fase A" },
  { "Nama Kelas": "Kelas 2A-IBNU BATUTA", "Wali Kelas": "Ustadzah Maryam, S.Pd.SD", "Tahun Pelajaran": "2026/2027", "Ruang": "Ruang Kelas 2", "Keterangan": "Fase A" },
  { "Nama Kelas": "Kelas 2B-IBNU AL NAFIS", "Wali Kelas": "Ustadz Salman Al Farisi, S.Pd", "Tahun Pelajaran": "2026/2027", "Ruang": "Ruang Kelas 2", "Keterangan": "Fase A" },
  { "Nama Kelas": "Kelas 3A-AL JABAR", "Wali Kelas": "Ustadzah Khadijah, S.Pd.I", "Tahun Pelajaran": "2026/2027", "Ruang": "Ruang Kelas 3", "Keterangan": "Fase B" },
  { "Nama Kelas": "Kelas 3B-AL KHAWARIZMI", "Wali Kelas": "Ustadz Zulkifli, S.Pd", "Tahun Pelajaran": "2026/2027", "Ruang": "Ruang Kelas 3", "Keterangan": "Fase B" },
  { "Nama Kelas": "Kelas 4A-AL KINDI", "Wali Kelas": "Ustadzah Aisyah Rahma, S.Pd", "Tahun Pelajaran": "2026/2027", "Ruang": "Ruang Kelas 4", "Keterangan": "Fase B" },
  { "Nama Kelas": "Kelas 4B-AL GAZALI", "Wali Kelas": "Ustadz Ridwan Malik, S.Pd", "Tahun Pelajaran": "2026/2027", "Ruang": "Ruang Kelas 4", "Keterangan": "Fase B" },
  { "Nama Kelas": "Kelas 5A-AR RUMI", "Wali Kelas": "Ustadzah Nurul Hidayah, S.Pd", "Tahun Pelajaran": "2026/2027", "Ruang": "Ruang Kelas 5", "Keterangan": "Fase C" },
  { "Nama Kelas": "Kelas 5B-AL FARABI", "Wali Kelas": "Ustadz Farhan Syarif, S.Pd.I", "Tahun Pelajaran": "2026/2027", "Ruang": "Ruang Kelas 5", "Keterangan": "Fase C" },
  { "Nama Kelas": "Kelas 6A-AL BIRUNI", "Wali Kelas": "Ustadz Ibrahim Lubis, M.Pd", "Tahun Pelajaran": "2026/2027", "Ruang": "Ruang Kelas 6", "Keterangan": "Fase C" },
  { "Nama Kelas": "Kelas 6B-AL BATTANI", "Wali Kelas": "Ustadzah Diana Fitri, S.Pd", "Tahun Pelajaran": "2026/2027", "Ruang": "Ruang Kelas 6", "Keterangan": "Fase C" }
];

// GLOBAL APP STATE
let db = loadDatabase();
let isAdminLoggedIn = sessionStorage.getItem('sdit_admin_logged_in') === 'true';
let currentSectionId = 'dashboard';
let selectedSiswaIndexForVerification = -1;
let selectedGuruIndexForPhotoUpload = -1;
let selectedLulusanIndexForPhotoUpload = -1;
let selectedSuratIndexForFileUpload = -1;
let currentActiveRoomNameForInventaris = '';
let tempUploadedBeritaPhotos = [];
let tempUploadedSingleFormPhoto = '';
let tempUploadedFotoKepala = '';
let beritaAutoSlideIntervals = [];

// CONFIG FOR DYNAMIC MASTER TABLES
const TABLE_CFG = {
  guru: ['Data Guru & Tenaga Kependidikan', ['Nama', 'Jabatan', 'Foto']],
    siswa: ['Data Siswa SDIT ANNISA', ['Nama', 'NISN', 'Kelas']],
  masuk: ['Data Siswa Masuk / Pindahan', ['Nama', 'Kelas', 'Tanggal Masuk', 'Sekolah Asal', 'Alamat']],
  keluar: ['Data Siswa Keluar / Pindah', ['Nama', 'NISN', 'Kelas', 'Tanggal Keluar', 'Alasan', 'Tujuan Sekolah', 'No Surat', 'Keterangan']],
  lulusan: ['Data Lulusan Alumni', ['Nama', 'Tahun', 'Foto']],
  kelas: ['Data Kelompok Kelas', ['Nama Kelas', 'Wali Kelas', 'Tahun Pelajaran', 'Ruang', 'Keterangan']],
  administrasi: ['Administrasi & Arsip Surat', ['Jenis Surat', 'Nomor Surat', 'Tanggal', 'Perihal', 'Tujuan/Pemohon', 'File Surat', 'Keterangan']],
  inventaris: ['Data Inventaris Sarpras', ['Nama Ruang', 'Jumlah Inventaris', 'Detail Inventaris']],
  ruangan: ['Data Ruangan & Gedung', ['Kode Ruang', 'Nama Ruang', 'Jenis', 'Penanggung Jawab', 'Luas', 'Kondisi', 'Keterangan']],
  uks: ['Catatan Layanan UKS', ['Tanggal', 'Nama Siswa', 'Kelas', 'Keluhan', 'Tindakan', 'Obat', 'Petugas', 'Keterangan']],
  perpustakaan: ['Katalog Buku Perpustakaan', ['Kode Buku', 'Judul', 'Pengarang', 'Penerbit', 'Tahun', 'Jumlah', 'Kondisi', 'Keterangan']],
  laporan: ['Cetak Laporan Rekapitulasi Sekolah', ['Jenis Laporan', 'Jumlah Data', 'Format Export', 'Keterangan Status']]
};

const TARGET_SISWA_FORM_FIELDS = ['Nama', 'Kelas', 'NIPD', 'JK', 'NISN', 'Tempat Lahir', 'Tanggal Lahir', 'NIK', 'Agama', 'Alamat', 'RT', 'RW', 'Dusun', 'Kelurahan', 'Kecamatan', 'Kode Pos', 'Jenis Tinggal', 'Alat Transportasi', 'Telepon', 'HP', 'E-Mail', 'Data Ayah - Nama', 'Data Ayah - Tahun Lahir', 'Data Ayah - Jenjang Pendidikan', 'Data Ayah - Pekerjaan', 'Data Ayah - Penghasilan', 'Data Ayah - NIK', 'Data Ibu - Nama', 'Data Ibu - Tahun Lahir', 'Data Ibu - Jenjang Pendidikan', 'Data Ibu - Pekerjaan', 'Data Ibu - Penghasilan', 'Data Ibu - NIK', 'No Registrasi Akta Lahir', 'No KK', 'Sekolah Asal', 'No. Whatsapp'];

const TEMPLATE_SAMPLES = {
  guru: ["Contoh Nama Guru, S.Pd.", "Guru Kelas 1", ""],
  siswa: ["Contoh Nama Siswa", "3200809988", "Jakarta", "30/12/2016", "Jl. Contoh Raya No. 10", "1", "2", "Jatiasih", "Kec. Jatiasih", "Nama Ayah Contoh", "Nama Ibu Contoh", "Kelas 1A-IBNU SINA", "TK Contoh"],
  masuk: ["Contoh Nama Siswa Masuk", "Kelas 1A-IBNU SINA", "15/07/2024", "TK Asal Contoh", "Jl. Contoh Alamat No. 10"],
  lulusan: ["Contoh Nama Alumni", "Angkatan 2025/2026", ""],
  administrasi: ["Surat Keluar", "015/SDIT_ANNISA/VIII/2025", "10/08/2025", "Permohonan Pindah Sekolah", "Orang Tua Siswa", "", "Telah diarsipkan"],
  inventaris: ["Ruang Kelas 1", "Meja Siswa", "20", "Unit", "Baik", "Keterangan Contoh"]
};

// INITIALIZATION ON DOM READY
document.addEventListener('DOMContentLoaded', () => {
  // 1. Immediately display Indonesian date so it never shows 'Loading...'
  updateCurrentDate();
  
  // 2. Initialize sidebar navigation
  try {
    initializeSidebar();
  } catch(e) {
    console.warn('Sidebar init error:', e);
  }
  
  // 3. Render dashboard metrics and content safely
  try {
    updateDashboardStats();
    renderDashboardCharts();
    renderBeritaGrid();
    applySchoolBranding();
  } catch(e) {
    console.error('Dashboard init error:', e);
  }

  // 4. Safe null-checked import container
  const imp = document.getElementById('importContainer');
  if (imp) {
    imp.style.display = (db && db.siswa && db.siswa.length > 0) ? 'none' : 'block';
  }
  
  // 5. Pull latest data from Google Sheets Cloud
  syncFromGoogleSheetsCloud(false);

  // 6. Auto-sync when user returns to tab on mobile/PC
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncFromGoogleSheetsCloud(false);
    }
  });

  // 7. Background polling every 60 seconds
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      syncFromGoogleSheetsCloud(false);
    }
  }, 60000);
});

function getDirectImageSrc(url) {
  if (!url) return '';
  if (typeof url === 'string' && url.includes('drive.google.com')) {
    const match = url.match(/\/file\/d\/([^\/]+)/) || url.match(/id=([^&]+)/);
    if (match && match[1]) {
      return 'https://lh3.googleusercontent.com/d/' + match[1];
    }
  }
  return url;
}

// CLIENT-SIDE IMAGE COMPRESSION (Max 350px, Quality 0.75, lightweight ~15KB for fast multi-device sync)
function compressImageFile(file, maxWidth, maxHeight, quality, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      callback(compressedDataUrl);
    };
    img.onerror = () => callback(e.target.result);
    img.src = e.target.result;
  };
  reader.onerror = () => {};
  reader.readAsDataURL(file);
}

function processLocalFileToDataUrlAndCloud(file, callback, customFileName) {
  if (file.type && file.type.startsWith('image/')) {
    compressImageFile(file, 350, 350, 0.75, (compressedDataUrl) => {
      callback(compressedDataUrl);
      uploadToDriveIfAvailable(file, compressedDataUrl, customFileName, callback);
    });
  } else {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      callback(dataUrl);
      uploadToDriveIfAvailable(file, dataUrl, customFileName, callback);
    };
    reader.readAsDataURL(file);
  }
}

function uploadToDriveIfAvailable(file, dataUrl, customFileName, callback) {
  let appsScriptUrl = db.pengaturan?.appsScriptUrl || GOOGLE_SHEETS_WEB_APP_URL;
  if (!appsScriptUrl || appsScriptUrl.includes(OLD_APPS_SCRIPT_URL_PATTERN) || appsScriptUrl.trim() === '') {
    appsScriptUrl = GOOGLE_SHEETS_WEB_APP_URL;
  }

  const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const payload = {
    action: "uploadFile",
    fileName: customFileName || file.name,
    mimeType: file.type || "application/octet-stream",
    base64Data: base64Data,
    folderId: db.pengaturan?.driveFolderId || ''
  };

  fetch(appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data && data.status === 'success') {
      const driveUrl = data.driveLink || data.fileUrl;
      if (driveUrl) callback(driveUrl);
    }
  })
  .catch(err => console.warn('Background Drive upload fallback:', err));
}

function extractDriveFileId(url) {
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function deleteFileFromCloudByUrl(url) {
  let appsScriptUrl = db.pengaturan?.appsScriptUrl || GOOGLE_SHEETS_WEB_APP_URL;
  if (!appsScriptUrl || appsScriptUrl.includes(OLD_APPS_SCRIPT_URL_PATTERN) || appsScriptUrl.trim() === '') {
    appsScriptUrl = GOOGLE_SHEETS_WEB_APP_URL;
  }
  const fileId = extractDriveFileId(url);
  if (!fileId) return;

  const payload = {
    action: "deleteById",
    fileId: fileId,
    folderId: db.pengaturan?.driveFolderId || ''
  };

  fetch(appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  }).catch(e => console.log('Background delete failed', e));
}

// LOCAL FILE TO DATA URL PREVIEW
function processLocalFileToDataUrl(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    callback(e.target.result);
  };
  reader.readAsDataURL(file);
}

// TOGGLE COLLAPSE & AUTO-HIDE SIDEBAR MENU DENGAN ICON STRIP 3 (FA-BARS)
let isTogglingSidebar = false;

function toggleSidebarCollapse(e) {
  if (e) {
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }

  // Prevent duplicate execution within 200ms (mobile touch/click debounce)
  if (isTogglingSidebar) return;
  isTogglingSidebar = true;
  setTimeout(() => { isTogglingSidebar = false; }, 200);

  const sidebar = document.querySelector('.sidebar');
  const main = document.querySelector('.main');
  const icon = document.getElementById('sidebarToggleIcon');

  if (!sidebar) return;

  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    const isMobileOpen = sidebar.classList.toggle('mobile-open');
    let backdrop = document.querySelector('.sidebar-mobile-backdrop');

    if (isMobileOpen) {
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'sidebar-mobile-backdrop';
        backdrop.onclick = (evt) => {
          if (evt && typeof evt.stopPropagation === 'function') evt.stopPropagation();
          closeMobileSidebar();
        };
        document.body.appendChild(backdrop);
      }
      if (icon) icon.className = 'fa-solid fa-xmark';
      document.body.style.overflow = 'hidden';
    } else {
      closeMobileSidebar();
    }
  } else {
    if (!main) return;
    const isCollapsed = sidebar.classList.toggle('collapsed');
    main.classList.toggle('expanded', isCollapsed);

    if (icon) {
      icon.className = 'fa-solid fa-bars';
    }

    localStorage.setItem('sdit_sidebar_collapsed', isCollapsed ? 'true' : 'false');
  }
}

function closeMobileSidebar(e) {
  if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.querySelector('.sidebar-mobile-backdrop');
  const icon = document.getElementById('sidebarToggleIcon');

  if (sidebar) sidebar.classList.remove('mobile-open');
  if (backdrop) backdrop.remove();
  if (icon) icon.className = 'fa-solid fa-bars';
  document.body.style.overflow = '';
}

function restoreSavedSidebarState() {
  const isMobile = window.innerWidth <= 768;
  const sidebar = document.querySelector('.sidebar');
  const main = document.querySelector('.main');
  const icon = document.getElementById('sidebarToggleIcon');

  if (isMobile) {
    if (sidebar) sidebar.classList.remove('mobile-open', 'collapsed');
    if (main) main.classList.remove('expanded');
    if (icon) icon.className = 'fa-solid fa-bars';
  } else {
    const isCollapsed = localStorage.getItem('sdit_sidebar_collapsed') === 'true';
    if (isCollapsed && sidebar && main) {
      sidebar.classList.add('collapsed');
      main.classList.add('expanded');
    }
    if (icon) icon.className = 'fa-solid fa-bars';
  }
}

function renderDashboardCharts() {
  // Safe helper to render or update dashboard charts/analytics
  const chartCanvas = document.getElementById('dashboardChart');
  if (!chartCanvas) return;
}

function loadDatabase() {
  const dataStr = localStorage.getItem(DB_KEY);
  let loadedDb = null;
  const isSiswaCleared = localStorage.getItem('sdit_siswa_cleared') === 'true';

  const defaultLists = {
    pengaturan: DEFAULT_PENGATURAN,
    profil: DEFAULT_PROFIL,
    berita: DEFAULT_BERITA_LIST,
    guru: DEFAULT_GURU_LIST,
    siswa: [],
    masuk: [],
    keluar: [],
    lulusan: DEFAULT_LULUSAN_LIST,
    kelas: DEFAULT_KELAS_LIST,
    administrasi: DEFAULT_ADMINISTRASI_LIST,
    inventaris: DEFAULT_INVENTARIS_LIST,
    ruangan: DEFAULT_RUANGAN_LIST,
    uks: DEFAULT_UKS_LIST,
    perpustakaan: DEFAULT_PERPUSTAKAAN_LIST
  };

  if (dataStr) {
    try {
      loadedDb = JSON.parse(dataStr);
    } catch(e) {
      console.warn('Gagal membaca localStorage, menggunakan data standar', e);
      loadedDb = null;
    }
  }

  if (!loadedDb || typeof loadedDb !== 'object') {
    loadedDb = { ...defaultLists };
  } else {
    // Fill ONLY missing or undefined keys, NEVER overwrite existing arrays even if empty []!
    Object.keys(defaultLists).forEach(key => {
      if (loadedDb[key] === undefined || loadedDb[key] === null) {
        loadedDb[key] = Array.isArray(defaultLists[key]) ? [] : defaultLists[key];
      }
    });
  }

  // Bersihkan URL exec lama dari penyimpanan lokal jika tersisa
  if (loadedDb.pengaturan) {
    if (!loadedDb.pengaturan.appsScriptUrl || loadedDb.pengaturan.appsScriptUrl.includes(OLD_APPS_SCRIPT_URL_PATTERN)) {
      loadedDb.pengaturan.appsScriptUrl = GOOGLE_SHEETS_WEB_APP_URL;
    }
  }

  // Pastikan data siswa tetap tersimpan di memori lokal agar langsung tampil tanpa delay saat refresh (sama seperti data guru)
  if (!Array.isArray(loadedDb.siswa)) {
    loadedDb.siswa = [];
  }

  // Pastikan data berita memiliki artikel default lengkap (termasuk artikel Kemendikdasmen dari portal)
  if (!Array.isArray(loadedDb.berita) || loadedDb.berita.length === 0 || !loadedDb.berita.some(b => b && b.judul && b.judul.includes('Kemendikdasmen'))) {
    loadedDb.berita = DEFAULT_BERITA_LIST;
  }

  return loadedDb;
}

function saveDatabaseLocalOnly() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    console.error('Local storage error:', e);
    // Ignore quota errors so execution can continue
  }
}

function saveDatabase() {
  saveDatabaseLocalOnly();
  updateDashboardStats();
  syncToGoogleSheetsCloud();
}

function updateCurrentDate() {
  try {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = new Date().toLocaleDateString('id-ID', options);
    const dateEl = document.getElementById('currentDateDisplay');
    if (dateEl) dateEl.textContent = '📅 ' + dateStr;
  } catch(e) {
    console.warn('Format date error:', e);
  }
}

// HANDLER EXCEL SERIAL DATE & VARIOUS DATE PARSERS
function parseDateComponents(str) {
  if (str === null || str === undefined || str === '') return null;

  const cleanStr = String(str).trim();

  const isNumeric = /^\d{5}(\.\d+)?$/.test(cleanStr) || (typeof str === 'number' && str > 25569 && str < 100000);
  if (isNumeric) {
    const serial = parseFloat(cleanStr);
    if (serial > 25569 && serial < 100000) {
      const utcDays = Math.floor(serial - 25569);
      const utcSeconds = utcDays * 86400;
      const dateObj = new Date(utcSeconds * 1000);
      return {
        day: dateObj.getUTCDate(),
        month: dateObj.getUTCMonth() + 1,
        year: dateObj.getUTCFullYear()
      };
    }
  }

  const dmYMatch = cleanStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmYMatch) {
    return {
      day: parseInt(dmYMatch[1], 10),
      month: parseInt(dmYMatch[2], 10),
      year: parseInt(dmYMatch[3], 10)
    };
  }

  const YmdMatch = cleanStr.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (YmdMatch) {
    return {
      day: parseInt(YmdMatch[3], 10),
      month: parseInt(YmdMatch[2], 10),
      year: parseInt(YmdMatch[1], 10)
    };
  }

  const d = new Date(cleanStr);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100) {
    return {
      day: d.getDate(),
      month: d.getMonth() + 1,
      year: d.getFullYear()
    };
  }

  return null;
}

function formatIndonesianDate(dateStr) {
  if (!dateStr) return '-';
  const parsed = parseDateComponents(dateStr);
  if (!parsed) return String(dateStr);

  const monthsIndo = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const monthName = monthsIndo[parsed.month - 1] || parsed.month;
  return `${parsed.day} ${monthName} ${parsed.year}`;
}

// ADMIN AUTHENTICATION LOGIC (ICON ONLY 👤)
function handleAdminIconClick() {
  if (isAdminLoggedIn) {
    if (confirm('Anda berada dalam Mode Admin.\n\nApakah Anda ingin keluar (Logout)?')) {
      isAdminLoggedIn = false;
      sessionStorage.removeItem('sdit_admin_logged_in');
      updateAdminUIState();
      alert('Anda telah keluar dari Mode Admin.');
      refreshCurrentSection();
    }
  } else {
    document.getElementById('adminPasswordInput').value = '';
    openModal('adminAuthModal');
  }
}

function handleAdminLoginSubmit(e) {
  e.preventDefault();
  const inputPass = document.getElementById('adminPasswordInput').value;

  if (inputPass === ADMIN_PASSWORD_CORRECT) {
    isAdminLoggedIn = true;
    sessionStorage.setItem('sdit_admin_logged_in', 'true');
    closeModal('adminAuthModal');
    updateAdminUIState();
    alert('🎉 Login Admin Berhasil!\n\nSeluruh menu Edit, Hapus, Tambah Data, Unggah Foto, Unggah File Surat PDF/Dokumen, Unduh Excel Ruangan Inventaris, Menu Sistem Backup/Restore, serta Unduh/Unggah Excel telah diaktifkan.');
    refreshCurrentSection();
  } else {
    alert('❌ Password Salah!');
  }
}

function updateAdminUIState() {
  const btnAdmin = document.getElementById('btnAdminIcon');
  if (btnAdmin) {
    if (isAdminLoggedIn) {
      btnAdmin.classList.add('is-logged-in');
    } else {
      btnAdmin.classList.remove('is-logged-in');
    }
  }

  // PROTEKSI MENU SISTEM (BACKUP & RESTORE HANYA TAMPIL SAAT ADMIN LOGIN)
  const sysWrapper = document.getElementById('adminSystemNavWrapper');
  if (sysWrapper) {
    sysWrapper.style.display = isAdminLoggedIn ? 'block' : 'none';
  }

  // PROTEKSI TOMBOL DASHBOARD HEADER (LIHAT PROFIL SEKOLAH & EXPORT BACKUP HANYA SAAT ADMIN LOGIN)
  const dashHeaderBtnWrapper = document.getElementById('adminDashHeaderBtnWrapper');
  if (dashHeaderBtnWrapper) {
    if (isAdminLoggedIn) {
      dashHeaderBtnWrapper.innerHTML = `
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="quickNav('profil')">
            <i class="fa-solid fa-school"></i> 🏫 Lihat Profil Sekolah
          </button>
          <button class="btn btn-primary" onclick="exportAllData()">
            <i class="fa-solid fa-download"></i> 💾 Export Data Backup
          </button>
        </div>
      `;
    } else {
      dashHeaderBtnWrapper.innerHTML = '';
    }
  }

  // PROTEKSI TOMBOL "+ TAMBAH BERITA" DI DASHBOARD
  const beritaBtnWrapper = document.getElementById('adminTambahBeritaBtnWrapper');
  if (beritaBtnWrapper) {
    if (isAdminLoggedIn) {
      beritaBtnWrapper.innerHTML = `
        <button class="btn btn-emerald" style="padding:6px 14px;font-size:12px;" onclick="openFormModalBerita()">
          <i class="fa-solid fa-plus"></i> + Tambah Berita Baru
        </button>
      `;
    } else {
      beritaBtnWrapper.innerHTML = '';
    }
  }
}

function refreshCurrentSection() {
  renderBeritaGrid();
  if (currentSectionId === 'profil') {
    renderProfilView();
  } else if (currentSectionId !== 'dashboard') {
    renderTable(currentSectionId);
  }
}

// NAVIGATION SWITCHER
function showSection(id, btn) {
  currentSectionId = id;
  
  if (!btn) {
    btn = document.querySelector("#navMenu button[onclick*='" + id + "']") || document.querySelector("#adminSystemNavWrapper button[onclick*='" + id + "']");
  }

  document.querySelectorAll('.sidebar button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const dashEl = document.getElementById('dashboard');
  const profEl = document.getElementById('profil');
  const contentEl = document.getElementById('contentSection');
  const pengEl = document.getElementById('pengaturan');
  const beritaDetailEl = document.getElementById('beritaDetailSection');

  if (dashEl) dashEl.classList.toggle('hide', id !== 'dashboard');
  if (profEl) profEl.classList.toggle('hide', id !== 'profil');
  if (pengEl) pengEl.classList.toggle('hide', id !== 'pengaturan');
  if (beritaDetailEl) beritaDetailEl.classList.toggle('hide', id !== 'beritaDetail');

  if (id === 'pengaturan') {
    if (contentEl) contentEl.classList.add('hide');
    populatePengaturanForm();
    return;
  }
  if (id === 'beritaDetail') {
    if (contentEl) contentEl.classList.add('hide');
    return;
  }
  if (contentEl) contentEl.classList.toggle('hide', id === 'dashboard' || id === 'profil');

  if (window.innerWidth <= 768) {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.querySelector('.sidebar-mobile-backdrop');
    const icon = document.getElementById('sidebarToggleIcon');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.remove();
    if (icon) icon.className = 'fa-solid fa-bars';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (id === 'profil') {
    renderProfilView();
  } else if (id !== 'dashboard' && id !== 'beritaDetail') {
    renderTable(id);
  } else if (id === 'dashboard') {
    updateDashboardStats();
    renderBeritaGrid();
    renderDashboardCharts();
  }
}

function quickNav(id) {
  const targetBtn = document.querySelector(`#navMenu button[onclick*="'${id}'"]`);
  showSection(id, targetBtn);
}

function updateDashboardStats() {
  if (!db) return;

  // 1. Total Siswa Aktif (Ambil dari Data Siswa db.siswa)
  const elSiswa = document.getElementById('st-siswa');
  const siswaCount = (db && Array.isArray(db.siswa)) ? db.siswa.length : 0;
  if (elSiswa) {
    elSiswa.textContent = siswaCount;
  }

  // 2. Guru & Tendik (Ambil dari Data Guru & Tendik db.guru)
  const elGuru = document.getElementById('st-guru');
  const guruCount = (db && Array.isArray(db.guru)) ? db.guru.length : 0;
  if (elGuru) {
    elGuru.textContent = guruCount;
  }

  // 3. Barang Inventaris (Ambil dari Data Inventaris db.inventaris - support id st-inv dan st-inventaris)
  const elInv = document.getElementById('st-inv') || document.getElementById('st-inventaris');
  const invCount = (db && Array.isArray(db.inventaris)) ? db.inventaris.length : 0;
  if (elInv) {
    elInv.textContent = invCount;
  }

  // 4. Total Kelas (Ambil dari Data Kelas db.kelas atau rombel unik siswa)
  const elKelas = document.getElementById('st-kelas');
  if (elKelas) {
    let uniqueClasses = new Set();
    if (db && Array.isArray(db.siswa)) {
      db.siswa.forEach(s => {
        let c = (s.Kelas || s['Rombel Saat Ini'] || '').trim();
        if (c) uniqueClasses.add(c);
      });
    }
    const kelasCount = uniqueClasses.size > 0 
      ? uniqueClasses.size 
      : ((db && Array.isArray(db.kelas) && db.kelas.length > 0) ? db.kelas.length : 12);
    elKelas.textContent = kelasCount;
  }

  const prof = db.profil || DEFAULT_PROFIL;
  const dashProfilBox = document.getElementById('dashProfilBox');
  if (dashProfilBox) {
    dashProfilBox.innerHTML = `
      <div style="font-size:16px;font-weight:800;color:var(--primary);margin-bottom:4px">${esc(prof.namaSekolah)}</div>
      <div style="color:var(--text-muted);font-size:12px;margin-bottom:8px">Akreditasi: <b>${esc(prof.akreditasi)}</b> • NPSN: <b>${esc(prof.npsn || '20231556')}</b></div>
      <div><strong>Kepala Sekolah:</strong> ${esc(prof.namaKepala || "Abdul Yakub, S.Ag")}</div>
      <div><strong>Alamat:</strong> ${esc(prof.alamat)}</div>
      <div style="margin-top:6px;font-size:12px;color:var(--emerald);font-weight:700"><i class="fa-solid fa-phone"></i> ${esc(prof.telepon)}</div>
    `;
  }

  const activityLog = document.getElementById('activityLog');
  if (activityLog) {
    const logs = [];
    logs.push(`Data Terdaftar: <b>${siswaCount} Siswa Aktif</b>`);
    logs.push(`Tenaga Pendidik: <b>${guruCount} Guru & Tendik</b>`);
    logs.push(`Aset Sekolah: <b>${invCount} Barang Terdata</b>`);
    logs.push(`Kelompok Belajar: <b>${(db && Array.isArray(db.kelas)) ? db.kelas.length : 12} Rombel Kelas</b>`);
    logs.push(`Administrasi: <b>${(db && Array.isArray(db.administrasi)) ? db.administrasi.length : 0} Arsip Surat</b>`);
    
    activityLog.innerHTML = logs.map(l => `<div style="padding:8px 0;border-bottom:1px solid #e2e8f0"><i class="fa-solid fa-check" style="color:var(--emerald)"></i> ${l}</div>`).join('');
  }
}

// BERITA TERKINI RENDERER & MODE SLIDE CAROUSEL OTOMATIS
function clearBeritaAutoSlideTimers() {
  beritaAutoSlideIntervals.forEach(t => clearInterval(t));
  beritaAutoSlideIntervals = [];
}

function renderBeritaGrid() {
  clearBeritaAutoSlideTimers();
  const container = document.getElementById('beritaGrid');
  if (!container) return;

  const bList = db.berita || DEFAULT_BERITA_LIST;

  if (bList.length === 0) {
    container.innerHTML = `
      <div style="grid-column: span 3;padding:24px;text-align:center;color:var(--text-muted)">
        Belum ada berita atau informasi terkini yang diunggah.
      </div>
    `;
    return;
  }

  container.innerHTML = bList.map((item, bIdx) => {
    let photoArr = item.fotos && Array.isArray(item.fotos) && item.fotos.length > 0 ? item.fotos : (item.foto ? [item.foto] : ['https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=600&q=80']);
    const isMultiPhoto = photoArr.length > 1;

    return `
      <div class="berita-card-minimal" onclick="openDetailBerita(${bIdx})" title="Klik untuk membuka berita selengkapnya">
        <div>
          <div class="berita-img-frame" id="beritaFrame_${bIdx}">
            <span class="berita-category-chip"><i class="fa-solid fa-tag"></i> ${esc(item.kategori || 'Berita')}</span>
            
            <div class="berita-carousel-track" id="beritaTrack_${bIdx}">
              ${photoArr.map(pUrl => `
                <img src="${esc(pUrl)}" class="berita-carousel-slide" alt="${esc(item.judul)}">
              `).join('')}
            </div>

            ${isMultiPhoto ? `
              <button class="berita-slide-btn prev" onclick="event.stopPropagation(); moveBeritaSlide(${bIdx}, -1)"><i class="fa-solid fa-chevron-left"></i></button>
              <button class="berita-slide-btn next" onclick="event.stopPropagation(); moveBeritaSlide(${bIdx}, 1)"><i class="fa-solid fa-chevron-right"></i></button>
              
              <div class="berita-slide-dots" id="beritaDots_${bIdx}" onclick="event.stopPropagation()">
                ${photoArr.map((_, pIdx) => `
                  <span class="berita-slide-dot ${pIdx === 0 ? 'active' : ''}" onclick="event.stopPropagation(); goToBeritaSlide(${bIdx}, ${pIdx})"></span>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <div class="berita-body">
            <div>
              <div class="berita-date">
                <i class="fa-regular fa-calendar"></i> ${esc(item.tanggal || '12 Agustus 2026')}
                ${isMultiPhoto ? `<span style="margin-left:auto;color:var(--emerald);font-weight:700;"><i class="fa-solid fa-images"></i> ${photoArr.length} Foto Slide</span>` : ''}
              </div>
              <div class="berita-title-text">${esc(item.judul)}</div>
              <div class="berita-snippet-text">${esc(item.ringkasan)}</div>
            </div>

            <div class="berita-read-more-bar">
              <span>Baca Selengkapnya</span> <i class="fa-solid fa-arrow-right"></i>
            </div>
          </div>
        </div>

        ${isAdminLoggedIn ? `
          <div style="padding:10px 16px;border-top:1px dashed var(--border);display:flex;justify-content:flex-end;gap:8px;" onclick="event.stopPropagation()">
            <button class="btn btn-secondary" style="padding:4px 8px;font-size:11px" onclick="event.stopPropagation(); openFormModalBerita(${bIdx})" title="Edit Berita"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="btn btn-danger" style="padding:4px 8px;font-size:11px" onclick="event.stopPropagation(); deleteBerita(${bIdx})" title="Hapus Berita"><i class="fa-solid fa-trash"></i> Hapus</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  bList.forEach((item, bIdx) => {
    let photoArr = item.fotos && Array.isArray(item.fotos) && item.fotos.length > 0 ? item.fotos : (item.foto ? [item.foto] : []);
    if (photoArr.length > 1) {
      let currentSlide = 0;
      const interval = setInterval(() => {
        currentSlide = (currentSlide + 1) % photoArr.length;
        goToBeritaSlide(bIdx, currentSlide);
      }, 3500);
      beritaAutoSlideIntervals.push(interval);
    }
  });
}

function moveBeritaSlide(bIdx, direction) {
  const track = document.getElementById(`beritaTrack_${bIdx}`);
  const dotsContainer = document.getElementById(`beritaDots_${bIdx}`);
  if (!track) return;

  const totalSlides = track.children.length;
  let currentActive = 0;

  if (dotsContainer) {
    const dots = Array.from(dotsContainer.children);
    currentActive = dots.findIndex(d => d.classList.contains('active'));
    if (currentActive < 0) currentActive = 0;
  }

  let newIdx = (currentActive + direction + totalSlides) % totalSlides;
  goToBeritaSlide(bIdx, newIdx);
}

function goToBeritaSlide(bIdx, slideIdx) {
  const track = document.getElementById(`beritaTrack_${bIdx}`);
  const dotsContainer = document.getElementById(`beritaDots_${bIdx}`);
  if (!track) return;

  track.style.transform = `translateX(-${slideIdx * 100}%)`;

  if (dotsContainer) {
    const dots = Array.from(dotsContainer.children);
    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === slideIdx);
    });
  }
}

// CONTROLLER BUKA PENUH HALAMAN BERITA & INFORMASI SEKOLAH (PORTAL 2 KOLOM SESUAI REFERENSI)
let currentDetailBeritaIdx = 0;
let currentDetailBeritaSlide = 0;
let currentDetailBeritaPhotos = [];

function openDetailBerita(idx) {
  const bList = db.berita || DEFAULT_BERITA_LIST;
  if (!bList || bList.length === 0) return;

  if (idx < 0 || idx >= bList.length) idx = 0;
  currentDetailBeritaIdx = idx;
  currentDetailBeritaSlide = 0;

  const item = bList[idx];
  currentDetailBeritaPhotos = (item.fotos && Array.isArray(item.fotos) && item.fotos.length > 0)
    ? item.fotos
    : (item.foto ? [item.foto] : ['https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=800&q=80']);

  const p = db.profil || DEFAULT_PROFIL;
  const peng = db.pengaturan || DEFAULT_PENGATURAN;
  const schoolName = p.namaSekolah || peng.namaSekolah || 'SDIT ANNISA';
  const schoolLogo = peng.logo ? getDirectImageSrc(peng.logo) : 'logo_annisa.png';
  const hasMultiplePhotos = currentDetailBeritaPhotos.length > 1;

  // Realistis view count counter
  const viewCount = item.views || (220 + ((idx * 43) % 290));

  // Penulis / Humas persis seperti screenshot ("👤 Humas SMPN 32" / sekolah)
  const authorName = item.penulis || `Humas ${schoolName}`;

  // Format paragraf artikel rapi
  const rawContent = item.konten || item.isi || item.ringkasan || 'Belum ada isi deskripsi berita yang dicantumkan.';
  const paragraphs = rawContent.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const formattedContentHtml = paragraphs.length > 0
    ? paragraphs.map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('')
    : `<p>${esc(rawContent)}</p>`;

  const sectionEl = document.getElementById('beritaDetailSection');
  if (!sectionEl) return;

  sectionEl.innerHTML = `
    <!-- Top Bar: Tombol Kembali di Kiri Atas & Breadcrumb -->
    <div class="portal-top-bar">
      <button class="btn-portal-back" onclick="backToDashboard()" title="Kembali ke Dashboard">
        <i class="fa-solid fa-arrow-left"></i> Kembali
      </button>
      <div class="portal-breadcrumb">
        <span style="cursor:pointer;" onclick="backToDashboard()">Dashboard</span>
        <i class="fa-solid fa-chevron-right" style="font-size:10px;"></i>
        <span>Berita & Informasi</span>
        <i class="fa-solid fa-chevron-right" style="font-size:10px;"></i>
        <span class="active-crumb">${esc(item.kategori || 'Artikel')}</span>
      </div>
    </div>

    <!-- Portal 2 Kolom Layout (Artikel Kiri + Postingan Terbaru Kanan) -->
    <div class="portal-layout">
      <!-- Kolom Kiri: Halaman Berita Penuh -->
      <article class="portal-main-article">
        <h1 class="portal-article-title">${esc(item.judul)}</h1>

        <!-- Foto Utama (Featured Photo Card) -->
        <div class="portal-article-media">
          <div class="portal-featured-card">
            <img id="portalDetailMainImg" src="${esc(currentDetailBeritaPhotos[0])}" class="portal-featured-img" alt="${esc(item.judul)}" onerror="this.src='https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=800&q=80'">
            ${hasMultiplePhotos ? `
              <button class="portal-slide-nav prev" onclick="movePortalDetailSlide(-1)" title="Foto Sebelumnya">
                <i class="fa-solid fa-chevron-left"></i>
              </button>
              <button class="portal-slide-nav next" onclick="movePortalDetailSlide(1)" title="Foto Berikutnya">
                <i class="fa-solid fa-chevron-right"></i>
              </button>
              <div class="portal-slide-badge">
                <span id="portalDetailSlideCounter">1</span> / ${currentDetailBeritaPhotos.length} Foto
              </div>
            ` : ''}
          </div>

          <!-- Foto Model Kartu jika Foto Banyak -->
          ${hasMultiplePhotos ? `
            <div class="portal-photo-cards-wrapper">
              <div class="portal-photo-cards-title">
                <i class="fa-solid fa-grip" style="color:var(--primary)"></i>
                <span>Galeri Dokumentasi Foto (${currentDetailBeritaPhotos.length} Foto)</span>
                <small style="font-weight:normal;color:var(--text-muted);margin-left:auto;">
                  <i class="fa-solid fa-hand-pointer"></i> Klik kartu foto untuk melihat
                </small>
              </div>
              <div class="portal-photo-cards-grid">
                ${currentDetailBeritaPhotos.map((pUrl, pIdx) => `
                  <div class="portal-photo-card ${pIdx === 0 ? 'active' : ''}" id="portalPhotoCard_${pIdx}" onclick="setPortalDetailSlide(${pIdx})" title="Lihat Foto #${pIdx + 1}">
                    <img src="${esc(pUrl)}" alt="Foto ${pIdx + 1}" onerror="this.src='https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=600&q=80'">
                    <div class="portal-photo-card-tag">Foto #${pIdx + 1}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Meta Bar (Penulis, Tanggal, Dibaca) seperti referensi -->
        <div class="portal-meta-bar">
          <span class="portal-meta-item">
            <i class="fa-solid fa-user" style="color:#64748b;"></i> ${esc(authorName)}
          </span>
          <span class="portal-meta-item">
            <i class="fa-regular fa-clock" style="color:#64748b;"></i> ${esc(item.tanggal || '16 Juli 2026')}
          </span>
          <span class="portal-meta-item">
            <i class="fa-regular fa-eye" style="color:#64748b;"></i> Dibaca: ${viewCount}
          </span>
          <span class="portal-meta-tag">
            <i class="fa-solid fa-tag"></i> ${esc(item.kategori || 'Berita')}
          </span>
        </div>

        <!-- Teks Isi Berita Lengkap -->
        <div class="portal-article-body">
          ${formattedContentHtml}
        </div>

        <!-- Bottom Actions & School Identity -->
        <div class="portal-bottom-actions">
          <div style="display:flex;align-items:center;gap:12px;">
            <img src="${esc(schoolLogo)}" alt="Logo" style="width:38px;height:38px;object-fit:contain;border-radius:10px;background:#f8fafc;padding:3px;border:1px solid #e2e8f0;" onerror="this.src='logo_annisa.png'">
            <div>
              <div style="font-weight:800;font-size:13px;color:#0f172a;">${esc(schoolName)}</div>
              <div style="font-size:11px;color:var(--text-muted);">Publikasi Resmi Sistem Informasi Sekolah</div>
            </div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary" style="padding:8px 14px;font-size:12px;" onclick="copyBeritaLink('${esc(item.judul)}')">
              <i class="fa-solid fa-share-nodes"></i> Bagikan
            </button>
            <button type="button" class="btn btn-emerald" style="padding:8px 14px;font-size:12px;" onclick="printDetailBerita(${idx})">
              <i class="fa-solid fa-print"></i> Cetak Berita
            </button>
            <button type="button" class="btn btn-primary" style="padding:8px 14px;font-size:12px;" onclick="backToDashboard()">
              <i class="fa-solid fa-arrow-left"></i> Kembali
            </button>
          </div>
        </div>
      </article>

      <!-- Kolom Kanan: POSTINGAN TERBARU (Dapat Diklik untuk Membuka Berita) -->
      <aside class="portal-sidebar">
        <div class="portal-sidebar-box">
          <div class="portal-sidebar-title">
            <i class="fa-solid fa-fire" style="color:#ef4444;"></i> POSTINGAN TERBARU
          </div>
          <div class="portal-recent-list">
            ${bList.map((other, oIdx) => {
              const otherPhotos = (other.fotos && Array.isArray(other.fotos) && other.fotos.length > 0)
                ? other.fotos
                : (other.foto ? [other.foto] : ['https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=600&q=80']);
              const thumbSrc = otherPhotos[0];
              const isCurrent = oIdx === idx;

              return `
                <div class="portal-recent-item ${isCurrent ? 'current-active' : ''}" onclick="openDetailBerita(${oIdx})" title="Buka artikel: ${esc(other.judul)}">
                  <div class="portal-recent-thumb-frame">
                    <img src="${esc(thumbSrc)}" alt="${esc(other.judul)}" onerror="this.src='https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=600&q=80'">
                    ${isCurrent ? '<span class="current-reading-chip">SEDANG DIBACA</span>' : ''}
                  </div>
                  <div class="portal-recent-info">
                    <div class="portal-recent-title">${esc(other.judul)}</div>
                    <div class="portal-recent-date">
                      <i class="fa-regular fa-clock"></i> ${esc(other.tanggal || 'Terbaru')}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </aside>
    </div>
  `;

  // Aktifkan tampilan beritaDetailSection
  showSection('beritaDetail');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setPortalDetailSlide(slideIdx) {
  if (!currentDetailBeritaPhotos || currentDetailBeritaPhotos.length === 0) return;
  currentDetailBeritaSlide = (slideIdx + currentDetailBeritaPhotos.length) % currentDetailBeritaPhotos.length;

  const mainImg = document.getElementById('portalDetailMainImg');
  if (mainImg) {
    mainImg.style.opacity = '0.4';
    mainImg.src = currentDetailBeritaPhotos[currentDetailBeritaSlide];
    setTimeout(() => { mainImg.style.opacity = '1'; }, 80);
  }

  const counter = document.getElementById('portalDetailSlideCounter');
  if (counter) {
    counter.textContent = currentDetailBeritaSlide + 1;
  }

  const cards = document.querySelectorAll('.portal-photo-card');
  cards.forEach((card, idx) => {
    card.classList.toggle('active', idx === currentDetailBeritaSlide);
  });
}

function movePortalDetailSlide(direction) {
  setPortalDetailSlide(currentDetailBeritaSlide + direction);
}

function backToDashboard() {
  showSection('dashboard');
  setTimeout(() => {
    const el = document.getElementById('dashboardBeritaHeader') || document.getElementById('dashboard');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, 60);
}

// Backward compatibility alias for modal calls
function openDetailBeritaModal(idx) {
  openDetailBerita(idx);
}

function copyBeritaLink(title) {
  const url = window.location.href.split('#')[0];
  const shareText = `${title} - SDIT ANNISA\n${url}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareText).then(() => {
      alert('📋 Tautan berita berhasil disalin ke clipboard!');
    }).catch(() => {
      prompt('Salin tautan berita berikut:', shareText);
    });
  } else {
    prompt('Salin tautan berita berikut:', shareText);
  }
}

function printDetailBerita(idx) {
  const bList = db.berita || DEFAULT_BERITA_LIST;
  const item = bList[idx];
  if (!item) return;

  const p = db.profil || DEFAULT_PROFIL;
  const peng = db.pengaturan || DEFAULT_PENGATURAN;
  const schoolName = p.namaSekolah || peng.namaSekolah || 'SDIT ANNISA';
  const schoolAddress = p.alamat || peng.alamatSekolah || 'Bekasi';
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.print();
    return;
  }

  const photos = (item.fotos && item.fotos.length > 0) ? item.fotos : (item.foto ? [item.foto] : []);
  const mainPhoto = photos[0] ? `<div style="text-align:center;margin:18px 0;"><img src="${photos[0]}" style="max-width:100%;max-height:360px;border-radius:10px;"></div>` : '';
  const content = item.konten || item.isi || item.ringkasan || '';

  printWindow.document.write(`
    <html>
      <head>
        <title>${esc(item.judul)} - ${esc(schoolName)}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #1e293b; line-height: 1.7; }
          .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 20px; }
          .header h2 { margin: 0; color: #1e3a8a; }
          .header p { margin: 4px 0 0; font-size: 13px; color: #64748b; }
          .meta { font-size: 13px; color: #64748b; margin-bottom: 14px; }
          .title { font-size: 22px; font-weight: bold; margin: 10px 0; color: #0f172a; }
          .content { font-size: 15px; white-space: pre-line; margin-top: 16px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>${esc(schoolName)}</h2>
          <p>${esc(schoolAddress)}</p>
        </div>
        <div class="meta">📅 ${esc(item.tanggal || '')} | Kategori: ${esc(item.kategori || 'Berita')}</div>
        <div class="title">${esc(item.judul)}</div>
        ${mainPhoto}
        <div class="content">${esc(content)}</div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

// UPLOAD BANYAK FOTO BERITA KHUSUS ADMIN (INSTANT PREVIEW + CLOUD SYNC)
function triggerBeritaPhotosUpload() {
  document.getElementById('beritaPhotosFileInput').value = '';
  document.getElementById('beritaPhotosFileInput').click();
}

function handleBeritaPhotosUpload(event) {
  const files = Array.from(event.target.files);
  if (!files || files.length === 0) return;

  let loadedCount = 0;
  files.forEach(file => {
    processLocalFileToDataUrlAndCloud(file, (finalUrl) => {
      tempUploadedBeritaPhotos.push(finalUrl);
      loadedCount++;
      if (loadedCount === files.length) {
        updateBeritaPhotoPreviewList();
      }
    });
  });
}

function removeTempUploadedPhoto(idx) {
  tempUploadedBeritaPhotos.splice(idx, 1);
  updateBeritaPhotoPreviewList();
}

function updateBeritaPhotoPreviewList() {
  const previewBox = document.getElementById('beritaPhotoPreviewBox');
  if (!previewBox) return;

  if (tempUploadedBeritaPhotos.length === 0) {
    previewBox.innerHTML = `
      <div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px;border:1px dashed var(--border);border-radius:10px;">
        Belum ada foto diunggah. Klik <strong>"📤 Unggah File Foto Berita"</strong> di atas.
      </div>
    `;
    return;
  }

  previewBox.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:var(--emerald);margin-bottom:8px;">
      <i class="fa-solid fa-images"></i> Terunggah ${tempUploadedBeritaPhotos.length} Foto (Mode Slide Otomatis Aktif):
    </div>
    <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;">
      ${tempUploadedBeritaPhotos.map((url, idx) => `
        <div style="position:relative;width:90px;height:70px;flex-shrink:0;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
          <img src="${esc(url)}" style="width:100%;height:100%;object-fit:cover">
          <button type="button" onclick="removeTempUploadedPhoto(${idx})" style="position:absolute;top:2px;right:2px;background:#ef4444;color:#fff;border:0;width:20px;height:20px;border-radius:50%;cursor:pointer;font-size:10px;display:grid;place-items:center;">&times;</button>
        </div>
      `).join('')}
    </div>
  `;
}

function openFormModalBerita(idx = -1) {
  if (!isAdminLoggedIn) {
    handleAdminIconClick();
    return;
  }

  const bList = db.berita || DEFAULT_BERITA_LIST;
  const item = idx >= 0 ? bList[idx] : {};

  tempUploadedBeritaPhotos = item.fotos && Array.isArray(item.fotos) && item.fotos.length > 0 ? [...item.fotos] : (item.foto ? [item.foto] : []);

  const bodyEl = document.getElementById('formModalBody');
  document.getElementById('formModalTitle').textContent = (idx >= 0 ? 'Edit ' : 'Tambah ') + 'Berita / Informasi Sekolah';

  bodyEl.innerHTML = `
    <form onsubmit="saveBeritaForm(event, ${idx})">
      <div class="form-grid">
        <div class="form-group full-width">
          <label>Judul Berita / Pengumuman</label>
          <input type="text" id="fBeritaJudul" value="${esc(item.judul || '')}" placeholder="Contoh: Pembukaan PPDB Gelombang 1 T.A 2026/2027" required autofocus>
        </div>
        <div class="form-group">
          <label>Kategori Berita</label>
          <select id="fBeritaKategori">
            <option value="Pengumuman" ${item.kategori === 'Pengumuman' ? 'selected' : ''}>Pengumuman</option>
            <option value="Prestasi" ${item.kategori === 'Prestasi' ? 'selected' : ''}>Prestasi</option>
            <option value="Kegiatan" ${item.kategori === 'Kegiatan' ? 'selected' : ''}>Kegiatan</option>
            <option value="Berita" ${item.kategori === 'Berita' ? 'selected' : ''}>Berita Umum</option>
          </select>
        </div>
        <div class="form-group">
          <label>Tanggal Berita</label>
          <input type="text" id="fBeritaTanggal" value="${esc(item.tanggal || '12 Agustus 2026')}" required>
        </div>

        <div class="form-group full-width">
          <label>Unggah File Foto Berita (Pilih 1 atau Banyak Foto Sekaligus)</label>
          <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
            <button type="button" class="btn btn-emerald" onclick="triggerBeritaPhotosUpload()">
              <i class="fa-solid fa-file-arrow-up"></i> 📤 Unggah File Foto Berita (Bisa Banyak)
            </button>
            <span style="font-size:12px;color:var(--text-muted)">Foto akan disimpan & tampil dalam mode slide otomatis.</span>
          </div>

          <div id="beritaPhotoPreviewBox">
            <!-- Dynamic Uploaded Photo Previews -->
          </div>
        </div>

        <div class="form-group full-width">
          <label>Ringkasan Singkat Berita / Informasi</label>
          <textarea id="fBeritaRingkasan" rows="3" placeholder="Ringkasan singkat yang tampil pada kartu di dashboard..." required>${esc(item.ringkasan || '')}</textarea>
        </div>

        <div class="form-group full-width">
          <label>Isi Lengkap Berita (Tampil Saat Berita Diklik Buka Penuh)</label>
          <textarea id="fBeritaKonten" rows="6" placeholder="Tuliskan isi artikel / narasi berita lengkap di sini (mendukung banyak paragraf)...">${esc(item.konten || item.isi || item.ringkasan || '')}</textarea>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
        <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">Batal</button>
        <button type="submit" class="btn btn-emerald"><i class="fa-solid fa-floppy-disk"></i> Simpan Berita</button>
      </div>
    </form>
  `;

  updateBeritaPhotoPreviewList();
  openModal('formModal');
}

function saveBeritaForm(e, idx) {
  e.preventDefault();

  let finalPhotos = [...tempUploadedBeritaPhotos];

  if (finalPhotos.length === 0) {
    finalPhotos = ["https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=600&q=80"];
  }

  const ringkasanText = document.getElementById('fBeritaRingkasan').value.trim();
  const kontenText = (document.getElementById('fBeritaKonten')?.value || '').trim() || ringkasanText;

  const newBerita = {
    judul: document.getElementById('fBeritaJudul').value.trim(),
    kategori: document.getElementById('fBeritaKategori').value,
    tanggal: document.getElementById('fBeritaTanggal').value.trim(),
    fotos: finalPhotos,
    foto: finalPhotos[0],
    ringkasan: ringkasanText,
    konten: kontenText
  };

  if (!db.berita) db.berita = [];

  if (idx >= 0) {
    db.berita[idx] = newBerita;
  } else {
    db.berita.unshift(newBerita);
  }

  saveDatabase();
  closeModal('formModal');
  renderBeritaGrid();
  alert('✨ Berita / Informasi Sekolah berhasil disimpan!');
}

function deleteBerita(idx) {
  if (!isAdminLoggedIn) {
    handleAdminIconClick();
    return;
  }

  if (confirm('Apakah Anda yakin ingin menghapus berita ini?')) {
    if (db.berita && db.berita[idx]) {
       const b = db.berita[idx];
       if (b.fotos) b.fotos.forEach(fUrl => {
          if (fUrl.includes('drive.google.com')) deleteFileFromCloudByUrl(fUrl);
       });
       if (b.foto && b.foto.includes('drive.google.com')) deleteFileFromCloudByUrl(b.foto);
    }
    db.berita.splice(idx, 1);
    saveDatabase();
    renderBeritaGrid();
  }
}

// PROFIL SEKOLAH RENDER ENGINE & INSTANT PREVIEW FOTO KEPALA SEKOLAH
function renderProfilView() {
  const p = db.profil || DEFAULT_PROFIL;

  document.getElementById('viewNamaSekolah').textContent = p.namaSekolah;
  document.getElementById('viewTaglineSekolah').textContent = p.tagline;
  document.getElementById('viewAkreditasi').textContent = p.akreditasi;
  document.getElementById('viewNPSN').textContent = p.npsn || '20231556';
  document.getElementById('viewKota').textContent = p.kota || 'Jakarta';

  document.getElementById('viewNamaKepala').textContent = p.namaKepala || 'Abdul Yakub, S.Ag';
  document.getElementById('viewJabatanKepala').textContent = p.jabatanKepala || 'Kepala Sekolah SDIT ANNISA';
  
  const imgKepala = document.getElementById('viewFotoKepala');
  if (imgKepala) {
    imgKepala.src = getDirectImageSrc(p.fotoKepala || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80');
  }

  document.getElementById('viewSambutanText').innerText = p.sambutanText;

  document.getElementById('viewVisiText').textContent = p.visiText;

  const misiUl = document.getElementById('viewMisiList');
  if (p.misiList && Array.isArray(p.misiList)) {
    misiUl.innerHTML = p.misiList.map(m => `<li>${esc(m)}</li>`).join('');
  }

  document.getElementById('viewNamaLengkap').textContent = p.namaLengkap;
  document.getElementById('viewAlamat').textContent = p.alamat;
  document.getElementById('viewTelepon').textContent = p.telepon;
  document.getElementById('viewEmail').textContent = p.email;

  const btnWrapper = document.getElementById('adminEditProfilBtnWrapper');
  if (isAdminLoggedIn) {
    btnWrapper.innerHTML = `
      <button class="btn btn-emerald" onclick="openEditProfilModal()">
        <i class="fa-solid fa-pen-to-square"></i> ✏️ Edit Profil & Sambutan
      </button>
    `;
  } else {
    btnWrapper.innerHTML = '';
  }
}

function triggerFotoKepalaUpload() {
  document.getElementById('fotoKepalaFileInput').value = '';
  document.getElementById('fotoKepalaFileInput').click();
}

function handleFotoKepalaUploadSubmit(event) {
  const file = event.target.files[0];
  if (!file) return;

  processLocalFileToDataUrlAndCloud(file, (finalUrl) => {
    tempUploadedFotoKepala = finalUrl;
    const previewEl = document.getElementById('editFotoKepalaPreview');
    if (previewEl) previewEl.src = tempUploadedFotoKepala;
  });
}

function openEditProfilModal() {
  if (!isAdminLoggedIn) {
    handleAdminIconClick();
    return;
  }

  const p = db.profil || DEFAULT_PROFIL;
  tempUploadedFotoKepala = p.fotoKepala || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80';

  document.getElementById('editNamaKepala').value = p.namaKepala || 'Abdul Yakub, S.Ag';
  document.getElementById('editJabatanKepala').value = p.jabatanKepala || 'Kepala Sekolah SDIT ANNISA';
  document.getElementById('editFotoKepalaPreview').src = tempUploadedFotoKepala;
  document.getElementById('editSambutanText').value = p.sambutanText || '';

  document.getElementById('editVisiText').value = p.visiText || '';
  document.getElementById('editMisiText').value = Array.isArray(p.misiList) ? p.misiList.join('\n') : '';

  document.getElementById('editNamaSekolah').value = p.namaSekolah || '';
  document.getElementById('editAkreditasi').value = p.akreditasi || '';
  document.getElementById('editNPSN').value = p.npsn || '20231556';
  document.getElementById('editTelepon').value = p.telepon || '';
  document.getElementById('editAlamat').value = p.alamat || '';
  document.getElementById('editEmail').value = p.email || '';

  openModal('editProfilModal');
}

function saveProfilEdits(e) {
  e.preventDefault();

  const misiRaw = document.getElementById('editMisiText').value;
  const misiArr = misiRaw.split('\n').map(s => s.trim()).filter(s => s.length > 0);

  const finalFotoKepala = tempUploadedFotoKepala || (db.profil && db.profil.fotoKepala) || DEFAULT_PROFIL.fotoKepala;

  db.profil = {
    namaSekolah: document.getElementById('editNamaSekolah').value,
    tagline: db.profil.tagline || DEFAULT_PROFIL.tagline,
    akreditasi: document.getElementById('editAkreditasi').value,
    npsn: document.getElementById('editNPSN').value,
    kota: db.profil.kota || DEFAULT_PROFIL.kota,
    namaKepala: document.getElementById('editNamaKepala').value,
    jabatanKepala: document.getElementById('editJabatanKepala').value,
    fotoKepala: finalFotoKepala,
    sambutanText: document.getElementById('editSambutanText').value,
    visiText: document.getElementById('editVisiText').value,
    misiList: misiArr,
    namaLengkap: document.getElementById('editNamaSekolah').value + ' (Sekolah Dasar Islam Terpadu)',
    alamat: document.getElementById('editAlamat').value,
    telepon: document.getElementById('editTelepon').value,
    email: document.getElementById('editEmail').value
  };

  saveDatabase();
  closeModal('editProfilModal');
  renderProfilView();
  alert('✨ Perubahan Profil Sekolah & Foto Kepala Sekolah berhasil disimpan!');
}

function resetProfilDefault() {
  if (confirm('Apakah Anda yakin ingin mengembalikan data Profil Sekolah ke setelan default awal?')) {
    db.profil = JSON.parse(JSON.stringify(DEFAULT_PROFIL));
    saveDatabase();
    closeModal('editProfilModal');
    renderProfilView();
    alert('Data profil berhasil di-reset ke default.');
  }
}

// HANDLER UNGGAH FOTO GURU & LULUSAN KHUSUS ADMIN (CARD CAMERA CLICK TO GOOGLE DRIVE & DATAURL)
function triggerGuruPhotoUpload(realIdx) {
  if (!isAdminLoggedIn) {
    alert('Silakan login via Icon Admin (👤) terlebih dahulu untuk mengunggah foto.');
    handleAdminIconClick();
    return;
  }
  selectedGuruIndexForPhotoUpload = realIdx;
  document.getElementById('guruPhotoFileInput').value = '';
  document.getElementById('guruPhotoFileInput').click();
}

function handleGuruPhotoUploadSubmit(event) {
  const file = event.target.files[0];
  if (!file) return;

  const guru = db.guru[selectedGuruIndexForPhotoUpload];
  let customFileName = file.name;
  if (guru) {
      const ext = file.name.split('.').pop();
      const safeName = (guru.Nama || 'Guru').replace(/[^a-zA-Z0-9]/g, '_');
      customFileName = `Foto_Guru_${safeName}.${ext}`;
  }

  processLocalFileToDataUrlAndCloud(file, (finalUrl) => {
    if (selectedGuruIndexForPhotoUpload >= 0 && db.guru[selectedGuruIndexForPhotoUpload]) {
      db.guru[selectedGuruIndexForPhotoUpload].Foto = finalUrl;
      saveDatabase();
      renderTable('guru');
    }
  }, customFileName);
  alert(`Foto guru berhasil diperbarui!`);
}

function triggerLulusanPhotoUpload(realIdx) {
  if (!isAdminLoggedIn) {
    alert('Silakan login via Icon Admin (👤) terlebih dahulu untuk mengunggah foto alumni.');
    handleAdminIconClick();
    return;
  }
  selectedLulusanIndexForPhotoUpload = realIdx;
  document.getElementById('lulusanPhotoFileInput').value = '';
  document.getElementById('lulusanPhotoFileInput').click();
}

function handleLulusanPhotoUploadSubmit(event) {
  const file = event.target.files[0];
  if (!file) return;

  const lulusan = db.lulusan[selectedLulusanIndexForPhotoUpload];
  let customFileName = file.name;
  if (lulusan) {
      const ext = file.name.split('.').pop();
      const safeName = (lulusan.Nama || 'Alumni').replace(/[^a-zA-Z0-9]/g, '_');
      customFileName = `Foto_Alumni_${safeName}.${ext}`;
  }

  processLocalFileToDataUrlAndCloud(file, (finalUrl) => {
    if (selectedLulusanIndexForPhotoUpload >= 0 && db.lulusan[selectedLulusanIndexForPhotoUpload]) {
      db.lulusan[selectedLulusanIndexForPhotoUpload].Foto = finalUrl;
      saveDatabase();
      renderTable('lulusan');
    }
  }, customFileName);
  alert(`Foto alumni berhasil diperbarui!`);
}

// HANDLER FOTO PADA FORM MODAL MASTER DATA (GURU & ALUMNI)
function triggerFormModalPhotoUpload() {
  document.getElementById('fotoFormModalFileInput').value = '';
  document.getElementById('fotoFormModalFileInput').click();
}

function handleFormModalPhotoUploadSubmit(event) {
  const file = event.target.files[0];
  if (!file) return;

  processLocalFileToDataUrlAndCloud(file, (finalUrl) => {
    tempUploadedSingleFormPhoto = finalUrl;
    const previewEl = document.getElementById('formModalPhotoPreview');
    if (previewEl) previewEl.src = tempUploadedSingleFormPhoto;
  });
}

// HANDLER UNGGAH FILE SURAT (PDF / DOKUMEN) KHUSUS ADMIN
function triggerSuratFileUpload(realIdx) {
  if (!isAdminLoggedIn) {
    alert('Silakan login via Icon Admin (👤) terlebih dahulu untuk mengunggah berkas surat.');
    handleAdminIconClick();
    return;
  }
  selectedSuratIndexForFileUpload = realIdx;
  document.getElementById('suratFileInput').value = '';
  document.getElementById('suratFileInput').click();
}

function handleSuratFileUploadSubmit(event) {
  const file = event.target.files[0];
  if (!file) return;

  const row = db.administrasi[selectedSuratIndexForFileUpload];
  let customFileName = file.name;
  if (row) {
      const ext = file.name.split('.').pop();
      const safeJenis = (row['Jenis Surat'] || 'Surat').replace(/[^a-zA-Z0-9]/g, '_');
      const safeNo = (row['Nomor Surat'] || 'Tanpa_Nomor').replace(/[^a-zA-Z0-9]/g, '_');
      customFileName = `Dokumen_${safeJenis}_${safeNo}.${ext}`;
  }

  processLocalFileToDataUrlAndCloud(file, (finalUrl) => {
    if (selectedSuratIndexForFileUpload >= 0 && db.administrasi[selectedSuratIndexForFileUpload]) {
      db.administrasi[selectedSuratIndexForFileUpload]['File Surat'] = finalUrl;
      db.administrasi[selectedSuratIndexForFileUpload]['Nama File'] = customFileName;
      saveDatabase();
      renderTable('administrasi');
    }
  }, customFileName);
  alert(`Berkas surat "${customFileName}" berhasil diunggah!`);
}

function openSuratFileDocument(realIdx) {
  const row = db.administrasi[realIdx];
  if (!row || !row['File Surat']) {
    alert('File berkas surat belum diunggah.');
    return;
  }
  const dataUrl = row['File Surat'];
  const fileName = row['Nama File'] || 'Dokumen_Surat';

  const win = window.open(dataUrl, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.target = '_blank';
    a.download = fileName;
    a.click();
  }
}

// HANDLER GENERATOR SURAT
function openSuratPindahanModal(type, realIdx) {
  const list = db[type] || [];
  const row = list[realIdx] || {};

  const isMasuk = type === 'masuk';
  const namaSiswa = row.Nama || (isMasuk ? 'UMAR JORDAN' : 'Muhammad Al Fatih');
  const tglLahirFormatted = row['Tanggal Lahir'] || row['Tgl Lahir'] ? formatIndonesianDate(row['Tanggal Lahir'] || row['Tgl Lahir']) : 'Bekasi, 10 November 2016';
  const tempatTglLahirStr = row['Tempat Lahir'] ? `${row['Tempat Lahir']}, ${tglLahirFormatted}` : tglLahirFormatted;
  const jenisKelaminStr = row['Jenis Kelamin'] || row.JK || 'Laki-laki';
  const nisnSiswa = row.NISN || row.NIPD || '3174777848';
  const kelasSiswa = row.Kelas || row['Rombel Saat Ini'] || (isMasuk ? 'IV ( Empat )' : 'Kelas 3B-AL KHAWARIZMI');
  const asalSekolahStr = row['Sekolah Asal'] || row['Asal Sekolah'] || 'MIS Fatahillah';
  
  const namaOrtu = row['Nama Ortu'] || row['Nama Ayah'] || row.Ortu || 'Yayat Karyati / Suwito';
  const pekerjaanOrtu = row['Pekerjaan Ortu'] || row['Pekerjaan Ayah'] || row.Pekerjaan || '-';
  const sekolahTujuanFull = row['Sekolah Tujuan'] || row['Tujuan Sekolah'] || 'MADRASAH IBTIDAIYAH NEGERI 7 CIAMIS, Jalan Cibodas No 61 Rancah Girang Rancah – Ciamis 46387';

  const tglKejadian = formatIndonesianDate(row['Tanggal Masuk'] || row['Tanggal Keluar'] || row['Tanggal'] || (isMasuk ? '2026-06-11' : '2026-08-06'));
  const headmasterName = (db.profil && db.profil.namaKepala) ? db.profil.namaKepala : "Abdul Yakub,S.Ag";

  const defaultNoSurat = isMasuk ? `No. 48/SK/SDIT_ANNISA/VI/2026` : `13/SP/SDITANNISA/VIII/2025`;
  const noSurat = row.NoSurat || row['Nomor Surat'] || defaultNoSurat;

  const modalBodyEl = document.getElementById('suratPrintPaper');

  let letterHtml = '';

  if (isMasuk) {
    letterHtml = `
      <div class="no-print" style="background:#f8fafc;border:1px solid #cbd5e1;padding:12px 16px;border-radius:12px;margin-bottom:18px;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;">
        <div style="font-weight:800;color:var(--primary);margin-bottom:8px;font-size:13px;display:flex;align-items:center;gap:6px;">
          <i class="fa-solid fa-pen-to-square" style="color:var(--emerald)"></i> Edit Real-Time Surat Keterangan Diterima:
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:11px;font-weight:700;">Nomor Surat</label>
            <input type="text" id="rtNoSurat" value="${esc(noSurat)}" oninput="syncSuratRealTimeDiterima()" style="padding:6px;font-size:12px;margin-top:2px;">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;">Asal Sekolah</label>
            <input type="text" id="rtAsalSekolah" value="${esc(asalSekolahStr)}" oninput="syncSuratRealTimeDiterima()" style="padding:6px;font-size:12px;margin-top:2px;">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;">Diterima di Kelas</label>
            <input type="text" id="rtDiterimaKelas" value="${esc(kelasSiswa)}" oninput="syncSuratRealTimeDiterima()" style="padding:6px;font-size:12px;margin-top:2px;">
          </div>
        </div>
      </div>

      <div id="actualLetterPaper" class="letter-paper" style="background:#ffffff;padding:20px 42px;font-family:'Times New Roman',Times,serif;color:#000000;line-height:1.5;border:none;">
        <img src="kop_surat.png" class="letter-kop-img" alt="Kop Surat SDIT AN NISA Yayasan Haji Mohammad Thoha Sholeh" style="width:100%;max-height:135px;object-fit:contain;margin-bottom:12px;display:block;">

        <div style="text-align:center;margin-top:8px;margin-bottom:20px;">
          <div style="font-size:15pt;font-weight:bold;text-decoration:underline;text-transform:uppercase;">SURAT KETERANGAN DITERIMA</div>
          <div id="targetNoSurat" style="font-size:11pt;font-weight:bold;margin-top:4px;">${esc(noSurat)}</div>
        </div>

        <div style="font-size:11.5pt;line-height:1.6;text-align:justify;">
          <p style="margin-bottom:6px;">Saya yang bertanda tangan dibawah ini :</p>

          <table style="width:100%;margin:2px 0 8px 24px;border-collapse:collapse;border:none;">
            <tr>
              <td style="width:170px;padding:2px 0;vertical-align:top;border:none;">Nama</td>
              <td style="width:15px;padding:2px 0;vertical-align:top;border:none;">:</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">Abdul Yakub,S.Ag</td>
            </tr>
            <tr>
              <td style="padding:2px 0;vertical-align:top;border:none;">NUPTK</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">:</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">1847 7496 5120 0092</td>
            </tr>
            <tr>
              <td style="padding:2px 0;vertical-align:top;border:none;">Jabatan</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">:</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">Kepala SDIT ANNISA</td>
            </tr>
          </table>

          <p style="margin-bottom:6px;">Dengan ini memberikan keterangan kepada siswa yang dibawah ini :</p>

          <table style="width:100%;margin:2px 0 10px 24px;border-collapse:collapse;border:none;">
            <tr>
              <td style="width:170px;padding:2px 0;vertical-align:top;border:none;">Nama</td>
              <td style="width:15px;padding:2px 0;vertical-align:top;border:none;">:</td>
              <td style="padding:2px 0;vertical-align:top;border:none;"><strong>${esc(namaSiswa)}</strong></td>
            </tr>
            <tr>
              <td style="padding:2px 0;vertical-align:top;border:none;">Tempat Tanggal Lahir</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">:</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">${esc(tempatTglLahirStr)}</td>
            </tr>
            <tr>
              <td style="padding:2px 0;vertical-align:top;border:none;">Jenis Kelamin</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">:</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">${esc(jenisKelaminStr)}</td>
            </tr>
            <tr>
              <td style="padding:2px 0;vertical-align:top;border:none;">Asal Sekolah</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">:</td>
              <td id="targetAsalSekolah" style="padding:2px 0;vertical-align:top;border:none;">${esc(asalSekolahStr)}</td>
            </tr>
            <tr>
              <td style="padding:2px 0;vertical-align:top;border:none;">Diterima di Kelas</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">:</td>
              <td id="targetDiterimaKelas" style="padding:2px 0;vertical-align:top;border:none;">${esc(kelasSiswa)}</td>
            </tr>
          </table>

          <p style="margin-bottom:8px;text-align:justify;">
            Telah diterima sebagai Siswa/Siswi SDIT ANNISA Kota Bekasi Tahun Pelajaran 2026 / 2027 dan untuk melengkapi persyaratan di harapkan melampirkan beberapa persyaratan sebagai berikut :
          </p>

          <ol style="margin-left:45px;margin-bottom:12px;line-height:1.55;">
            <li>Surat Keterangan di keluarkan dari DAPODIK ONLINE.</li>
            <li>Kartu NISN/Print Out https://nisn.data.kemdikbud.go.id/</li>
            <li>Foto Copy Kartu Keluarga</li>
            <li>Rapor</li>
            <li>Foto Copy Akte Kelahiran</li>
          </ol>

          <p style="margin-bottom:20px;text-align:justify;">
            Demikian surat ini dibuat untuk dapat diketahui dan dipergunakan sebagaimana mestinya.
          </p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1.2fr;margin-top:24px;">
          <div></div>
          <div style="text-align:center;font-size:11.5pt;">
            <div>Bekasi, ${tglKejadian}</div>
            <div style="font-weight:bold;margin-top:4px;margin-bottom:6px;">Kepala SDIT ANNISA</div>
            
            <div style="height:125px;display:flex;align-items:center;justify-content:center;position:relative;">
              <img src="stempel_ttd.png" alt="Stempel & TTD Resmi SDIT AN NISA Abdul Yakub, S.Ag" style="max-height:145px;width:210px;object-fit:contain;mix-blend-mode:multiply;">
            </div>

            <div style="font-weight:bold;font-size:12pt;margin-top:4px;">Abdul Yakub,S.Ag</div>
          </div>
        </div>
      </div>
    `;
  } else {
    letterHtml = `
      <div class="no-print" style="background:#f8fafc;border:1px solid #cbd5e1;padding:12px 16px;border-radius:12px;margin-bottom:18px;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;">
        <div style="font-weight:800;color:var(--primary);margin-bottom:8px;font-size:13px;display:flex;align-items:center;gap:6px;">
          <i class="fa-solid fa-pen-to-square" style="color:var(--emerald)"></i> Edit Real-Time Surat Keterangan Pindah Sekolah:
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:11px;font-weight:700;">Nomor Surat</label>
            <input type="text" id="rtNoSurat" value="${esc(noSurat)}" oninput="syncSuratRealTimePindah()" style="padding:6px;font-size:12px;margin-top:2px;">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;">Nama Orang Tua / Wali</label>
            <input type="text" id="rtNamaOrtu" value="${esc(namaOrtu)}" oninput="syncSuratRealTimePindah()" style="padding:6px;font-size:12px;margin-top:2px;">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;">Pekerjaan Orang Tua</label>
            <input type="text" id="rtPekerjaanOrtu" value="${esc(pekerjaanOrtu)}" oninput="syncSuratRealTimePindah()" style="padding:6px;font-size:12px;margin-top:2px;">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;">Sekolah & Alamat Tujuan Pindah</label>
            <input type="text" id="rtSekolahTujuan" value="${esc(sekolahTujuanFull)}" oninput="syncSuratRealTimePindah()" style="padding:6px;font-size:12px;margin-top:2px;">
          </div>
        </div>
      </div>

      <div id="actualLetterPaper" class="letter-paper" style="background:#ffffff;padding:20px 42px;font-family:'Times New Roman',Times,serif;color:#000000;line-height:1.5;border:none;">
        <img src="kop_surat.png" class="letter-kop-img" alt="Kop Surat SDIT AN NISA Yayasan Haji Mohammad Thoha Sholeh" style="width:100%;max-height:135px;object-fit:contain;margin-bottom:12px;display:block;">

        <div style="text-align:center;margin-top:8px;margin-bottom:20px;">
          <div style="font-size:15pt;font-weight:bold;text-decoration:underline;text-transform:uppercase;">SURAT KETERANGAN PINDAH SEKOLAH</div>
          <div id="targetNoSurat" style="font-size:11pt;font-weight:bold;margin-top:4px;">${esc(noSurat)}</div>
        </div>

        <div style="font-size:11.5pt;line-height:1.6;text-align:justify;">
          <p style="margin-bottom:8px;">Yang bertanda tangan dibawah ini Kepala SDIT ANNISA Kecamatan Jatiasih Kota Bekasi Propinsi Jawa Barat, menerangkan bahwa :</p>

          <table style="width:100%;margin:4px 0 8px 24px;border-collapse:collapse;border:none;">
            <tr>
              <td style="width:170px;padding:2px 0;vertical-align:top;border:none;">Nama</td>
              <td style="width:15px;padding:2px 0;vertical-align:top;border:none;">:</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">${esc(namaSiswa)}</td>
            </tr>
            <tr>
              <td style="padding:2px 0;vertical-align:top;border:none;">NISN</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">:</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">${esc(nisnSiswa)}</td>
            </tr>
            <tr>
              <td style="padding:2px 0;vertical-align:top;border:none;">Jenis Kelamin</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">:</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">${esc(jenisKelaminStr)}</td>
            </tr>
            <tr>
              <td style="padding:2px 0;vertical-align:top;border:none;">Murid Kelas</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">:</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">${esc(kelasSiswa)}</td>
            </tr>
          </table>

          <p style="margin-bottom:6px;">Sesuai surat permohonan pindah sekolah oleh Orang Tua / Wali Murid :</p>

          <table style="width:100%;margin:4px 0 8px 24px;border-collapse:collapse;border:none;">
            <tr>
              <td style="width:170px;padding:2px 0;vertical-align:top;border:none;">Nama</td>
              <td style="width:15px;padding:2px 0;vertical-align:top;border:none;">:</td>
              <td id="targetNamaOrtu" style="padding:2px 0;vertical-align:top;border:none;">${esc(namaOrtu)}</td>
            </tr>
            <tr>
              <td style="padding:2px 0;vertical-align:top;border:none;">Pekerjaan</td>
              <td style="padding:2px 0;vertical-align:top;border:none;">:</td>
              <td id="targetPekerjaanOrtu" style="padding:2px 0;vertical-align:top;border:none;">${esc(pekerjaanOrtu)}</td>
            </tr>
          </table>

          <p style="margin-bottom:20px;text-align:justify;">
            Telah mengajukan pindah ke <span id="targetSekolahTujuan">${esc(sekolahTujuanFull)}</span> . Bersama ini kami sertakan Buku Laporan Pendidikan (Raport) yang bersangkutan dan surat permohonan oleh Orang Tua / Wali Murid.
          </p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1.2fr;margin-top:24px;">
          <div></div>
          <div style="text-align:center;font-size:11.5pt;">
            <div>Bekasi, ${tglKejadian}</div>
            <div style="font-weight:bold;margin-top:4px;margin-bottom:6px;">Kepala SDIT ANNISA</div>
            
            <div style="height:125px;display:flex;align-items:center;justify-content:center;position:relative;">
              <img src="stempel_ttd.png" alt="Stempel & TTD Resmi SDIT AN NISA Abdul Yakub, S.Ag" style="max-height:145px;width:210px;object-fit:contain;mix-blend-mode:multiply;">
            </div>

            <div style="font-weight:bold;text-decoration:underline;font-size:12pt;margin-top:4px;">${esc(headmasterName)}</div>
          </div>
        </div>
      </div>
    `;
  }

  modalBodyEl.innerHTML = letterHtml;
  openModal('suratPrintModal');
}

function syncSuratRealTimeDiterima() {
  const valNo = document.getElementById('rtNoSurat')?.value || '';
  const valAsal = document.getElementById('rtAsalSekolah')?.value || '';
  const valKelas = document.getElementById('rtDiterimaKelas')?.value || '';

  const elNo = document.getElementById('targetNoSurat');
  const elAsal = document.getElementById('targetAsalSekolah');
  const elKelas = document.getElementById('targetDiterimaKelas');

  if (elNo) elNo.textContent = valNo;
  if (elAsal) elAsal.textContent = valAsal;
  if (elKelas) elKelas.textContent = valKelas;
}

function syncSuratRealTimePindah() {
  const valNo = document.getElementById('rtNoSurat')?.value || '';
  const valOrtu = document.getElementById('rtNamaOrtu')?.value || '';
  const valPekerjaan = document.getElementById('rtPekerjaanOrtu')?.value || '';
  const valTujuan = document.getElementById('rtSekolahTujuan')?.value || '';

  const elNo = document.getElementById('targetNoSurat');
  const elOrtu = document.getElementById('targetNamaOrtu');
  const elPekerjaan = document.getElementById('targetPekerjaanOrtu');
  const elTujuan = document.getElementById('targetSekolahTujuan');

  if (elNo) elNo.textContent = valNo;
  if (elOrtu) elOrtu.textContent = valOrtu;
  if (elPekerjaan) elPekerjaan.textContent = valPekerjaan;
  if (elTujuan) elTujuan.textContent = valTujuan;
}

function printSuratDokumen() {
  window.print();
}

// HANDLER EXPORT INVENTARIS KHUSUS PER RUANGAN DALAM BENTUK EXCEL (.XLSX) KHUSUS ADMIN
function exportInventarisPerRuangExcel(namaRuang) {
  if (!isAdminLoggedIn) {
    alert('Silakan login via Icon Admin (👤) terlebih dahulu.');
    handleAdminIconClick();
    return;
  }

  const allItems = db.inventaris || [];
  const roomItems = allItems.filter(r => (r['Nama Ruang'] || r.Lokasi || '').trim().toLowerCase() === namaRuang.trim().toLowerCase());

  if (roomItems.length === 0) {
    alert(`Tidak ada data barang inventaris pada ${namaRuang} untuk diunduh.`);
    return;
  }

  try {
    const headers = ['No', 'Nama Ruang', 'Nama Barang', 'Jumlah (QTY)', 'Satuan', 'Kondisi', 'Keterangan'];
    const rows = roomItems.map((item, idx) => [
      idx + 1,
      item['Nama Ruang'] || namaRuang,
      item['Nama Barang'] || item.Nama || '-',
      item.Jumlah || item.QTY || '1',
      item.Satuan || 'Unit',
      item.Kondisi || 'Baik',
      item.Keterangan || '-'
    ]);

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();

    const sheetName = namaRuang.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 30);
    XLSX.utils.book_append_sheet(wb, ws, sheetName || "Inventaris");

    const fileName = `Inventaris_${namaRuang.replace(/[^a-zA-Z0-9]/g, '_')}_SDIT_ANNISA.xlsx`;
    XLSX.writeFile(wb, fileName);

    alert(`🎉 File Excel inventaris "${namaRuang}" berhasil diunduh!`);
  } catch (err) {
    alert('Gagal mengekspor data inventaris ruangan ke Excel.');
  }
}

// HANDLER KELOLA / EDIT RUANGAN INVENTARIS VIA TOMBOL PENSIL (✏️)
function openEditRuangModal(namaRuangOld) {
  if (!isAdminLoggedIn) {
    alert('Silakan login via Icon Admin (👤) terlebih dahulu untuk mengedit ruangan.');
    handleAdminIconClick();
    return;
  }

  const bodyEl = document.getElementById('formModalBody');
  document.getElementById('formModalTitle').textContent = `✏️ Kelola Ruangan: ${namaRuangOld}`;

  bodyEl.innerHTML = `
    <form onsubmit="saveRenameRuangan(event, '${esc(namaRuangOld)}')">
      <div class="form-grid">
        <div class="form-group full-width">
          <label>Nama Ruangan (Ubah nama ruangan untuk memperbarui seluruh barang di dalamnya)</label>
          <input type="text" id="editNamaRuangInput" value="${esc(namaRuangOld)}" required autofocus style="font-weight:700;font-size:14px;color:var(--primary)">
        </div>
      </div>
      
      <div style="background:#fef3c7;border:1px solid #fde68a;padding:12px;border-radius:10px;margin-top:10px;margin-bottom:14px;font-size:12px;color:#92400e">
        <i class="fa-solid fa-circle-info"></i> Mengubah nama ruangan akan otomatis memperbarui data ruangan pada seluruh barang inventaris terkait.
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
        <button type="button" class="btn btn-danger" onclick="deleteRuanganInventaris('${esc(namaRuangOld)}')">
          <i class="fa-solid fa-trash"></i> 🗑️ Hapus Ruangan Ini
        </button>
        <div style="display:flex;gap:10px">
          <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">Batal</button>
          <button type="submit" class="btn btn-emerald"><i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan</button>
        </div>
      </div>
    </form>
  `;

  openModal('formModal');
}

function saveRenameRuangan(e, oldName) {
  e.preventDefault();
  const newName = document.getElementById('editNamaRuangInput').value.trim();
  if (!newName) return;

  let updateCount = 0;
  db.inventaris.forEach(item => {
    const curRoom = (item['Nama Ruang'] || item.Lokasi || item.Ruang || '').trim();
    if (curRoom.toLowerCase() === oldName.toLowerCase()) {
      item['Nama Ruang'] = newName;
      item.Lokasi = newName;
      updateCount++;
    }
  });

  saveDatabase();
  closeModal('formModal');
  renderTable('inventaris');
  alert(`🎉 Berhasil memperbarui nama ruangan menjadi "${newName}" (${updateCount} barang ter-update)!`);
}

function deleteRuanganInventaris(namaRuang) {
  if (!isAdminLoggedIn) {
    handleAdminIconClick();
    return;
  }

  if (confirm(`Apakah Anda yakin ingin menghapus seluruh Ruangan "${namaRuang}" dan SELURUH barang inventaris di dalamnya?`)) {
    db.inventaris = db.inventaris.filter(item => {
      const curRoom = (item['Nama Ruang'] || item.Lokasi || item.Ruang || '').trim();
      return curRoom.toLowerCase() !== namaRuang.toLowerCase();
    });

    saveDatabase();
    closeModal('formModal');
    renderTable('inventaris');
    alert(`🗑️ Ruangan "${namaRuang}" beserta barang di dalamnya telah dihapus.`);
  }
}

// HANDLER DETIL INVENTARIS PER RUANGAN
function openDetailInventarisRuangModal(namaRuang) {
  currentActiveRoomNameForInventaris = namaRuang;

  const titleEl = document.getElementById('detailRuangTitle');
  if (titleEl) titleEl.textContent = namaRuang;

  const allItems = db.inventaris || [];
  const roomItems = allItems.filter(r => (r['Nama Ruang'] || r.Lokasi || '').trim().toLowerCase() === namaRuang.trim().toLowerCase());

  const modalBody = document.getElementById('detailInventarisRuangBody');

  let totalUnitSum = 0;
  roomItems.forEach(i => {
    const qty = parseInt(i.Jumlah || i.QTY || 0, 10);
    if (!isNaN(qty)) totalUnitSum += qty;
  });

  modalBody.innerHTML = `
    <div style="background:#fffbeb;border:1px solid #fde68a;padding:12px 16px;border-radius:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div style="font-size:13px;color:#b45309;font-weight:700;">
        <i class="fa-solid fa-layer-group"></i> Total Barang Terdaftar: <strong>${roomItems.length} Jenis (${totalUnitSum} Unit)</strong>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        ${isAdminLoggedIn ? `
          <button class="btn btn-excel" style="padding:6px 12px;font-size:12px;" onclick="exportInventarisPerRuangExcel('${esc(namaRuang)}')">
            <i class="fa-solid fa-file-excel"></i> 📥 Unduh Excel Ruangan
          </button>
          <button class="btn btn-emerald" style="padding:6px 12px;font-size:12px;" onclick="openTambahBarangKeRuangModal('${esc(namaRuang)}')">
            <i class="fa-solid fa-plus"></i> + Tambah Barang Baru
          </button>
        ` : ''}
      </div>
    </div>

    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th style="width:40px">No</th>
            <th>Nama Barang</th>
            <th style="width:90px;text-align:center">Jumlah</th>
            <th style="width:80px">Satuan</th>
            <th style="width:90px">Kondisi</th>
            <th>Keterangan</th>
            ${isAdminLoggedIn ? `<th style="width:90px;text-align:center">Aksi</th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${roomItems.length === 0 ? `
            <tr>
              <td colspan="${isAdminLoggedIn ? 7 : 6}" style="text-align:center;padding:24px;color:var(--text-muted)">
                Belum ada data barang terdaftar di ${esc(namaRuang)}.
              </td>
            </tr>
          ` : roomItems.map((item, idx) => {
            const realIdx = db.inventaris.indexOf(item);
            return `
              <tr>
                <td style="color:var(--text-muted);font-weight:600">${idx + 1}</td>
                <td style="font-weight:700;color:var(--text-main);">${esc(item['Nama Barang'] || item.Nama)}</td>
                <td style="text-align:center;font-weight:800;color:var(--primary);">${esc(item.Jumlah || item.QTY || '1')}</td>
                <td>${esc(item.Satuan || 'Unit')}</td>
                <td><span class="stat-badge" style="background:#ecfdf5;color:#047857">${esc(item.Kondisi || 'Baik')}</span></td>
                <td style="font-size:12px;color:var(--text-muted);">${esc(item.Keterangan || item.Kategori || '-')}</td>
                ${isAdminLoggedIn ? `
                  <td style="text-align:center">
                    <button class="btn btn-secondary" style="padding:3px 6px;font-size:11px" onclick="openFormModal(${realIdx})" title="Edit Barang"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger" style="padding:3px 6px;font-size:11px" onclick="deleteTableRow(${realIdx}); openDetailInventarisRuangModal('${esc(namaRuang)}')" title="Hapus Barang"><i class="fa-solid fa-trash"></i></button>
                  </td>
                ` : ''}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div style="display:flex;justify-content:flex-end;margin-top:20px;">
      <button class="btn btn-secondary" onclick="closeModal('detailInventarisRuangModal')">Tutup</button>
    </div>
  `;

  openModal('detailInventarisRuangModal');
}

function openTambahBarangKeRuangModal(namaRuang) {
  closeModal('detailInventarisRuangModal');
  
  if (!TABLE_CFG.inventaris) return;
  
  const bodyEl = document.getElementById('formModalBody');
  document.getElementById('formModalTitle').textContent = `Tambah Barang di ${namaRuang}`;

  bodyEl.innerHTML = `
    <form onsubmit="saveBarangBaruKeRuang(event, '${esc(namaRuang)}')">
      <div class="form-grid">
        <div class="form-group full-width">
          <label>Nama Ruangan</label>
          <input type="text" id="fRuangName" value="${esc(namaRuang)}" readonly style="background:#f8fafc;font-weight:700;color:var(--primary)">
        </div>
        <div class="form-group full-width">
          <label>Nama Barang</label>
          <input type="text" id="fNamaBarang" placeholder="Contoh: Meja Siswa, Laptop Asus, Proyektor" required autofocus>
        </div>
        <div class="form-group">
          <label>Jumlah (QTY)</label>
          <input type="number" id="fJumlah" value="1" min="1" required>
        </div>
        <div class="form-group">
          <label>Satuan</label>
          <input type="text" id="fSatuan" value="Unit" required>
        </div>
        <div class="form-group">
          <label>Kondisi Barang</label>
          <select id="fKondisi">
            <option value="Baik">Baik</option>
            <option value="Rusak Ringan">Rusak Ringan</option>
            <option value="Rusak Berat">Rusak Berat</option>
          </select>
        </div>
        <div class="form-group full-width">
          <label>Keterangan Tambahan</label>
          <input type="text" id="fKeterangan" placeholder="Contoh: Pengadaan BOS 2024, Bahan Kayu Jati">
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
        <button type="button" class="btn btn-secondary" onclick="closeModal('formModal'); openDetailInventarisRuangModal('${esc(namaRuang)}')">Batal</button>
        <button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i> Simpan Barang</button>
      </div>
    </form>
  `;

  openModal('formModal');
}

function saveBarangBaruKeRuang(e, namaRuang) {
  e.preventDefault();

  const newObj = {
    "Nama Ruang": namaRuang,
    "Nama Barang": document.getElementById('fNamaBarang').value.trim(),
    "Jumlah": document.getElementById('fJumlah').value,
    "Satuan": document.getElementById('fSatuan').value.trim(),
    "Kondisi": document.getElementById('fKondisi').value,
    "Keterangan": document.getElementById('fKeterangan').value.trim()
  };

  db.inventaris.push(newObj);
  saveDatabase();
  closeModal('formModal');
  renderTable('inventaris');
  openDetailInventarisRuangModal(namaRuang);
}

// RENDER KELAS BERDASARKAN DATA SISWA (KARTU)
function renderKelasCards(container) {
  let kelasMap = {};
  (db.siswa || []).forEach(s => {
    let k = (s.Kelas || s['Rombel Saat Ini'] || 'Belum Ada Kelas').trim();
    if(!kelasMap[k]) kelasMap[k] = [];
    kelasMap[k].push(s);
  });
  let kelasList = Object.keys(kelasMap).sort();

  if(kelasList.length === 0) {
    container.innerHTML = `
      <div style="padding:48px 20px;text-align:center;color:var(--text-muted)">
        <i class="fa-solid fa-layer-group" style="font-size:42px;margin-bottom:12px;color:#cbd5e1"></i><br>
        <strong style="font-size:16px;color:var(--text-main)">Belum ada data kelas yang tersimpan.</strong><br>
        <span style="font-size:13px;display:inline-block;margin-top:6px">
          Silakan isi data Siswa terlebih dahulu, kelas akan terbentuk otomatis.
        </span>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; padding: 8px;">
      ${kelasList.map(k => `
        <div class="card" style="cursor:pointer; transition: 0.3s; border:1px solid var(--border);" onclick="renderSiswaPerKelasCards('${esc(k)}')">
          <div class="card-title">${esc(k)} <i class="fa-solid fa-users" style="color:var(--primary)"></i></div>
          <div class="stat-number" style="font-size:24px; color:var(--emerald);">${kelasMap[k].length} Siswa</div>
          <span class="stat-badge" style="background:#f1f5f9;color:var(--text-main); margin-top:12px;">Klik untuk lihat siswa</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSiswaPerKelasCards(kelasName) {
  const container = document.getElementById('tableContainer');
  document.getElementById('tablePageTitle').textContent = `Siswa Kelas ${kelasName}`;
  
  let siswaKelas = (db.siswa || []).filter(s => (s.Kelas || s['Rombel Saat Ini'] || 'Belum Ada Kelas').trim() === kelasName);
  
  document.getElementById('tablePageSubtitle').textContent = `Menampilkan total ${siswaKelas.length} siswa`;

  container.innerHTML = `
    <div style="margin-bottom: 16px;">
      <button class="btn btn-secondary" onclick="renderTable('kelas')"><i class="fa-solid fa-arrow-left"></i> Kembali ke Daftar Kelas</button>
    </div>
    <div class="guru-cards-grid">
      ${siswaKelas.map((row) => {
        const realIdx = db.siswa.indexOf(row);
        const defaultAvatar = 'https://cdn-icons-png.flaticon.com/512/149/149071.png'; // Icon gambar orang
        const photoUrl = getDirectImageSrc(row.Foto || defaultAvatar);

        return `
          <div class="guru-card-minimal" style="cursor:pointer;" onclick="handleStudentNameClick(${realIdx})">
            <div>
              <div class="guru-card-photo-frame" onclick="event.stopPropagation();">
                <img src="${esc(photoUrl)}" alt="${esc(row.Nama)}">
                ${isAdminLoggedIn ? `
                  <button class="btn-change-photo" onclick="triggerSiswaPhotoUpload(${realIdx}, '${esc(kelasName)}')" title="Unggah / Ubah Foto Siswa">
                    <i class="fa-solid fa-camera"></i>
                  </button>
                  ${row.Foto ? `
                    <button class="btn-change-photo" style="background:#ef4444; color:#fff; top: 8px; right: 8px; bottom: auto; left: auto; border:none; box-shadow:0 2px 4px rgba(0,0,0,0.2);" onclick="event.stopPropagation(); removeSiswaPhoto(${realIdx}, '${esc(kelasName)}')" title="Hapus Foto">
                      <i class="fa-solid fa-xmark"></i>
                    </button>
                  ` : ''}
                ` : ''}
              </div>
              <div class="guru-card-teacher-name" style="margin-top: 12px; font-size:14px; text-align:center;">
                ${esc(row.Nama)}
              </div>
              <div style="font-size:12px; color:var(--text-muted); text-align:center;">NISN: ${esc(row.NISN || '-')}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

let selectedSiswaIndexForPhotoUpload = -1;
let currentKelasView = '';

function triggerSiswaPhotoUpload(realIdx, kelasName) {
  if (!isAdminLoggedIn) {
    alert('Silakan login via Icon Admin (👤) terlebih dahulu untuk mengunggah foto.');
    handleAdminIconClick();
    return;
  }
  selectedSiswaIndexForPhotoUpload = realIdx;
  currentKelasView = kelasName;
  
  let fileInput = document.getElementById('siswaPhotoFileInput');
  if(!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'siswaPhotoFileInput';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.onchange = handleSiswaPhotoUploadSubmit;
    document.body.appendChild(fileInput);
  }
  
  fileInput.value = '';
  fileInput.click();
}

function handleSiswaPhotoUploadSubmit(event) {
  const file = event.target.files[0];
  if (!file) return;

  const s = db.siswa[selectedSiswaIndexForPhotoUpload];
  let customFileName = file.name;
  if (s) {
      const ext = file.name.split('.').pop();
      const safeName = (s.Nama || 'Siswa').replace(/[^a-zA-Z0-9]/g, '_');
      customFileName = `Foto_${safeName}.${ext}`;
  }

  processLocalFileToDataUrlAndCloud(file, (finalUrl) => {
    if (selectedSiswaIndexForPhotoUpload >= 0 && db.siswa[selectedSiswaIndexForPhotoUpload]) {
      db.siswa[selectedSiswaIndexForPhotoUpload].Foto = finalUrl;
      saveDatabase();
      if(currentKelasView) {
        renderSiswaPerKelasCards(currentKelasView);
      } else {
        renderTable('siswa');
      }
    }
  }, customFileName);
  alert('Foto siswa berhasil diperbarui!');
}

function removeSiswaPhoto(realIdx, kelasName) {
  if (!isAdminLoggedIn) return;
  if (confirm('Apakah Anda yakin ingin menghapus foto siswa ini?')) {
    if (db.siswa[realIdx]) {
      const oldUrl = db.siswa[realIdx].Foto;
      if (oldUrl && oldUrl.includes('drive.google.com')) deleteFileFromCloudByUrl(oldUrl);
      
      db.siswa[realIdx].Foto = '';
      saveDatabase();
      if(kelasName) {
        renderSiswaPerKelasCards(kelasName);
      } else {
        renderTable('siswa');
      }
    }
  }
}

// GENERIC DYNAMIC MASTER TABLES RENDER
function renderTable(id) {
  if (!TABLE_CFG[id]) return;
  const [title, fields] = TABLE_CFG[id];

  document.getElementById('tablePageTitle').textContent = title;
  
  if (id === 'kelas') {
    const tableContainer = document.getElementById('tableContainer');
    document.getElementById('tablePageSubtitle').textContent = `Menampilkan data kelas berdasarkan siswa`;
    const topActionsEl = document.getElementById('tableTopActions');
    if(topActionsEl) topActionsEl.innerHTML = '';
    const adminToolbarEl = document.getElementById('adminToolbarActions');
    if(adminToolbarEl) adminToolbarEl.innerHTML = '';
    
    renderKelasCards(tableContainer);
    return;
  }

  document.getElementById('tablePageSubtitle').textContent = `Menampilkan total ${db[id] ? db[id].length : 0} data tercatat`;
  
  const topActionsEl = document.getElementById('tableTopActions');
  const adminToolbarEl = document.getElementById('adminToolbarActions');

  if (isAdminLoggedIn) {
    topActionsEl.innerHTML = `
      <button class="btn btn-primary" onclick="openFormModal()">
        <i class="fa-solid fa-plus"></i> Tambah ${id === 'guru' ? 'Guru Baru' : (id === 'lulusan' ? 'Alumni Baru' : (id === 'administrasi' ? 'Surat Baru' : (id === 'inventaris' ? 'Barang Inventaris' : 'Data Baru')))}
      </button>
    `;
    adminToolbarEl.innerHTML = `
      <button class="btn btn-excel" onclick="downloadCurrentExcelTemplate()" title="Unduh Format Template Excel (.xlsx)">
        <i class="fa-solid fa-file-excel"></i> 📥 Unduh Template Excel
      </button>
      <button class="btn btn-emerald" onclick="triggerExcelUpload()" title="Unggah Data dari Excel (.xlsx/.xls)">
        <i class="fa-solid fa-file-arrow-up"></i> 📤 Unggah Data Excel
      </button>
      <button class="btn btn-secondary" onclick="exportCurrentExcel()" title="Export Excel Data Saat Ini">
        <i class="fa-solid fa-file-excel"></i> Export Excel
      </button>
      ${id === 'siswa' ? `
        <button class="btn btn-danger" onclick="clearAllSiswaData()" title="Kosongkan / Hapus Semua Data Siswa">
          <i class="fa-solid fa-trash"></i> 🗑️ Kosongkan Data Siswa
        </button>
      ` : ''}
    `;
  } else {
    topActionsEl.innerHTML = '';
    adminToolbarEl.innerHTML = '';
  }

  const searchVal = (document.getElementById('searchInput')?.value || '').toLowerCase();
  let items = db[id] || [];

  if (searchVal) {
    items = items.filter(row => Object.values(row).join(' ').toLowerCase().includes(searchVal));
  }

  const tableContainer = document.getElementById('tableContainer');
  
  if (items.length === 0) {
    tableContainer.innerHTML = `
      <div style="padding:48px 20px;text-align:center;color:var(--text-muted)">
        <i class="fa-solid fa-folder-open" style="font-size:42px;margin-bottom:12px;color:#cbd5e1"></i><br>
        <strong style="font-size:16px;color:var(--text-main)">Belum ada data ${title} yang tersimpan.</strong><br>
        <span style="font-size:13px;display:inline-block;margin-top:6px">
          ${isAdminLoggedIn ? 'Silakan klik <strong>"📤 Unggah Data Excel"</strong> atau <strong>"+ Tambah Data Baru"</strong> untuk mengisi data.' : 'Silakan hubungi Administrator Sekolah untuk mengisi data ini.'}
        </span>
      </div>
    `;
    return;
  }

  if (id === 'guru') {
    tableContainer.innerHTML = `
      <div class="guru-cards-grid">
        ${items.map((row) => {
          const realIdx = db[id].indexOf(row);
          const kelasLabel = row.Jabatan || row.Kelas || 'Guru Kelas 1';
          const defaultAvatar = 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80';
          const photoUrl = getDirectImageSrc(row.Foto || defaultAvatar);

          return `
            <div class="guru-card-minimal">
              <div>
                <div class="guru-card-class-tag">
                  <i class="fa-solid fa-chalkboard-user"></i> ${esc(kelasLabel)}
                </div>

                <div class="guru-card-photo-frame">
                  <img src="${esc(photoUrl)}" alt="${esc(row.Nama)}">
                  ${isAdminLoggedIn ? `
                    <button class="btn-change-photo" onclick="triggerGuruPhotoUpload(${realIdx})" title="Unggah / Ubah Foto Guru">
                      <i class="fa-solid fa-camera"></i>
                    </button>
                  ` : ''}
                </div>

                <div class="guru-card-teacher-name">
                  ${esc(row.Nama)}
                </div>
              </div>

              ${isAdminLoggedIn ? `
                <div class="guru-card-actions">
                  <button class="btn btn-secondary" style="padding:4px 10px;font-size:11px" onclick="openFormModal(${realIdx})" title="Edit"><i class="fa-solid fa-pen"></i> Edit</button>
                  <button class="btn btn-danger" style="padding:4px 10px;font-size:11px" onclick="deleteTableRow(${realIdx})" title="Hapus"><i class="fa-solid fa-trash"></i> Hapus</button>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
    return;
  }

  if (id === 'lulusan') {
    tableContainer.innerHTML = `
      <div class="lulusan-cards-grid">
        ${items.map((row) => {
          const realIdx = db[id].indexOf(row);
          const angkatanLabel = row.Tahun || row['Tahun Pelajaran'] || row.Angkatan || 'Angkatan 2025/2026';
          const defaultAvatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';
          const photoUrl = getDirectImageSrc(row.Foto || defaultAvatar);

          return `
            <div class="lulusan-card-minimal">
              <div>
                <div class="lulusan-card-name-top">
                  ${esc(row.Nama)}
                </div>

                <div class="lulusan-card-photo-frame">
                  <img src="${esc(photoUrl)}" alt="${esc(row.Nama)}">
                  ${isAdminLoggedIn ? `
                    <button class="btn-change-photo" onclick="triggerLulusanPhotoUpload(${realIdx})" title="Unggah / Ubah Foto Alumni">
                      <i class="fa-solid fa-camera"></i>
                    </button>
                  ` : ''}
                </div>

                <div class="lulusan-card-angkatan-tag">
                  <i class="fa-solid fa-graduation-cap"></i> ${esc(angkatanLabel)}
                </div>
              </div>

              ${isAdminLoggedIn ? `
                <div class="guru-card-actions">
                  <button class="btn btn-secondary" style="padding:4px 10px;font-size:11px" onclick="openFormModal(${realIdx})" title="Edit"><i class="fa-solid fa-pen"></i> Edit</button>
                  <button class="btn btn-danger" style="padding:4px 10px;font-size:11px" onclick="deleteTableRow(${realIdx})" title="Hapus"><i class="fa-solid fa-trash"></i> Hapus</button>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
    return;
  }

  if (id === 'inventaris') {
    const roomMap = {};
    items.forEach(row => {
      const roomName = (row['Nama Ruang'] || row.Lokasi || row.Ruang || 'Lain-lain').trim();
      if (!roomMap[roomName]) {
        roomMap[roomName] = { roomName, items: [], totalUnitSum: 0 };
      }
      roomMap[roomName].items.push(row);

      const qty = parseInt(row.Jumlah || row.QTY || 0, 10);
      if (!isNaN(qty)) roomMap[roomName].totalUnitSum += qty;
    });

    const roomList = Object.values(roomMap);

    tableContainer.innerHTML = `
      <table>
        <thead>
          <tr>
            <th style="width:50px">No</th>
            <th>Nama Ruangan</th>
            <th style="width:200px">Jumlah Inventaris</th>
            <th style="width:280px;text-align:center">Detail & Unduh Excel</th>
            ${isAdminLoggedIn ? `<th style="width:90px;text-align:center">Aksi</th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${roomList.map((rm, idx) => `
            <tr>
              <td style="color:var(--text-muted);font-weight:600">${idx + 1}</td>
              <td>
                <div style="font-weight:800;color:var(--text-main);font-size:14px;display:flex;align-items:center;gap:8px;">
                  <i class="fa-solid fa-door-open" style="color:var(--gold)"></i> ${esc(rm.roomName)}
                </div>
              </td>
              <td>
                <span class="hero-chip" style="background:#fffbeb;color:#b45309;border:1px solid #fde68a;font-size:12px;">
                  <i class="fa-solid fa-boxes-stacked"></i> ${rm.items.length} Jenis (${rm.totalUnitSum} Unit)
                </span>
              </td>
              <td style="text-align:center">
                <div style="display:flex;gap:6px;justify-content:center;align-items:center;flex-wrap:wrap;">
                  <button class="btn btn-emerald" style="padding:5px 10px;font-size:11px" onclick="openDetailInventarisRuangModal('${esc(rm.roomName)}')" title="Lihat Rincian Barang di ${esc(rm.roomName)}">
                    <i class="fa-solid fa-list-check"></i> 📋 Detail
                  </button>
                  ${isAdminLoggedIn ? `
                    <button class="btn btn-excel" style="padding:5px 10px;font-size:11px" onclick="exportInventarisPerRuangExcel('${esc(rm.roomName)}')" title="Unduh Excel Inventaris ${esc(rm.roomName)}">
                      <i class="fa-solid fa-file-excel"></i> 📥 Excel
                    </button>
                  ` : ''}
                </div>
              </td>
              ${isAdminLoggedIn ? `
                <td style="text-align:center">
                  <button class="btn btn-secondary" style="padding:4px 8px;font-size:11px" onclick="openEditRuangModal('${esc(rm.roomName)}')" title="Ubah Nama Ruangan / Hapus Ruangan"><i class="fa-solid fa-pen"></i> Edit</button>
                </td>
              ` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    return;
  }

  const isPindahanSection = id === 'masuk' || id === 'keluar';
  const isAdministrasiSection = id === 'administrasi';

  tableContainer.innerHTML = `
    ${isAdminLoggedIn ? `
      <div id="batchActionBar" class="batch-action-bar" style="display:none;">
        <div class="batch-action-text">
          <i class="fa-solid fa-square-check" style="font-size:16px;color:#ef4444"></i> Terpilih <strong id="batchActionTextCount">0</strong> data
        </div>
        <button type="button" class="btn btn-danger" style="padding:6px 14px;font-size:12px;" onclick="deleteBatchSelectedRows()">
          <i class="fa-solid fa-trash"></i> 🗑️ Hapus Data Terpilih (<span id="batchCountDisplay">0</span>)
        </button>
      </div>
    ` : ''}
    <table>
      <thead>
        <tr>
          ${isAdminLoggedIn ? `
            <th style="width:36px;text-align:center">
              <input type="checkbox" id="selectAllCheckbox" class="table-checkbox" onchange="toggleSelectAllRows(this)" title="Centang Semua">
            </th>
          ` : ''}
          <th style="width:40px">No</th>
          ${fields.map(f => `<th>${esc(f)}</th>`).join('')}
          ${isPindahanSection ? `<th style="width:130px;text-align:center">Cetak Surat</th>` : ''}
          ${isAdminLoggedIn ? `<th style="width:110px;text-align:center">Aksi</th>` : ''}
        </tr>
      </thead>
      <tbody>
        ${items.map((row, idx) => {
          const realIdx = db[id].indexOf(row);
          return `
            <tr>
              ${isAdminLoggedIn ? `
                <td style="text-align:center">
                  <input type="checkbox" class="row-checkbox table-checkbox" value="${realIdx}" onchange="updateSelectedCountUI()" title="Centang data ini">
                </td>
              ` : ''}
              <td style="color:var(--text-muted);font-weight:600">${idx + 1}</td>
              ${fields.map(f => {
                let cellVal = row[f] || '-';
                
                if (id === 'siswa' && f === 'Nama') {
                  const upperName = (row.Nama || '-').toUpperCase();
                  return `
                    <td>
                      <a class="student-name-link" onclick="handleStudentNameClick(${realIdx})" title="Klik untuk lihat detail siswa">
                        <i class="fa-solid fa-user-graduate"></i> ${esc(upperName)}
                      </a>
                    </td>
                  `;
                }

                if (isAdministrasiSection && f === 'File Surat') {
                  const fileData = row['File Surat'];
                  if (fileData) {
                    return `
                      <td>
                        <div style="display:flex;gap:6px;align-items:center;">
                          <button class="btn btn-emerald" style="padding:4px 10px;font-size:11px" onclick="openSuratFileDocument(${realIdx})" title="Buka / Unduh Berkas Surat PDF/Dokumen">
                            <i class="fa-solid fa-file-pdf"></i> 📄 Buka File
                          </button>
                          ${isAdminLoggedIn ? `
                            <button class="btn btn-secondary" style="padding:4px 8px;font-size:11px" onclick="triggerSuratFileUpload(${realIdx})" title="Unggah Ulang / Ganti Berkas">
                              <i class="fa-solid fa-upload"></i>
                            </button>
                          ` : ''}
                        </div>
                      </td>
                    `;
                  } else {
                    return `
                      <td>
                        ${isAdminLoggedIn ? `
                          <button class="btn btn-emerald" style="padding:4px 10px;font-size:11px" onclick="triggerSuratFileUpload(${realIdx})" title="Unggah File Surat PDF/Dokumen">
                            <i class="fa-solid fa-file-arrow-up"></i> 📤 Unggah File Surat
                          </button>
                        ` : `<span style="color:var(--text-muted);font-size:12px">Belum Ada File</span>`}
                      </td>
                    `;
                  }
                }

                if (f.toLowerCase().includes('tanggal') || f.toLowerCase().includes('tgl')) {
                  cellVal = formatIndonesianDate(cellVal);
                }
                return `<td>${esc(cellVal)}</td>`;
              }).join('')}
              ${isPindahanSection ? `
                <td style="text-align:center">
                  <button class="btn btn-emerald" style="padding:4px 10px;font-size:11px" onclick="openSuratPindahanModal('${id}', ${realIdx})" title="Cetak Surat Resmi (PDF)">
                    <i class="fa-solid fa-print"></i> Cetak PDF
                  </button>
                </td>
              ` : ''}
              ${isAdminLoggedIn ? `
                <td style="text-align:center">
                  <button class="btn btn-secondary" style="padding:4px 8px;font-size:11px" onclick="openFormModal(${realIdx})" title="Edit"><i class="fa-solid fa-pen"></i></button>
                  <button class="btn btn-danger" style="padding:4px 8px;font-size:11px" onclick="deleteTableRow(${realIdx})" title="Hapus"><i class="fa-solid fa-trash"></i></button>
                </td>
              ` : ''}
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function filterCurrentTable() {
  if (currentSectionId !== 'dashboard' && currentSectionId !== 'profil') {
    renderTable(currentSectionId);
  }
}

// KLIK NAMA SISWA & VERIFIKASI TANGGAL LAHIR
function handleStudentNameClick(realIdx) {
  selectedSiswaIndexForVerification = realIdx;
  const s = db.siswa[realIdx];
  if (!s) return;

  if (isAdminLoggedIn) {
    showSiswaDetailModal(realIdx);
  } else {
    document.getElementById('verifyNamaDisplay').value = s.Nama;
    document.getElementById('verifyTglLahirInput').value = '';
    openModal('verifySiswaModal');
  }
}

function handleSiswaVerificationSubmit(e) {
  e.preventDefault();
  const inputTglStr = document.getElementById('verifyTglLahirInput').value.trim();
  const s = db.siswa[selectedSiswaIndexForVerification];

  if (!s) {
    alert('Siswa tidak ditemukan.');
    return;
  }

  const targetTglRaw = String(s['Tanggal Lahir'] || s['Tgl Lahir'] || '').trim();
  const parsedInput = parseDateComponents(inputTglStr);
  const parsedTarget = parseDateComponents(targetTglRaw);

  let isMatched = false;

  if (!parsedTarget || inputTglStr === targetTglRaw) {
    isMatched = true;
  } else if (parsedInput && parsedTarget) {
    if (parsedInput.day === parsedTarget.day &&
        parsedInput.month === parsedTarget.month &&
        parsedInput.year === parsedTarget.year) {
      isMatched = true;
    }
  }

  if (isMatched) {
    closeModal('verifySiswaModal');
    showSiswaDetailModal(selectedSiswaIndexForVerification);
  } else {
    alert('❌ Tanggal Lahir tidak cocok!\n\nPastikan Anda memasukkan Tanggal Lahir dengan format DD/MM/YYYY (Contoh: 30/12/2016 atau 10/02/2020).');
  }
}

function clearAllSiswaData() {
  if (!isAdminLoggedIn) {
    handleAdminIconClick();
    return;
  }

  const currentCount = (db.siswa || []).length;
  if (currentCount === 0) {
    alert('Data Siswa saat ini sudah kosong.');
    return;
  }

  if (confirm(`Apakah Anda yakin ingin MENGHAPUS / MENGOSONGKAN SELURUH ${currentCount} data siswa?\n\nCatatan: Data yang telah dikosongkan dapat diisi kembali dengan mengunggah file Excel baru.`)) {
    (db.siswa || []).forEach(row => {
       if (row.Foto && row.Foto.includes('drive.google.com')) deleteFileFromCloudByUrl(row.Foto);
    });
    db.siswa = [];
    localStorage.setItem('sdit_siswa_cleared', 'true');
    saveDatabase();
    renderTable('siswa');
    alert('Seluruh Data Siswa telah berhasil dikosongkan.');
  }
}

// BATCH CHECKBOX SELECTION & BATCH DELETE HANDLERS
function toggleSelectAllRows(masterCheckbox) {
  const checkboxes = document.querySelectorAll('.row-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = masterCheckbox.checked;
  });
  updateSelectedCountUI();
}

function updateSelectedCountUI() {
  const checkedBoxes = document.querySelectorAll('.row-checkbox:checked');
  const count = checkedBoxes.length;

  const bar = document.getElementById('batchActionBar');
  const countSpan = document.getElementById('batchCountDisplay');
  const textSpan = document.getElementById('batchActionTextCount');
  const masterCb = document.getElementById('selectAllCheckbox');
  const allBoxes = document.querySelectorAll('.row-checkbox');

  if (masterCb && allBoxes.length > 0) {
    masterCb.checked = (count === allBoxes.length && count > 0);
  }

  if (bar) {
    if (count > 0) {
      bar.style.display = 'flex';
      if (countSpan) countSpan.textContent = count;
      if (textSpan) textSpan.textContent = count;
    } else {
      bar.style.display = 'none';
    }
  }
}

function deleteBatchSelectedRows() {
  if (!isAdminLoggedIn) {
    handleAdminIconClick();
    return;
  }

  const checkedBoxes = Array.from(document.querySelectorAll('.row-checkbox:checked'));
  if (checkedBoxes.length === 0) {
    alert('Tidak ada data yang dicentang.');
    return;
  }

  const selectedIndices = checkedBoxes.map(cb => parseInt(cb.value, 10)).sort((a, b) => b - a);

  if (confirm(`Apakah Anda yakin ingin MENGHAPUS ${selectedIndices.length} data terpilih?`)) {
    selectedIndices.forEach(idx => {
      if (db[currentSectionId] && db[currentSectionId][idx] !== undefined) {
        const row = db[currentSectionId][idx];
        if (row.Foto && row.Foto.includes('drive.google.com')) deleteFileFromCloudByUrl(row.Foto);
        if (row['File Surat'] && row['File Surat'].includes('drive.google.com')) deleteFileFromCloudByUrl(row['File Surat']);
        db[currentSectionId].splice(idx, 1);
      }
    });

    if (currentSectionId === 'siswa' && (!db.siswa || db.siswa.length === 0)) {
      localStorage.setItem('sdit_siswa_cleared', 'true');
    }

    saveDatabase();
    renderTable(currentSectionId);
    alert(`🗑️ Berhasil menghapus ${selectedIndices.length} data terpilih!`);
  }
}

// POPUP DETAIL RINGKAS SISWA
function showSiswaDetailModal(idx) {
  const s = db.siswa[idx];
  if (!s) return;

  const detailBody = document.getElementById('detailSiswaBody');

    const targetKeys = ['NIPD', 'JK', 'NISN', 'Tempat Lahir', 'Tanggal Lahir', 'NIK', 'Agama', 'Alamat', 'RT', 'RW', 'Dusun', 'Kelurahan', 'Kecamatan', 'Kode Pos', 'Jenis Tinggal', 'Alat Transportasi', 'Telepon', 'HP', 'E-Mail', 'Data Ayah - Nama', 'Data Ayah - Tahun Lahir', 'Data Ayah - Jenjang Pendidikan', 'Data Ayah - Pekerjaan', 'Data Ayah - Penghasilan', 'Data Ayah - NIK', 'Data Ibu - Nama', 'Data Ibu - Tahun Lahir', 'Data Ibu - Jenjang Pendidikan', 'Data Ibu - Pekerjaan', 'Data Ibu - Penghasilan', 'Data Ibu - NIK', 'No Registrasi Akta Lahir', 'No KK', 'Sekolah Asal', 'No. Whatsapp'];
  
  let allKeys = [];
  targetKeys.forEach(tk => {
     const actualKey = Object.keys(s).find(k => k.trim().toLowerCase() === tk.trim().toLowerCase() || k.trim().toLowerCase() === ('lainnya - ' + tk).trim().toLowerCase() || k.trim().toLowerCase() === ('lainnya - ' + tk).replace('.','').trim().toLowerCase());
     if (actualKey) {
         if (!allKeys.includes(actualKey)) allKeys.push(actualKey);
     } else {
         allKeys.push(tk);
     }
  });

  let lastGroup = '';
  
  const detailsHtml = allKeys.map(k => {
        let val = s[k] || '';
    if (k.toLowerCase().includes('tanggal') || k.toLowerCase().includes('tgl')) {
      val = formatIndonesianDate(val);
    }
    if (k.toLowerCase() === 'jk' || k.toLowerCase() === 'jenis kelamin') {
      if (val === 'L' || val.toLowerCase() === 'l') val = 'Laki-laki';
      if (val === 'P' || val.toLowerCase() === 'p') val = 'Perempuan';
    }
    
    let displayKey = k;
    let groupHeaderHtml = '';
    
    const parts = k.split(' - ');
    if (parts.length > 1) {
       let currentGroup = parts[0];
       displayKey = parts[1];
       if (currentGroup !== lastGroup) {
           groupHeaderHtml = `
             <tr style="border-bottom: 1px solid var(--border); background: #f8fafc;">
               <td style="padding: 10px 0; width: 40%; font-weight: 800; color: #334155;">${esc(currentGroup)}</td>
               <td style="padding: 10px 0; width: 5%; text-align: center; color: #334155;">:</td>
               <td style="padding: 10px 0; font-weight: 700; color: var(--text-main); word-break: break-word;"></td>
             </tr>
           `;
           lastGroup = currentGroup;
       }
    } else {
       lastGroup = '';
    }

    return `
      ${groupHeaderHtml}
      <tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 10px 0; width: 40%; font-weight: 600; color: #64748b; ${parts.length > 1 ? 'padding-left: 16px;' : ''}">${esc(displayKey)}</td>
        <td style="padding: 10px 0; width: 5%; text-align: center; color: #64748b;">:</td>
        <td style="padding: 10px 0; font-weight: 700; color: var(--text-main); word-break: break-word;">${esc(val)}</td>
      </tr>
    `;
  }).join('');

  detailBody.innerHTML = `
    <div class="student-detail-header-card" style="background: linear-gradient(90deg, #1e40af, #0d9488); border-radius: 12px; padding: 20px; color: #fff; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div class="student-detail-name-title" style="font-size: 18px; font-weight: 800; text-transform: uppercase; margin-bottom: 4px;">${esc(s.Nama || 'Tanpa Nama')}</div>
        <div style="font-size:14px;opacity:0.9;">
          NISN: <strong>${esc(s.NISN || s.NIPD || '-')}</strong>
        </div>
      </div>
      <div style="text-align:right">
        <span class="stat-badge" style="background:rgba(255,255,255,0.25);color:#fff;font-size:13px; padding: 6px 12px; border-radius: 20px;">${esc(s.Kelas || s['Rombel Saat Ini'] || 'Belum Ada Kelas')}</span>
      </div>
    </div>

    <div class="student-detail-section-title" style="font-weight: 700; color: var(--primary); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; font-size: 15px;">
      <i class="fa-solid fa-list-ul"></i> Seluruh Data Siswa Terdaftar
    </div>
    
    <div style="max-height: 50vh; overflow-y: auto; padding-right: 8px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tbody>
          ${detailsHtml}
        </tbody>
      </table>
    </div>

    <div style="display:flex;justify-content:flex-end;margin-top:24px;gap:10px;">
      ${isAdminLoggedIn ? `<button class="btn btn-primary" onclick="closeModal('detailSiswaModal'); currentSectionId='siswa'; openFormModal(${idx})"><i class="fa-solid fa-pen"></i> Edit Detail</button>` : ''}
      <button class="btn btn-secondary" onclick="closeModal('detailSiswaModal')">Tutup</button>
    </div>
  `;

  openModal('detailSiswaModal');
}

// MASTER FORM MODAL HANDLERS (ADMIN) - 100% FILE UPLOAD UNTUK GURU & ALUMNI
function openFormModal(idx = -1) {
  if (!isAdminLoggedIn) {
    handleAdminIconClick();
    return;
  }

  if (!TABLE_CFG[currentSectionId]) return;
  
  if (currentSectionId === 'inventaris') {
    openTambahBarangKeRuangModal('Ruang Kelas 1');
    return;
  }

    const title = TABLE_CFG[currentSectionId][0];
  const fields = currentSectionId === 'siswa' ? TARGET_SISWA_FORM_FIELDS : TABLE_CFG[currentSectionId][1];
  const row = idx >= 0 ? db[currentSectionId][idx] : {};

  tempUploadedSingleFormPhoto = row.Foto || '';

  document.getElementById('formModalTitle').textContent = (idx >= 0 ? 'Edit ' : 'Tambah ') + title;

  const bodyEl = document.getElementById('formModalBody');
  bodyEl.innerHTML = `
    <form onsubmit="saveFormModal(event, ${idx})">
      <div class="form-grid">
        ${fields.filter(f => f !== 'File Surat' && f !== 'Jumlah Inventaris' && f !== 'Detail Inventaris').map(f => {
          if (f === 'Foto') {
            const defaultAvatar = currentSectionId === 'guru' ? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80' : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';
            const previewUrl = tempUploadedSingleFormPhoto || defaultAvatar;

            return `
              <div class="form-group full-width">
                <label>Unggah Foto (${currentSectionId === 'guru' ? 'Guru' : 'Alumni'})</label>
                <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
                  <div style="width:70px;height:85px;border-radius:12px;overflow:hidden;border:1px solid var(--border);flex-shrink:0;background:#f1f5f9;">
                    <img id="formModalPhotoPreview" src="${esc(previewUrl)}" style="width:100%;height:100%;object-fit:cover;">
                  </div>
                  <div>
                    <button type="button" class="btn btn-emerald" onclick="triggerFormModalPhotoUpload()">
                      <i class="fa-solid fa-camera"></i> 📤 Unggah File Foto
                    </button>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Foto otomatis tersimpan di Google Drive.</div>
                  </div>
                </div>
              </div>
            `;
          }

          return `
            <div class="form-group ${f === 'Keterangan' ? 'full-width' : ''}">
              <label>${esc(f)}</label>
              <input type="text" data-field="${esc(f)}" value="${esc(row[f] || '')}">
            </div>
          `;
        }).join('')}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
        <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">Batal</button>
        <button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i> Simpan Data</button>
      </div>
    </form>
  `;

  openModal('formModal');
}

function saveFormModal(e, idx) {
  e.preventDefault();
    const fields = currentSectionId === 'siswa' ? TARGET_SISWA_FORM_FIELDS : TABLE_CFG[currentSectionId][1];
  const newRow = idx >= 0 ? { ...db[currentSectionId][idx] } : {};

  fields.forEach(f => {
    if (f === 'Foto') {
      newRow[f] = tempUploadedSingleFormPhoto || newRow[f] || '';
    } else if (f !== 'File Surat' && f !== 'Jumlah Inventaris' && f !== 'Detail Inventaris') {
      const input = document.querySelector(`#formModalBody input[data-field="${f}"]`);
      newRow[f] = input ? input.value : (newRow[f] || '');
    }
  });

  if (currentSectionId === 'siswa' && newRow.Nama) {
    newRow.Nama = String(newRow.Nama).toUpperCase();
  }

  if (idx >= 0) {
    db[currentSectionId][idx] = newRow;
  } else {
    if (!db[currentSectionId]) db[currentSectionId] = [];
    db[currentSectionId].push(newRow);
  }

  if (currentSectionId === 'siswa') {
    localStorage.removeItem('sdit_siswa_cleared');
  }

  saveDatabase();
  tempUploadedSingleFormPhoto = '';
  closeModal('formModal');
  renderTable(currentSectionId);
  alert(`🎉 Data ${newRow.Nama || 'baru'} berhasil disimpan!`);
}

function deleteTableRow(idx) {
  if (!isAdminLoggedIn) {
    alert('Silakan login via Icon Admin (👤) terlebih dahulu.');
    return;
  }
  if (confirm('Yakin ingin menghapus data ini?')) {
    const row = db[currentSectionId][idx];
    if (row) {
        if (row.Foto && row.Foto.includes('drive.google.com')) deleteFileFromCloudByUrl(row.Foto);
        if (row['File Surat'] && row['File Surat'].includes('drive.google.com')) deleteFileFromCloudByUrl(row['File Surat']);
    }
    db[currentSectionId].splice(idx, 1);
    if (currentSectionId === 'siswa' && (!db.siswa || db.siswa.length === 0)) {
      localStorage.setItem('sdit_siswa_cleared', 'true');
    }
    saveDatabase();
    renderTable(currentSectionId);
  }
}

// FITUR EXCEL & DAPODIK IMPORT/EXPORT
function downloadCurrentExcelTemplate() {
  if (!isAdminLoggedIn) {
    alert('Silakan login via Icon Admin (👤) terlebih dahulu.');
    handleAdminIconClick();
    return;
  }

  const fields = currentSectionId === 'siswa' ? SISWA_DAPODIK_FIELDS : TABLE_CFG[currentSectionId][1];
  const sampleRow = TEMPLATE_SAMPLES[currentSectionId] || fields.map(f => `Contoh ${f}`);
  
  let wsData;
  if (currentSectionId === 'siswa') {
    // Generate Vertical Template
    wsData = fields.map((f, i) => {
       if (f.startsWith('Data ') || f === 'lainnya') {
           return [f, '', ''];
       }
       return [f, ':', sampleRow[i] || ''];
    });
  } else {
    wsData = [fields, sampleRow];
  }

  try {
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template_Data");

    const fileName = `Template_Import_${currentSectionId.toUpperCase()}_SDIT_ANNISA.xlsx`;
    XLSX.writeFile(wb, fileName);
  } catch (err) {
    alert('Gagal menghasilkan file Excel.');
  }
}

function triggerExcelUpload() {
  if (!isAdminLoggedIn) {
    alert('Silakan login via Icon Admin (👤) terlebih dahulu untuk mengunggah file.');
    handleAdminIconClick();
    return;
  }
  document.getElementById('excelFileInput').value = '';
  document.getElementById('excelFileInput').click();
}

function handleExcelFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      let rawRows = [];
      const processHeaders = (rawHeaders) => {
        let currentPrefix = '';
        let seen = {};
        return rawHeaders.map(h => {
          let rawH = String(h || '').trim();
          let lowerH = rawH.toLowerCase();
          if (lowerH.includes('ayah')) currentPrefix = 'Data Ayah - ';
          else if (lowerH.includes('ibu')) currentPrefix = 'Data Ibu - ';
          else if (lowerH.includes('wali')) currentPrefix = 'Data Wali - ';
          else if (lowerH.includes('lainnya') || lowerH.includes('rombel')) currentPrefix = '';
          
          if (['nama', 'tahun lahir', 'jenjang pendidikan', 'pekerjaan', 'penghasilan', 'nik'].includes(lowerH) && currentPrefix) {
              rawH = currentPrefix + rawH;
          }
          
          if (!rawH) return rawH;
          let finalH = rawH;
          let count = 1;
          while(seen[finalH]) {
              count++;
              finalH = rawH + ' (' + count + ')';
          }
          seen[finalH] = true;
          return finalH;
        });
      };

      if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
        const text = new TextDecoder('utf-8').decode(e.target.result);
        const lines = text.split(/\r\n|\n/).filter(l => l.trim().length > 0);
        
        let delimiter = ',';
        if (lines[0].includes(';')) delimiter = ';';
        else if (lines[0].includes('\t')) delimiter = '\t';

        let headerIdx = lines.findIndex(l => {
          const lower = l.toLowerCase();
          return lower.includes('nama') || lower.includes('nisn') || lower.includes('kelas');
        });
        if (headerIdx < 0) headerIdx = 0;

        const rawH = lines[headerIdx].split(delimiter).map(h => h.replace(/^["']|["']$/g, '').trim());
        const headers = processHeaders(rawH);
        
        for (let i = headerIdx + 1; i < lines.length; i++) {
          const rawVals = lines[i].split(delimiter).map(v => v.replace(/^["']|["']$/g, '').trim());
          if (rawVals.length < 2) continue;

          const rowObj = {};
          headers.forEach((h, hIdx) => {
            if (h) rowObj[h] = rawVals[hIdx] || '';
          });
          rawRows.push(rowObj);
        }
      } else {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const sheetAoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        if (!sheetAoa || sheetAoa.length === 0) {
          alert('File Excel kosong.');
          return;
        }

        // Detect if the sheet is vertical (Column A has keys, Column B is ':')
        let isVertical = false;
        let colonCount = 0;
        for (let r = 0; r < Math.min(10, sheetAoa.length); r++) {
            if (sheetAoa[r] && sheetAoa[r].length > 1 && String(sheetAoa[r][1]).trim() === ':') {
                colonCount++;
            }
        }
        
        if (colonCount >= 3) {
            isVertical = true;
            // Parse vertical layout
            let currentGroup = '';
            
            // Assume data columns start at index 2
            const numCols = sheetAoa.reduce((max, row) => Math.max(max, row.length), 0);
            for (let c = 2; c < numCols; c++) {
                const rowObj = {};
                let hasValue = false;
                
                for (let r = 0; r < sheetAoa.length; r++) {
                    const rowArr = sheetAoa[r];
                    if (!rowArr || rowArr.length === 0) continue;
                    
                    let key = String(rowArr[0] || '').trim();
                    let lowerK = key.toLowerCase();
                    
                    if (lowerK.includes('ayah')) currentGroup = 'Data Ayah - ';
                    else if (lowerK.includes('ibu')) currentGroup = 'Data Ibu - ';
                    else if (lowerK.includes('wali')) currentGroup = 'Data Wali - ';
                    else if (lowerK.includes('lainnya') || lowerK.includes('rombel')) currentGroup = '';
                    
                    if (['nama', 'tahun lahir', 'jenjang pendidikan', 'pekerjaan', 'penghasilan', 'nik'].includes(lowerK) && currentGroup) {
                        key = currentGroup + key;
                    }
                    
                    if (key && key !== ':') {
                        const val = String(rowArr[c] || '').trim();
                        if (val) {
                            rowObj[key] = val;
                            hasValue = true;
                        }
                    }
                }
                if (hasValue) rawRows.push(rowObj);
            }
        } else {
            // Standard horizontal parsing
            let headerRowIdx = sheetAoa.findIndex(rowArr => {
              if (!Array.isArray(rowArr)) return false;
              const rowStr = rowArr.join(' ').toLowerCase();
              return rowStr.includes('nama') || rowStr.includes('nisn') || rowStr.includes('kelas') || rowStr.includes('barang');
            });

            if (headerRowIdx < 0) headerRowIdx = 0;

            let currentGroup = '';
            const rawH = sheetAoa[headerRowIdx].map((h, idx) => {
               let topVal = String(h || '').trim();
               if (topVal) currentGroup = topVal;
               
               let val = topVal;
               if (currentSectionId === 'siswa' && sheetAoa.length > headerRowIdx + 1) {
                   let subVal = String(sheetAoa[headerRowIdx + 1][idx] || '').trim();
                   if (subVal) {
                       if (currentGroup && ['nama', 'tahun lahir', 'jenjang pendidikan', 'pekerjaan', 'penghasilan', 'nik'].includes(subVal.toLowerCase())) {
                           val = currentGroup + ' - ' + subVal;
                       } else {
                           val = subVal;
                       }
                   }
               }
               return val;
            });
            const headers = processHeaders(rawH);
            
            let startRow = headerRowIdx + 1;
            if (currentSectionId === 'siswa' && sheetAoa.length > headerRowIdx + 1) {
                let subRowStr = sheetAoa[headerRowIdx + 1].join(' ').toLowerCase();
                if (subRowStr.includes('tahun lahir') || subRowStr.includes('jenjang pendidikan')) {
                    startRow = headerRowIdx + 2;
                }
            }

            for (let i = startRow; i < sheetAoa.length; i++) {
              const rowArr = sheetAoa[i];
              if (!Array.isArray(rowArr) || rowArr.length === 0) continue;
              
              const rowObj = {};
              let hasValue = false;
              headers.forEach((h, hIdx) => {
                if (h) {
                  const val = rowArr[hIdx] !== undefined ? String(rowArr[hIdx]).trim() : '';
                  rowObj[h] = val;
                  if (val) hasValue = true;
                }
              });
              if (hasValue) rawRows.push(rowObj);
            }
        }
      }

      if (!rawRows || rawRows.length === 0) {
        alert('File kosong atau format data tidak dapat terbaca.');
        return;
      }

      let addedCount = 0;
      rawRows.forEach(row => {
        const newObj = { ...row };
        
        const findVal = (possibleNames) => {
          const keys = Object.keys(row);
          for (let name of possibleNames) {
            const matchedKey = keys.find(k => k.trim().toLowerCase() === name.trim().toLowerCase() || k.trim().toLowerCase().includes(name.trim().toLowerCase()));
            if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== '') {
              return String(row[matchedKey]).trim();
            }
          }
          return '';
        };

        if (currentSectionId === 'siswa') {
          newObj['Nama'] = findVal(['nama peserta didik', 'nama lengkap', 'nama siswa', 'nama']);
          newObj['NISN'] = findVal(['nisn', 'nipd', 'no induk']);
          newObj['Kelas'] = findVal(['rombel saat ini', 'rombel', 'kelas']);
          
          if (!newObj['Nama']) {
            const vals = Object.values(row);
            const strVal = vals.find(v => typeof v === 'string' && v.length > 2 && !/^\d+$/.test(v));
            if (strVal) newObj['Nama'] = strVal;
          }
        } else {
            const fields = currentSectionId === 'siswa' ? TARGET_SISWA_FORM_FIELDS : TABLE_CFG[currentSectionId][1];
          fields.forEach(field => {

            newObj[field] = findVal([field]);
          });
          if (!newObj.Nama && row.Nama) newObj.Nama = row.Nama;
        }

        if (newObj.Nama || Object.values(newObj).some(v => v !== '')) {
          if (!db[currentSectionId]) db[currentSectionId] = [];
          db[currentSectionId].push(newObj);
          addedCount++;
        }
      });

      if (addedCount > 0) {
        if (currentSectionId === 'siswa') {
          localStorage.removeItem('sdit_siswa_cleared');
        }
        saveDatabase();
        renderTable(currentSectionId);
        alert(`🎉 Berhasil mengunggah & mengimpor ${addedCount} data baru dari file Excel ke ${TABLE_CFG[currentSectionId][0]}!`);
      } else {
        alert('Format file Excel tidak dapat dicocokkan dengan kolom tabel. Pastikan terdapat kolom "Nama" atau "Nama Peserta Didik".');
      }
    } catch (err) {
      console.error(err);
      alert('Gagal membaca file Excel. Pastikan file dalam format .xlsx atau .xls.');
    }
  };

  reader.readAsArrayBuffer(file);
}

function exportCurrentExcel() {
  if (!TABLE_CFG[currentSectionId]) return;
    const title = TABLE_CFG[currentSectionId][0];
  const fields = currentSectionId === 'siswa' ? TARGET_SISWA_FORM_FIELDS : TABLE_CFG[currentSectionId][1];
  const exportFields = currentSectionId === 'siswa' ? SISWA_DAPODIK_FIELDS : fields;
  const rows = db[currentSectionId] || [];

  try {
    const wsData = [exportFields, ...rows.map(r => exportFields.map(f => r[f] || ''))];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 30));

    XLSX.writeFile(wb, title.replace(/[^a-z0-9]/gi, '_') + '_SDIT_ANNISA.xlsx');
  } catch (err) {
    alert('Gagal mengekspor data ke file Excel.');
  }
}

function exportAllData() {
  downloadFile(JSON.stringify(db, null, 2), 'backup_sdit_annisa_full.json', 'application/json');
}

function backupData() {
  if (!isAdminLoggedIn) {
    alert('Silakan login via Icon Admin (👤) terlebih dahulu.');
    handleAdminIconClick();
    return;
  }
  exportAllData();
  alert('💾 Backup data JSON berhasil diunduh.');
}

function restoreData() {
  if (!isAdminLoggedIn) {
    alert('Silakan login via Icon Admin (👤) terlebih dahulu.');
    handleAdminIconClick();
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const restored = JSON.parse(evt.target.result);
        if (restored && restored.profil) {
          db = restored;
          saveDatabase();
          alert('🎉 Data berhasil dipulihkan dari file backup!');
          location.reload();
        } else {
          alert('File backup JSON tidak valid.');
        }
      } catch (err) {
        alert('Gagal membaca file JSON.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function downloadFile(content, name, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// HELPER MODAL UTILS
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('show');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[m]));
}





// PENGATURAN SYSTEM
function populatePengaturanForm() {
  const p = db.pengaturan || DEFAULT_PENGATURAN;
  document.getElementById('settingNamaSekolah').value = p.namaSekolah || '';
  document.getElementById('settingTahunAjaran').value = p.tahunAjaran || '';
  document.getElementById('settingKepalaSekolah').value = p.kepalaSekolah || '';
  document.getElementById('settingAlamatSekolah').value = p.alamatSekolah || '';
  document.getElementById('settingAppsScriptUrl').value = p.appsScriptUrl || '';
  document.getElementById('settingDriveFolderId').value = p.driveFolderId || '';

  const logoImg = document.getElementById('previewSettingLogo');
  if (p.logo) {
    logoImg.src = getDirectImageSrc(p.logo);
    logoImg.style.display = 'block';
  } else {
    logoImg.style.display = 'none';
  }

  const kopImg = document.getElementById('previewSettingKop');
  if (p.kopSurat) {
    kopImg.src = getDirectImageSrc(p.kopSurat);
    kopImg.style.display = 'block';
  } else {
    kopImg.style.display = 'none';
  }
}

function handleSettingLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop();
  processLocalFileToDataUrlAndCloud(file, (finalUrl) => {
    db.pengaturan.logo = finalUrl;
    saveDatabase();
    populatePengaturanForm();
    applySchoolBranding();
  }, `Logo_Sekolah.${ext}`);
}

function handleSettingKopUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop();
  processLocalFileToDataUrlAndCloud(file, (finalUrl) => {
    db.pengaturan.kopSurat = finalUrl;
    saveDatabase();
    populatePengaturanForm();
    applySchoolBranding();
  }, `Kop_Surat.${ext}`);
}

function savePengaturan(e) {
  e.preventDefault();
  db.pengaturan.namaSekolah = document.getElementById('settingNamaSekolah').value;
  db.pengaturan.tahunAjaran = document.getElementById('settingTahunAjaran').value;
  db.pengaturan.kepalaSekolah = document.getElementById('settingKepalaSekolah').value;
  db.pengaturan.alamatSekolah = document.getElementById('settingAlamatSekolah').value;

  let inputUrl = document.getElementById('settingAppsScriptUrl').value.trim();
  if (inputUrl.includes(OLD_APPS_SCRIPT_URL_PATTERN) || inputUrl === '') {
    inputUrl = GOOGLE_SHEETS_WEB_APP_URL;
    document.getElementById('settingAppsScriptUrl').value = inputUrl;
  }
  db.pengaturan.appsScriptUrl = inputUrl;
  db.pengaturan.driveFolderId = document.getElementById('settingDriveFolderId').value;
  
  saveDatabase();
  applySchoolBranding();
  alert('✨ Pengaturan berhasil disimpan & disinkronkan ke Cloud!');
}


































