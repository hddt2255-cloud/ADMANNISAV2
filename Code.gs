/**
 * ======================================================================================
 * SIBOS V1 - GOOGLE APPS SCRIPT BACKEND CLOUD DATABASE
 * ======================================================================================
 * Kode ini digunakan sebagai backend database Google Apps Script (Web App)
 * untuk aplikasi SiBOS V1 (Pengelolaan Dana BOS & Standing Instruction).
 *
 * FITUR UTAMA:
 * 1. Multi-Tenant Database per Sekolah (Berdasarkan NPSN)
 * 2. Sinkronisasi Data Realtime (Bisa diakses dari HP, Tablet, Laptop & Browser lain)
 * 3. Penyimpanan Akun Sekolah, Master RKAS, Belanja Bank, Rincian Perbulan, Saldo Awal
 * 4. Otomatis Membuat Sheet Database jika belum ada
 * 5. Dukungan Upload Gambar/Dokumen (Logo & Kop Surat) ke Google Drive
 *
 * CARA MEMASANG / DEPLOY:
 * 1. Buka https://script.google.com/
 * 2. Klik "New project" (atau buat dari Google Sheets > Extensions > Apps Script)
 * 3. Hapus semua kode default di editor, lalu PASTE SELURUH KODE INI ke Code.gs
 * 4. Klik "Deploy" (di kanan atas) > "New deployment"
 * 5. Pilih Type: "Web app"
 * 6. Set:
 *    - Description: "SiBOS V1 Cloud Database"
 *    - Execute as: "Me" (email Google Anda)
 *    - Who has access: "Anyone" (Siapa saja, agar HP & browser lain bisa akses)
 * 7. Klik "Deploy", lalu Berikan Izin Akses (Authorize Access)
 * 8. Salin "Web app URL" (akhiran /exec) dan tempelkan ke Pengaturan SiBOS V1!
 * ======================================================================================
 */

// NAMA SHEET DALAM SPREADSHEET
var SHEET_ACCOUNTS = "ACCOUNTS";
var SHEET_DATA = "DATA_SEKOLAH";
var SHEET_LOG = "SYNC_LOG";

/**
 * Mendapatkan Spreadsheet Database yang aktif.
 * Jika script berdiri sendiri (standalone), otomatis membuat atau mencari Spreadsheet SiBOS.
 */
function getDatabaseSpreadsheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (e) {}

  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty("SIBOS_SPREADSHEET_ID");
  if (ssId) {
    try {
      return SpreadsheetApp.openById(ssId);
    } catch (e) {}
  }

  // Buat spreadsheet baru di Google Drive jika belum ada
  var newSS = SpreadsheetApp.create("DATABASE_SIBOS_V1_CLOUD");
  props.setProperty("SIBOS_SPREADSHEET_ID", newSS.getId());
  initDatabaseSheets(newSS);
  return newSS;
}

/**
 * Inisialisasi sheet dan header jika belum ada
 */
function initDatabaseSheets(ss) {
  if (!ss) ss = getDatabaseSpreadsheet();

  // 1. Sheet ACCOUNTS
  var sheetAcc = ss.getSheetByName(SHEET_ACCOUNTS);
  if (!sheetAcc) {
    sheetAcc = ss.insertSheet(SHEET_ACCOUNTS);
    sheetAcc.appendRow(["NPSN", "Nama Sekolah", "Kepala Sekolah", "Password", "Terakhir Diperbarui"]);
    sheetAcc.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
    // Akun Demo Standar
    sheetAcc.appendRow(["20231556", "SDIT ANNISA", "Abdul Yakub, S.Ag", "20231556", new Date().toISOString()]);
  }

  // 2. Sheet DATA_SEKOLAH
  var sheetData = ss.getSheetByName(SHEET_DATA);
  if (!sheetData) {
    sheetData = ss.insertSheet(SHEET_DATA);
    sheetData.appendRow(["NPSN", "Tipe Data", "JSON Payload", "Terakhir Diperbarui"]);
    sheetData.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
  }

  // 3. Sheet SYNC_LOG
  var sheetLog = ss.getSheetByName(SHEET_LOG);
  if (!sheetLog) {
    sheetLog = ss.insertSheet(SHEET_LOG);
    sheetLog.appendRow(["Waktu", "NPSN", "Aksi", "Status", "Keterangan"]);
    sheetLog.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#334155").setFontColor("#ffffff");
  }

  // Hapus sheet bawaan "Sheet1" jika ada
  var sheet1 = ss.getSheetByName("Sheet1") || ss.getSheetByName("Sheet 1");
  if (sheet1 && ss.getSheets().length > 1) {
    try { ss.deleteSheet(sheet1); } catch (e) {}
  }
}

