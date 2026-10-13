import os
import sys
import shutil
import time
import subprocess
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

def get_bundle_dir():
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

class SiBosInstallerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Wizard Instalasi SiBos V1 - Pengelolaan BOS & RKAS")
        self.root.geometry("640x460")
        self.root.resizable(False, False)

        bundle_dir = get_bundle_dir()
        icon_path = os.path.join(bundle_dir, 'sibos_icon.ico')
        if os.path.exists(icon_path):
            try:
                self.root.iconbitmap(icon_path)
            except Exception:
                pass

        self.target_dir = tk.StringVar(value=r"C:\SiBos")
        self.create_desktop_shortcut = tk.BooleanVar(value=True)
        self.create_startmenu_shortcut = tk.BooleanVar(value=True)
        self.launch_after_install = tk.BooleanVar(value=True)

        self.setup_ui()

    def setup_ui(self):
        # Header Frame
        header_frame = tk.Frame(self.root, bg="#0f172a", height=80)
        header_frame.pack(fill="x", side="top")
        header_frame.pack_propagate(False)

        title_lbl = tk.Label(
            header_frame, 
            text="Wizard Instalasi SiBos SDIT ANNISA", 
            font=("Segoe UI", 16, "bold"), 
            fg="#ffffff", 
            bg="#0f172a"
        )
        title_lbl.pack(anchor="w", padx=25, pady=(15, 2))

        subtitle_lbl = tk.Label(
            header_frame, 
            text="Instalasi Aplikasi Management BOS & Standing Instruction", 
            font=("Segoe UI", 10), 
            fg="#94a3b8", 
            bg="#0f172a"
        )
        subtitle_lbl.pack(anchor="w", padx=25)

        # Main Container
        self.main_frame = tk.Frame(self.root, bg="#f8fafc", padx=25, pady=20)
        self.main_frame.pack(fill="both", expand=True)

        # Page 1: Configuration
        self.page1 = tk.Frame(self.main_frame, bg="#f8fafc")
        self.page1.pack(fill="both", expand=True)

        desc_lbl = tk.Label(
            self.page1,
            text="Selamat datang di Wizard Instalasi SiBos.\n"
                 "Aplikasi akan diinstal ke komputer Anda pada lokasi folder di bawah ini:",
            font=("Segoe UI", 10),
            justify="left",
            bg="#f8fafc",
            fg="#334155"
        )
        desc_lbl.pack(anchor="w", pady=(0, 15))

        # Folder selector box
        folder_frame = tk.LabelFrame(self.page1, text=" Folder Tujuan Instalasi ", font=("Segoe UI", 9, "bold"), bg="#f8fafc", fg="#0f172a", padx=15, pady=12)
        folder_frame.pack(fill="x", pady=(0, 15))

        entry_path = tk.Entry(folder_frame, textvariable=self.target_dir, font=("Segoe UI", 10), bd=1, relief="solid")
        entry_path.pack(side="left", fill="x", expand=True, ipady=4, padx=(0, 10))

        btn_browse = tk.Button(folder_frame, text="Jelajahi...", font=("Segoe UI", 9), command=self.browse_folder, width=10)
        btn_browse.pack(side="right")

        # Options box
        options_frame = tk.LabelFrame(self.page1, text=" Opsi Tambahan ", font=("Segoe UI", 9, "bold"), bg="#f8fafc", fg="#0f172a", padx=15, pady=10)
        options_frame.pack(fill="x", pady=(0, 15))

        chk1 = tk.Checkbutton(options_frame, text="Buat Ikon Pintasan di Desktop", variable=self.create_desktop_shortcut, font=("Segoe UI", 9.5), bg="#f8fafc", anchor="w")
        chk1.pack(fill="x", pady=2)

        chk2 = tk.Checkbutton(options_frame, text="Buat Pintasan di Start Menu Windows", variable=self.create_startmenu_shortcut, font=("Segoe UI", 9.5), bg="#f8fafc", anchor="w")
        chk2.pack(fill="x", pady=2)

        chk3 = tk.Checkbutton(options_frame, text="Jalankan Aplikasi SiBos setelah instalasi selesai", variable=self.launch_after_install, font=("Segoe UI", 9.5), bg="#f8fafc", anchor="w")
        chk3.pack(fill="x", pady=2)

        # Footer Frame / Buttons
        footer_frame = tk.Frame(self.root, bg="#e2e8f0", height=60, padx=25)
        footer_frame.pack(fill="x", side="bottom")
        footer_frame.pack_propagate(False)

        self.btn_install = tk.Button(
            footer_frame, 
            text="   Instal Sekarang   ", 
            font=("Segoe UI", 10, "bold"), 
            bg="#2563eb", 
            fg="#ffffff", 
            activebackground="#1d4ed8", 
            activeforeground="#ffffff",
            bd=0, 
            pady=6,
            cursor="hand2",
            command=self.start_installation
        )
        self.btn_install.pack(side="right", pady=12)

        self.btn_cancel = tk.Button(
            footer_frame, 
            text="  Batal  ", 
            font=("Segoe UI", 10), 
            command=self.root.quit,
            pady=6
        )
        self.btn_cancel.pack(side="right", padx=10, pady=12)

        # Page 2: Progress Frame (hidden initially)
        self.page2 = tk.Frame(self.main_frame, bg="#f8fafc")

        self.status_lbl = tk.Label(self.page2, text="Mempersiapkan instalasi...", font=("Segoe UI", 10, "bold"), bg="#f8fafc", fg="#0f172a", anchor="w")
        self.status_lbl.pack(fill="x", pady=(30, 10))

        self.progress = ttk.Progressbar(self.page2, mode="determinate", length=540)
        self.progress.pack(fill="x", pady=(0, 15))

        self.detail_lbl = tk.Label(self.page2, text="", font=("Segoe UI", 9), bg="#f8fafc", fg="#64748b", anchor="w")
        self.detail_lbl.pack(fill="x")

    def browse_folder(self):
        chosen = filedialog.askdirectory(title="Pilih Folder Instalasi SiBos", initialdir=self.target_dir.get())
        if chosen:
            self.target_dir.set(os.path.abspath(chosen))

    def start_installation(self):
        self.page1.pack_forget()
        self.page2.pack(fill="both", expand=True)
        self.btn_install.config(state="disabled")
        self.btn_cancel.config(state="disabled")

        threading.Thread(target=self.run_install_process, daemon=True).start()

    def update_progress(self, val, status_text, detail_text):
        self.progress["value"] = val
        self.status_lbl.config(text=status_text)
        self.detail_lbl.config(text=detail_text)
        self.root.update_idletasks()

    def run_install_process(self):
        try:
            target = self.target_dir.get().strip()
            if not target:
                target = r"C:\SiBos"

            self.update_progress(10, "Membuat folder instalasi...", target)
            os.makedirs(target, exist_ok=True)
            time.sleep(0.3)

            data_dir = os.path.join(target, "data")
            os.makedirs(data_dir, exist_ok=True)

            bundle_dir = get_bundle_dir()

            # Copy SiBos.exe
            self.update_progress(30, "Menyalin berkas utama SiBos.exe...", os.path.join(target, "SiBos.exe"))
            src_exe = os.path.join(bundle_dir, "SiBos.exe")
            dest_exe = os.path.join(target, "SiBos.exe")
            if os.path.exists(src_exe):
                shutil.copy2(src_exe, dest_exe)
            time.sleep(0.3)

            # Copy icon
            self.update_progress(50, "Menyalin ikon aplikasi...", os.path.join(target, "sibos_icon.ico"))
            src_ico = os.path.join(bundle_dir, "sibos_icon.ico")
            dest_ico = os.path.join(target, "sibos_icon.ico")
            if os.path.exists(src_ico):
                shutil.copy2(src_ico, dest_ico)
            time.sleep(0.3)

            # Create Desktop Shortcut
            if self.create_desktop_shortcut.get():
                self.update_progress(70, "Membuat ikon pintasan di Desktop...", "SiBos.lnk")
                desktop_folder = os.path.join(os.path.expanduser("~"), "Desktop")
                shortcut_path = os.path.join(desktop_folder, "SiBos.lnk")
                self.make_shortcut(shortcut_path, dest_exe, target, dest_ico)
                time.sleep(0.3)

            # Create Start Menu Shortcut
            if self.create_startmenu_shortcut.get():
                self.update_progress(85, "Membuat pintasan di Start Menu...", "SiBos.lnk")
                startmenu_folder = os.path.join(os.getenv("APPDATA"), r"Microsoft\Windows\Start Menu\Programs")
                shortcut_path = os.path.join(startmenu_folder, "SiBos.lnk")
                self.make_shortcut(shortcut_path, dest_exe, target, dest_ico)
                time.sleep(0.3)

            self.update_progress(100, "Instalasi Berhasil Diselesaikan!", "SiBos telah terpasang di " + target)
            time.sleep(0.5)

            self.root.after(0, self.finish_installation)

        except Exception as e:
            self.root.after(0, lambda: messagebox.showerror("Gagal Instalasi", f"Terjadi kesalahan saat instalasi:\n{e}"))

    def make_shortcut(self, shortcut_path, target_exe, work_dir, icon_path):
        ps_exe = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
        if not os.path.exists(ps_exe):
            ps_exe = "powershell"

        ps_script = f"""
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('{shortcut_path}')
$Shortcut.TargetPath = '{target_exe}'
$Shortcut.WorkingDirectory = '{work_dir}'
$Shortcut.IconLocation = '{icon_path},0'
$Shortcut.Description = 'SiBos — Management BOS SDIT ANNISA'
$Shortcut.Save()
"""
        cmd = [ps_exe, "-Command", ps_script]
        subprocess.run(
            cmd, 
            capture_output=True, 
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )

    def finish_installation(self):
        self.status_lbl.config(text="🎉 Selamat! SiBos Berhasil Terpasang.", fg="#16a34a")
        self.detail_lbl.config(text="Aplikasi siap digunakan di komputer Anda.")
        
        target_exe = os.path.join(self.target_dir.get().strip(), "SiBos.exe")

        self.btn_install.config(
            text="  Selesai & Buka SiBos  " if self.launch_after_install.get() else "  Selesai  ",
            state="normal",
            bg="#16a34a",
            command=lambda: self.close_and_launch(target_exe)
        )
        self.btn_cancel.pack_forget()

    def close_and_launch(self, target_exe):
        if self.launch_after_install.get() and os.path.exists(target_exe):
            subprocess.Popen([target_exe], cwd=os.path.dirname(target_exe))
        self.root.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    app = SiBosInstallerApp(root)
    root.mainloop()
