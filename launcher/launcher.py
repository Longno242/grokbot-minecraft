import os, sys, subprocess, threading, queue, time, json, re, ctypes, urllib.request, urllib.parse
import tkinter as tk
from tkinter import ttk

ROOT = os.path.dirname(sys.executable) if getattr(sys, "frozen", False) else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETTINGS_FILE = os.path.join(ROOT, "settings.json")  # optional: {"player": "YourName", "java": "C:/path/to/java.exe"}
try:
    SETTINGS = json.load(open(SETTINGS_FILE, encoding="utf-8"))
except Exception:
    SETTINGS = {}
SERVER_DIR = os.path.join(ROOT, "server"); BOT_DIR = os.path.join(ROOT, "bot")
def find_java():
    import shutil
    if SETTINGS.get("java"): return SETTINGS["java"]
    if os.environ.get("GROKBOT_JAVA"): return os.environ["GROKBOT_JAVA"]
    if os.environ.get("JAVA_HOME"):
        p = os.path.join(os.environ["JAVA_HOME"], "bin", "java.exe")
        if os.path.exists(p): return p
    return shutil.which("java") or "java"
JAVA = find_java()
USER = SETTINGS.get("player") or os.environ.get("GROKBOT_PLAYER", ""); API = "http://localhost:3001"
NO_WIN = 0x08000000
BUILDS = ["house", "modern simple", "modern normal", "modern advanced", "medieval house", "cabin", "cottage", "castle", "skyscraper 40",
          "lighthouse", "windmill", "bridge 30", "pixel art creeper", "pixel art heart", "statue steve", "ship", "pirate ship", "temple",
          "pagoda", "farm", "village 6", "road 60", "fountain", "garden", "maze 21", "stadium", "rollercoaster", "car red", "plane", "rocket",
          "treehouse", "igloo", "snowman", "giant tree", "waterfall", "canyon", "desert", "mushroom forest", "crystal cave",
          "floating islands", "city 64", "mountain 60", "hill 30", "volcano 40", "island 30", "lake 20", "river 60", "forest 15", "tree cherry"]
BG, PANEL, FG, MUTED, ACC, RED, GREEN, YEL = "#14161b", "#1e2129", "#e6e6e6", "#8a8f98", "#4f8cff", "#e5484d", "#30a46c", "#f5a524"

# ---- Windows job object: children die with this process (no orphans) ----
class JobLimits(ctypes.Structure):
    _fields_ = [("a", ctypes.c_int64), ("b", ctypes.c_int64), ("LimitFlags", ctypes.c_uint32), ("c", ctypes.c_size_t), ("d", ctypes.c_size_t),
                ("e", ctypes.c_uint32), ("f", ctypes.c_size_t), ("g", ctypes.c_uint32), ("h", ctypes.c_uint32)]
class ExtLimits(ctypes.Structure):
    _fields_ = [("basic", JobLimits), ("io", ctypes.c_uint64 * 6), ("pm", ctypes.c_size_t), ("jm", ctypes.c_size_t), ("ppm", ctypes.c_size_t), ("pjm", ctypes.c_size_t)]
k32 = ctypes.windll.kernel32
k32.CreateJobObjectW.restype = ctypes.c_void_p
k32.OpenProcess.restype = ctypes.c_void_p
JOB = k32.CreateJobObjectW(None, None)
_info = ExtLimits(); _info.basic.LimitFlags = 0x2000  # KILL_ON_JOB_CLOSE
k32.SetInformationJobObject(ctypes.c_void_p(JOB), 9, ctypes.byref(_info), ctypes.sizeof(_info))
def attach(proc):
    h = k32.OpenProcess(0x1F0FFF, False, proc.pid)
    if h: k32.AssignProcessToJobObject(ctypes.c_void_p(JOB), ctypes.c_void_p(h)); k32.CloseHandle(ctypes.c_void_p(h))

def http_get(path, timeout=2):
    with urllib.request.urlopen(API + path, timeout=timeout) as r: return r.read().decode("utf-8", "replace")