/**
 * HELPER: Buat Response JSON dengan header CORS agar bisa diakses dari HP / domain manapun
 */
function createJsonResponse(data) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * ======================================================================================
 * HANDLER GET (doGet)
 * Menangani pengambilan data dari HP, browser lain, atau aplikasi web
 * ======================================================================================
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = params.action || "ping";
    var ss = getDatabaseSpreadsheet();
    initDatabaseSheets(ss);

    // 1. PING / STATUS CEK KONEKSI
    if (action === "ping") {
      return createJsonResponse({
        status: "success",
        message: "SiBOS V1 Apps Script Cloud Database aktif dan siap!",
        timestamp: new Date().toISOString(),
        spreadsheetUrl: ss.getUrl()
      });
    }

    // 2. AMBIL DAFTAR AKUN SEKOLAH
    if (action === "getAccounts") {
      var sheetAcc = ss.getSheetByName(SHEET_ACCOUNTS);
      var rows = sheetAcc.getDataRange().getValues();
      var accounts = [];
      for (var i = 1; i < rows.length; i++) {
        var r = rows[i];
        if (r[0]) {
          accounts.push({
            npsn: String(r[0]),
            namaSekolah: String(r[1] || ""),
            kepalaSekolah: String(r[2] || ""),
            password: String(r[3] || r[0])
          });
        }
      }
      return createJsonResponse({
        status: "success",
        accounts: accounts
      });
    }

    // 3. AMBIL SELURUH DATA RUANG KERJA SEKOLAH (BERDASARKAN NPSN)
    if (action === "getSchoolData") {
      var npsn = params.npsn ? String(params.npsn).trim() : "";
      if (!npsn) {
        return createJsonResponse({ status: "error", message: "Parameter npsn wajib disertakan." });
      }

      var sheetData = ss.getSheetByName(SHEET_DATA);
      var rows = sheetData.getDataRange().getValues();
      var schoolData = {};

      for (var i = 1; i < rows.length; i++) {
        var r = rows[i];
        if (String(r[0]).trim() === npsn) {
          var dataType = String(r[1]).trim();
          var jsonStr = String(r[2] || "");
          try {
            schoolData[dataType] = JSON.parse(jsonStr);
          } catch (err) {
            schoolData[dataType] = jsonStr;
          }
        }
      }

      // Ambil juga profil akun dari sheet ACCOUNTS
      var sheetAcc = ss.getSheetByName(SHEET_ACCOUNTS);
      var accRows = sheetAcc.getDataRange().getValues();
      var account = null;
      for (var j = 1; j < accRows.length; j++) {
        if (String(accRows[j][0]).trim() === npsn) {
          account = {
            npsn: String(accRows[j][0]),
            namaSekolah: String(accRows[j][1]),
            kepalaSekolah: String(accRows[j][2]),
            password: String(accRows[j][3])
          };
          break;
        }
      }

      return createJsonResponse({
        status: "success",
        npsn: npsn,
        account: account,
        data: schoolData
      });
    }

    // 4. AMBIL SEMUA DATA (UNTUK BACKUP / SUPER ADMIN)
    if (action === "getAll") {
      var sheetAcc = ss.getSheetByName(SHEET_ACCOUNTS);
      var accRows = sheetAcc.getDataRange().getValues();
      var accounts = [];
      for (var i = 1; i < accRows.length; i++) {
        if (accRows[i][0]) {
          accounts.push({
            npsn: String(accRows[i][0]),
            namaSekolah: String(accRows[i][1] || ""),
            kepalaSekolah: String(accRows[i][2] || ""),
            password: String(accRows[i][3] || accRows[i][0])
          });
        }
      }

      var sheetData = ss.getSheetByName(SHEET_DATA);
      var dataRows = sheetData.getDataRange().getValues();
      var allDataByNpsn = {};
      for (var k = 1; k < dataRows.length; k++) {
        var rNpsn = String(dataRows[k][0]).trim();
        var rType = String(dataRows[k][1]).trim();
        var rVal = String(dataRows[k][2] || "");
        if (rNpsn) {
          if (!allDataByNpsn[rNpsn]) allDataByNpsn[rNpsn] = {};
          try {
            allDataByNpsn[rNpsn][rType] = JSON.parse(rVal);
          } catch (e) {
            allDataByNpsn[rNpsn][rType] = rVal;
          }
        }
      }

      return createJsonResponse({
        status: "success",
        accounts: accounts,
        allData: allDataByNpsn
      });
    }

    return createJsonResponse({ status: "error", message: "Aksi tidak dikenali: " + action });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString(),
      stack: error.stack
    });
  }
}