class App:
    def __init__(self, root):
        self.root = root; self.server = None; self.bot = None; self.q = queue.Queue()
        self.state = "stopped"; self.bot_ok = False; self.players = []; self.stopping = False
        root.title("GrokBot Minecraft"); root.geometry("1100x760"); root.configure(bg=BG); root.minsize(900, 620)
        st = ttk.Style(); st.theme_use("clam")
        st.configure(".", background=BG, foreground=FG, fieldbackground=PANEL, bordercolor=PANEL, font=("Segoe UI", 10))
        st.configure("TNotebook", background=BG, borderwidth=0); st.configure("TNotebook.Tab", background=PANEL, foreground=MUTED, padding=(14, 6))
        st.map("TNotebook.Tab", background=[("selected", ACC)], foreground=[("selected", "white")])
        st.configure("TCombobox", fieldbackground=PANEL, background=PANEL, foreground=FG, arrowcolor=FG)
        root.option_add("*TCombobox*Listbox.background", PANEL); root.option_add("*TCombobox*Listbox.foreground", FG)
        self.build_ui(); root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.root.after(150, self.pump); self.root.after(1000, self.poll)
        threading.Thread(target=self.status_loop, daemon=True).start()
        if "--test" in sys.argv: self.root.after(500, self.self_test)

    def btn(self, parent, text, cmd, bg=PANEL, fg=FG, big=False, w=None):
        b = tk.Button(parent, text=text, command=cmd, bg=bg, fg=fg, activebackground=ACC, activeforeground="white", relief="flat", bd=0,
                      cursor="hand2", font=("Segoe UI Semibold", 16 if big else 10), padx=18 if big else 10, pady=10 if big else 4)
        if w: b.config(width=w)
        return b

    def build_ui(self):
        top = tk.Frame(self.root, bg=BG); top.pack(fill="x", padx=16, pady=(14, 6))
        tk.Label(top, text="GrokBot Minecraft", bg=BG, fg=FG, font=("Segoe UI Semibold", 20)).pack(side="left")
        tk.Label(top, text="  Minecraft 26.1 · creative flat world", bg=BG, fg=MUTED, font=("Segoe UI", 11)).pack(side="left", pady=(8, 0))
        row = tk.Frame(self.root, bg=BG); row.pack(fill="x", padx=16, pady=6)
        self.start_b = self.btn(row, "▶  START", self.start, bg=GREEN, fg="white", big=True); self.start_b.pack(side="left")
        self.stop_b = self.btn(row, "■  STOP", self.stop, bg=RED, fg="white", big=True); self.stop_b.pack(side="left", padx=10)
        stat = tk.Frame(row, bg=PANEL); stat.pack(side="left", fill="both", expand=True, padx=(10, 0))
        self.l_srv = self.indicator(stat, "Server"); self.l_bot = self.indicator(stat, "GrokBot"); self.l_pl = self.indicator(stat, "Players")
        mid = tk.Frame(self.root, bg=BG); mid.pack(fill="x", padx=16, pady=6)
        join = tk.Frame(mid, bg=PANEL, padx=14, pady=10); join.pack(side="left", fill="both")
        tk.Label(join, text="How to join", bg=PANEL, fg=FG, font=("Segoe UI Semibold", 12)).pack(anchor="w")
        for t in ["1. In your launcher create a Vanilla profile for Minecraft 26.1 (not 26.3)",
                  "2. Play → Multiplayer → Direct Connection", "3. Server address:"]:
            tk.Label(join, text=t, bg=PANEL, fg=FG, justify="left").pack(anchor="w")
        a = tk.Frame(join, bg=PANEL); a.pack(anchor="w", pady=(2, 0))
        tk.Label(a, text=" localhost ", bg=BG, fg=ACC, font=("Consolas", 13, "bold")).pack(side="left")
        self.copy_b = self.btn(a, "Copy", self.copy_addr); self.copy_b.pack(side="left", padx=8)
        tk.Label(join, text="Local only (online-mode off) – don't port-forward.", bg=PANEL, fg=MUTED, font=("Segoe UI", 9)).pack(anchor="w", pady=(6, 0))
        ctl = tk.Frame(mid, bg=PANEL, padx=14, pady=10); ctl.pack(side="left", fill="both", expand=True, padx=(10, 0))
        tk.Label(ctl, text=f"Bot commands (as {USER})" if USER else "Bot commands", bg=PANEL, fg=FG, font=("Segoe UI Semibold", 12)).pack(anchor="w")
        q = tk.Frame(ctl, bg=PANEL); q.pack(anchor="w", pady=4)
        for t in ["come", "follow", "stop", "undo", "mode watch", "mode fast", "list"]:
            self.btn(q, t, lambda t=t: self.send_bot(t)).pack(side="left", padx=(0, 6))
        bl = tk.Frame(ctl, bg=PANEL); bl.pack(anchor="w", fill="x", pady=4)
        self.build_var = tk.StringVar(value="castle")
        ttk.Combobox(bl, textvariable=self.build_var, values=BUILDS, width=26).pack(side="left")
        self.btn(bl, "Build", lambda: self.send_bot("build " + self.build_var.get()), bg=ACC, fg="white").pack(side="left", padx=6)
        tk.Label(bl, text="speed", bg=PANEL, fg=MUTED).pack(side="left", padx=(12, 4))
        self.speed = tk.Spinbox(bl, from_=1, to=200, width=5, bg=BG, fg=FG, buttonbackground=PANEL, relief="flat", insertbackground=FG); self.speed.delete(0, "end"); self.speed.insert(0, "8")
        self.speed.pack(side="left"); self.btn(bl, "Set", lambda: self.send_bot("speed " + self.speed.get())).pack(side="left", padx=4)
        cb = tk.Frame(ctl, bg=PANEL); cb.pack(anchor="w", fill="x", pady=4)
        self.cmd = self.entry(cb, "Command for GrokBot, e.g. build skyscraper 60", lambda e: self.send_bot(self.cmd_get(self.cmd)))
        self.btn(cb, "Send", lambda: self.send_bot(self.cmd_get(self.cmd))).pack(side="left", padx=6)
        sc = tk.Frame(ctl, bg=PANEL); sc.pack(anchor="w", fill="x", pady=4)
        self.con = self.entry(sc, "Server console, e.g. op YourName / time set day", lambda e: self.send_server(self.cmd_get(self.con)))
        self.btn(sc, "Run", lambda: self.send_server(self.cmd_get(self.con))).pack(side="left", padx=6)
        nb = ttk.Notebook(self.root); nb.pack(fill="both", expand=True, padx=16, pady=(6, 14))
        self.t_srv = self.logbox(nb); self.t_bot = self.logbox(nb); self.t_app = self.logbox(nb)
        nb.add(self.t_srv.master, text="Server log"); nb.add(self.t_bot.master, text="Bot output"); nb.add(self.t_app.master, text="Launcher")

    def indicator(self, parent, name):
        f = tk.Frame(parent, bg=PANEL, padx=14, pady=8); f.pack(side="left", fill="y")
        tk.Label(f, text=name, bg=PANEL, fg=MUTED, font=("Segoe UI", 9)).pack(anchor="w")
        l = tk.Label(f, text="● stopped", bg=PANEL, fg=MUTED, font=("Segoe UI Semibold", 12)); l.pack(anchor="w"); return l

    def entry(self, parent, hint, on_enter):
        e = tk.Entry(parent, bg=BG, fg=MUTED, insertbackground=FG, relief="flat", font=("Consolas", 11)); e.insert(0, hint); e.hint = hint
        e.bind("<FocusIn>", lambda ev: (e.delete(0, "end"), e.config(fg=FG)) if e.get() == hint else None)
        e.bind("<Return>", on_enter); e.pack(side="left", fill="x", expand=True, ipady=5); return e

    def cmd_get(self, e):
        v = e.get().strip(); 
        if v == e.hint: return ""
        e.delete(0, "end"); return v

    def logbox(self, nb):
        f = tk.Frame(nb, bg=PANEL)
        t = tk.Text(f, bg="#0f1115", fg="#c9d1d9", insertbackground=FG, relief="flat", font=("Consolas", 10), wrap="none", state="disabled")
        s = tk.Scrollbar(f, command=t.yview); t.configure(yscrollcommand=s.set); s.pack(side="right", fill="y"); t.pack(fill="both", expand=True); return t

    def log(self, box, line):
        self.q.put((box, line))

    def pump(self):
        try:
            for _ in range(500):
                box, line = self.q.get_nowait(); t = {"srv": self.t_srv, "bot": self.t_bot, "app": self.t_app}[box]
                end = t.yview()[1] > 0.98
                t.configure(state="normal"); t.insert("end", line.rstrip() + "\n")
                if int(t.index("end-1c").split(".")[0]) > 4000: t.delete("1.0", "500.0")
                t.configure(state="disabled")
                if end: t.see("end")
        except queue.Empty: pass
        self.root.after(150, self.pump)

    def reader(self, proc, box):
        for raw in iter(proc.stdout.readline, b""):
            line = raw.decode("utf-8", "replace"); self.log(box, line)
            if box == "srv": self.parse_server(line)
        self.log("app", f"{'Server' if box == 'srv' else 'Bot'} process exited ({proc.wait()}).")

    def parse_server(self, line):
        if re.search(r"\]: Done \(", line): self.state = "running"
        m = re.search(r"There are (\d+) of a max of \d+ players online:\s*(.*)", line)
        if m: self.players = [p.strip() for p in m.group(2).split(",") if p.strip()]
        m = re.search(r"\]: (\w+) joined the game", line)
        if m and m.group(1) not in self.players: self.players.append(m.group(1))
        m = re.search(r"\]: (\w+) left the game", line)
        if m and m.group(1) in self.players: self.players.remove(m.group(1))

    def kill_stray(self):
        # stop any server/bot not started by us (gracefully if possible)
        try: http_get("/cmd?c=serverstop", 3); self.log("app", "Asked an already running server to stop..."); time.sleep(8)
        except Exception: pass
        ps = ("Get-CimInstance Win32_Process | ?{ ($_.Name -eq 'java.exe' -and $_.CommandLine -like '*server.jar*') -or "
              "($_.Name -eq 'node.exe' -and $_.CommandLine -like '*bot.js*') } | %{ Stop-Process -Id $_.ProcessId -Force; $_.Name }")
        out = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True, creationflags=NO_WIN).stdout.strip()
        if out: self.log("app", "Stopped leftover processes: " + out.replace("\n", ", "))

    def start(self):
        if self.server and self.server.poll() is None: return self.log("app", "Already running.")
        self.state = "starting"; self.players = []
        threading.Thread(target=self._start, daemon=True).start()

    def _start(self):
        try:
            self.kill_stray()
            self.log("app", "Starting server...")
            self.server = subprocess.Popen([JAVA, "-Xmx2G", "-jar", "server.jar", "nogui"], cwd=SERVER_DIR, stdin=subprocess.PIPE,
                                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, creationflags=NO_WIN)
            attach(self.server); threading.Thread(target=self.reader, args=(self.server, "srv"), daemon=True).start()
            t0 = time.time()
            while self.state != "running":
                if self.server.poll() is not None: self.state = "stopped"; return self.log("app", "Server exited during startup - see Server log.")
                if time.time() - t0 > 180: return self.log("app", "Server did not report Done within 3 minutes.")
                time.sleep(0.5)
            self.log("app", f"Server ready in {time.time() - t0:.0f}s. Starting GrokBot...")
            self.bot = subprocess.Popen(["node", "bot.js"], cwd=BOT_DIR, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, creationflags=NO_WIN)
            attach(self.bot); threading.Thread(target=self.reader, args=(self.bot, "bot"), daemon=True).start()
        except Exception as e:
            self.log("app", f"Start failed: {e}"); self.state = "stopped"

    def stop(self, then=None):
        if self.stopping: return
        self.stopping = True
        def run():
            try:
                if self.bot and self.bot.poll() is None:
                    self.log("app", "Stopping GrokBot..."); self.bot.terminate()
                    try: self.bot.wait(5)
                    except Exception: self.bot.kill()
                if self.server and self.server.poll() is None:
                    self.state = "stopping"; self.log("app", "Saving world and stopping server...")
                    self.send_server("stop", quiet=True)
                    try: self.server.wait(60)
                    except Exception: self.log("app", "Server did not stop in 60s - forcing."); self.server.kill()
                self.state = "stopped"; self.players = []; self.log("app", "Stopped.")
            finally:
                self.stopping = False
                if then: self.root.after(0, then)
        threading.Thread(target=run, daemon=True).start()

    def on_close(self):
        if (self.server and self.server.poll() is None) or (self.bot and self.bot.poll() is None):
            self.root.title("GrokBot Minecraft – stopping, please wait..."); self.stop(then=self.root.destroy)
        else: self.root.destroy()

    def send_server(self, text, quiet=False):
        if not text: return
        if not (self.server and self.server.poll() is None): return self.log("app", "Server is not running.")
        try: self.server.stdin.write((text + "\n").encode()); self.server.stdin.flush()
        except Exception as e: return self.log("app", f"Console write failed: {e}")
        if not quiet: self.log("app", f"> {text}")

    def send_bot(self, text):
        if not text: return
        def run():
            try: r = http_get("/cmd?" + urllib.parse.urlencode({"c": text, **({"user": USER} if USER else {})}), 5); self.log("app", f"bot ← {text}  ({r.strip()})")
            except Exception as e: self.log("app", f"Bot not reachable: {e}")
        threading.Thread(target=run, daemon=True).start()

    def copy_addr(self):
        self.root.clipboard_clear(); self.root.clipboard_append("localhost"); self.copy_b.config(text="Copied!"); self.root.after(1500, lambda: self.copy_b.config(text="Copy"))

    def status_loop(self):
        n = 0
        while True:
            try: s = json.loads(http_get("/status", 1.5)); self.bot_ok = s.get("pos") is not None; self.bot_info = s
            except Exception: self.bot_ok = False
            if self.state == "running" and n % 10 == 0: self.send_server("list", quiet=True)
            n += 1; time.sleep(1)

    def poll(self):
        c = {"stopped": (MUTED, "● stopped"), "starting": (YEL, "● starting..."), "running": (GREEN, "● running"), "stopping": (YEL, "● stopping...")}[self.state]
        if self.state == "running" and not (self.server and self.server.poll() is None): self.state = "stopped"
        self.l_srv.config(fg=c[0], text=c[1])
        if self.bot_ok: info = getattr(self, "bot_info", {}); self.l_bot.config(fg=GREEN, text=f"● connected · {info.get('mode', '')}{' · building' if info.get('building') else ''}")
        elif self.bot and self.bot.poll() is None: self.l_bot.config(fg=YEL, text="● connecting...")
        else: self.l_bot.config(fg=MUTED, text="● offline")
        pl = [p for p in self.players if p != "GrokBot"]
        self.l_pl.config(fg=FG if pl else MUTED, text=(", ".join(pl) if pl else "nobody") + ("  (+GrokBot)" if "GrokBot" in self.players else ""))
        self.start_b.config(state="disabled" if self.state in ("starting", "running", "stopping") else "normal")
        self.root.after(1000, self.poll)

    def self_test(self):  # --test: start, wait for bot, stop, write result, exit
        res = os.path.join(ROOT, "launcher", "selftest.txt"); t0 = time.time(); self.start()
        def check():
            if self.bot_ok and "GrokBot" in self.players:
                with open(res, "w") as f: f.write(f"STARTED ok in {time.time() - t0:.0f}s players={self.players}\n")
                self.root.after(3000, lambda: self.stop(then=lambda: (open(res, "a").write(f"STOPPED ok server_exit={self.server.poll()} bot_exit={self.bot.poll()}\n"), self.root.destroy())))
            elif time.time() - t0 > 200:
                with open(res, "w") as f: f.write("TIMEOUT\n")
                self.stop(then=self.root.destroy)
            else: self.root.after(1000, check)
        self.root.after(1000, check)

if __name__ == "__main__":
    root = tk.Tk(); App(root); root.mainloop()