/**
 * ======================================================================================
 * HANDLER POST (doPost)
 * Menangani penyimpanan dan sinkronisasi data dari aplikasi SiBOS
 * ======================================================================================
 */
function doPost(e) {
  try {
    var ss = getDatabaseSpreadsheet();
    initDatabaseSheets(ss);

    var rawContent = "";
    if (e && e.postData && e.postData.contents) {
      rawContent = e.postData.contents;
    }

    var payload = {};
    if (rawContent) {
      try {
        payload = JSON.parse(rawContent);
      } catch (err) {
        // Coba baca dari form urlencoded jika bukan JSON murni
        payload = (e && e.parameter) ? e.parameter : {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    var action = payload.action || "syncSchool";

    // 1. SINKRONISASI SELURUH DATA SEKOLAH (MASTER RKAS, PERBULAN, BELANJA, HEADER, DLL)
    if (action === "syncSchool") {
      var npsn = payload.npsn ? String(payload.npsn).trim() : "";
      if (!npsn) {
        return createJsonResponse({ status: "error", message: "NPSN wajib disertakan untuk sinkronisasi." });
      }

      var dataToSave = payload.data || {};
      var sheetData = ss.getSheetByName(SHEET_DATA);
      var rows = sheetData.getDataRange().getValues();
      var nowStr = new Date().toISOString();

      // Buat map indeks baris yang sudah ada: npsn + "_" + dataType -> rowIndex (1-based)
      var rowIndexMap = {};
      for (var i = 1; i < rows.length; i++) {
        var key = String(rows[i][0]).trim() + "_" + String(rows[i][1]).trim();
        rowIndexMap[key] = i + 1; // 1-based row index di sheet
      }

      // Simpan setiap item data
      for (var dataType in dataToSave) {
        var itemVal = dataToSave[dataType];
        var jsonStr = (typeof itemVal === "string") ? itemVal : JSON.stringify(itemVal);
        var mapKey = npsn + "_" + dataType;

        if (rowIndexMap[mapKey]) {
          var targetRow = rowIndexMap[mapKey];
          sheetData.getRange(targetRow, 3).setValue(jsonStr);
          sheetData.getRange(targetRow, 4).setValue(nowStr);
        } else {
          sheetData.appendRow([npsn, dataType, jsonStr, nowStr]);
          rowIndexMap[mapKey] = sheetData.getLastRow();
        }
      }

      // Catat log
      logSync(ss, npsn, "syncSchool", "success", "Sinkronisasi " + Object.keys(dataToSave).length + " kategori data.");

      return createJsonResponse({
        status: "success",
        message: "Data sekolah " + npsn + " berhasil disimpan ke Cloud Google!",
        npsn: npsn,
        timestamp: nowStr
      });
    }

    // 2. SIMPAN / UPDATE DAFTAR AKUN SEKOLAH
    if (action === "syncAccounts") {
      var accounts = payload.accounts || [];
      if (!Array.isArray(accounts)) accounts = [];

      var sheetAcc = ss.getSheetByName(SHEET_ACCOUNTS);
      // Hapus data lama (mulai baris 2)
      var lastRow = sheetAcc.getLastRow();
      if (lastRow > 1) {
        sheetAcc.getRange(2, 1, lastRow - 1, 5).clearContent();
      }

      var nowStr = new Date().toISOString();
      accounts.forEach(function(acc) {
        sheetAcc.appendRow([
          String(acc.npsn),
          String(acc.namaSekolah || ""),
          String(acc.kepalaSekolah || ""),
          String(acc.password || acc.npsn),
          nowStr
        ]);
      });

      return createJsonResponse({
        status: "success",
        message: "Daftar " + accounts.length + " akun sekolah berhasil diperbarui di Cloud!",
        count: accounts.length
      });
    }

    // 3. REGISTRASI SEKOLAH BARU DI CLOUD
    if (action === "registerSchool") {
      var npsn = String(payload.npsn || "").trim();
      var namaSekolah = String(payload.namaSekolah || "").trim();
      var kepalaSekolah = String(payload.kepalaSekolah || "").trim();
      var password = String(payload.password || npsn).trim();

      if (!npsn || !namaSekolah) {
        return createJsonResponse({ status: "error", message: "NPSN dan Nama Sekolah wajib diisi." });
      }

      var sheetAcc = ss.getSheetByName(SHEET_ACCOUNTS);
      var rows = sheetAcc.getDataRange().getValues();
      var found = false;
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === npsn) {
          found = true;
          sheetAcc.getRange(i + 1, 2).setValue(namaSekolah);
          sheetAcc.getRange(i + 1, 3).setValue(kepalaSekolah);
          sheetAcc.getRange(i + 1, 4).setValue(password);
          sheetAcc.getRange(i + 1, 5).setValue(new Date().toISOString());
          break;
        }
      }

      if (!found) {
        sheetAcc.appendRow([npsn, namaSekolah, kepalaSekolah, password, new Date().toISOString()]);
      }

      logSync(ss, npsn, "registerSchool", "success", "Registrasi sekolah baru: " + namaSekolah);

      return createJsonResponse({
        status: "success",
        message: "Sekolah " + namaSekolah + " berhasil didaftarkan di Cloud!",
        account: { npsn: npsn, namaSekolah: namaSekolah, kepalaSekolah: kepalaSekolah, password: password }
      });
    }

    // 4. UBAH PASSWORD SEKOLAH DI CLOUD
    if (action === "updatePassword") {
      var npsn = String(payload.npsn || "").trim();
      var newPassword = String(payload.newPassword || "").trim();

      if (!npsn || !newPassword) {
        return createJsonResponse({ status: "error", message: "NPSN dan Password baru wajib disertakan." });
      }

      var sheetAcc = ss.getSheetByName(SHEET_ACCOUNTS);
      var rows = sheetAcc.getDataRange().getValues();
      var updated = false;

      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === npsn) {
          sheetAcc.getRange(i + 1, 4).setValue(newPassword);
          sheetAcc.getRange(i + 1, 5).setValue(new Date().toISOString());
          updated = true;
          break;
        }
      }

      if (!updated) {
        return createJsonResponse({ status: "error", message: "Sekolah dengan NPSN " + npsn + " tidak ditemukan." });
      }

      logSync(ss, npsn, "updatePassword", "success", "Password berhasil diubah.");

      return createJsonResponse({
        status: "success",
        message: "Password sekolah " + npsn + " berhasil diperbarui di Cloud!"
      });
    }

    // 5. UPLOAD FILE GAMBAR (LOGO / KOP SURAT) KE GOOGLE DRIVE
    if (action === "uploadFile") {
      var base64Data = payload.base64Data || "";
      var fileName = payload.fileName || ("upload_" + Date.now() + ".png");
      var mimeType = payload.mimeType || "image/png";
      var folderId = payload.folderId || "";

      if (!base64Data) {
        return createJsonResponse({ status: "error", message: "base64Data file wajib disertakan." });
      }

      // Bersihkan data url jika ada prefix data:image/...;base64,
      if (base64Data.indexOf(",") > -1) {
        base64Data = base64Data.split(",")[1];
      }

      var decodedBytes = Utilities.base64Decode(base64Data);
      var blob = Utilities.newBlob(decodedBytes, mimeType, fileName);

      var folder;
      if (folderId) {
        try {
          folder = DriveApp.getFolderById(folderId);
        } catch (e) {
          folder = DriveApp.getRootFolder();
        }
      } else {
        // Buat folder khusus "SiBOS V1 Uploads" di Google Drive jika belum ada
        var folders = DriveApp.getFoldersByName("SiBOS V1 Uploads");
        if (folders.hasNext()) {
          folder = folders.next();
        } else {
          folder = DriveApp.createFolder("SiBOS V1 Uploads");
        }
      }

      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var fileUrl = file.getUrl();
      var directDownloadUrl = "https://lh3.googleusercontent.com/d/" + file.getId();

      return createJsonResponse({
        status: "success",
        message: "File berhasil diunggah ke Google Drive!",
        fileId: file.getId(),
        fileUrl: directDownloadUrl,
        driveLink: fileUrl
      });
    }

    return createJsonResponse({ status: "error", message: "Aksi POST tidak dikenali: " + action });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString(),
      stack: error.stack
    });
  }
}

/**
 * HELPER: Mencatat aktivitas sinkronisasi ke sheet SYNC_LOG
 */
function logSync(ss, npsn, aksi, status, keterangan) {
  try {
    var sheetLog = ss.getSheetByName(SHEET_LOG);
    if (sheetLog) {
      sheetLog.appendRow([new Date().toISOString(), npsn, aksi, status, keterangan]);
    }
  } catch (e) {}
}
