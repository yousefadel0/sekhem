using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Per-user desktop host for the existing worker. It never issues execution permits.
internal sealed class RuntimeHost : Form {
    private readonly string install = AppDomain.CurrentDomain.BaseDirectory;
    private readonly string stateDirectory;
    private readonly Profile profile;
    private readonly NotifyIcon tray = new NotifyIcon();
    private readonly Label status = new Label();
    private readonly TextBox pairing = new TextBox();
    private readonly Button pair = new Button(), start = new Button(), stop = new Button();
    private Process worker;
    private ProcessJob job;
    private bool quitting;
    private readonly System.Windows.Forms.Timer watchdog = new System.Windows.Forms.Timer();
    private DateTime lastConnected = DateTime.MinValue;
    public class Profile { public string runtimeUrl { get; set; } public string webUrl { get; set; } public string caFile { get; set; } public string version { get; set; } }

    [STAThread] public static int Main(string[] args) {
        if (args.Length == 1 && args[0] == "--version") return 0;
        string state = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SEKHEM", "trusted-runtime");
        if (args.Length == 2 && args[0] == "--state") state = Path.GetFullPath(args[1]);
        bool created;
        string mutexName = "Local\\SEKHEM.Runtime." + Convert.ToBase64String(System.Security.Cryptography.SHA256.Create().ComputeHash(Encoding.UTF8.GetBytes(state))).Replace("/", "_");
        using (var single = new Mutex(true, mutexName, out created)) {
            if (!created) { MessageBox.Show("SEKHEM Runtime is already running. Open it from the notification area."); return 0; }
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
            try { Application.Run(new RuntimeHost(state)); return 0; }
            catch { MessageBox.Show("Runtime configuration is unavailable or invalid. Reinstall from your SEKHEM administrator.", "SEKHEM Runtime"); return 1; }
        }
    }
    private RuntimeHost(string state) {
        stateDirectory = state;
        profile = new JavaScriptSerializer().Deserialize<Profile>(File.ReadAllText(Path.Combine(install, "connection.json")));
        Uri endpoint, web;
        if (profile == null || !Uri.TryCreate(profile.runtimeUrl, UriKind.Absolute, out endpoint) || endpoint.Scheme != "https" || endpoint.UserInfo != "" || endpoint.Query != "" || endpoint.AbsolutePath != "/" ||
            !Uri.TryCreate(profile.webUrl, UriKind.Absolute, out web) || (web.Scheme != "https" && !(web.Scheme == "http" && web.IsLoopback)) || web.UserInfo != "") throw new InvalidDataException();
        if (!String.IsNullOrEmpty(profile.caFile) && (profile.caFile != Path.GetFileName(profile.caFile) || !File.Exists(Path.Combine(install, profile.caFile)))) throw new InvalidDataException();
        Text = "SEKHEM Runtime"; ClientSize = new Size(570, 350); FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false;
        var title = new Label { Text = "Your computer, connected to SEKHEM", Location = new Point(22, 20), AutoSize = true, Font = new Font("Segoe UI", 14) };
        status.SetBounds(22, 62, 520, 45); status.Text = "Disconnected";
        var explanation = new Label { Text = "Connect this computer once in SEKHEM Settings. File access still needs\nyour approval. This trusted Runtime uses your Windows account's access.", Location = new Point(22, 112), Size = new Size(520, 45) };
        pairing.SetBounds(22, 167, 380, 28); pairing.ReadOnly = true; pairing.AccessibleName = "Runtime pairing code";
        var copy = new Button { Text = "Copy code", Location = new Point(412, 165), Size = new Size(120, 30) };
        copy.Click += delegate { if (Regex.IsMatch(pairing.Text, "^[a-f0-9]{24}$")) Clipboard.SetText(pairing.Text); };
        pair.Text = "Pair computer"; pair.SetBounds(22, 207, 150, 34); pair.Click += delegate { Launch(true); };
        start.Text = "Connect"; start.SetBounds(185, 207, 150, 34); start.Click += delegate { Launch(false); };
        stop.Text = "Disconnect"; stop.SetBounds(348, 207, 150, 34); stop.Click += delegate { StopWorker(); UpdateStatus("Disconnected by you. Operations are not replayed."); };
        var open = new Button { Text = "Open SEKHEM", Location = new Point(22, 255), Size = new Size(150, 32) };
        open.Click += delegate { Process.Start(new ProcessStartInfo(profile.webUrl) { UseShellExecute = true }); };
        var version = new Label { Text = "Runtime " + profile.version + " · Node 24.21.0 · TLS verified", Location = new Point(22, 304), AutoSize = true };
        Controls.AddRange(new Control[] { title, status, explanation, pairing, copy, pair, start, stop, open, version });
        tray.Icon = SystemIcons.Application; tray.Text = "SEKHEM Runtime"; tray.Visible = true;
        var menu = new ContextMenuStrip(); menu.Items.Add("Open Runtime", null, delegate { Show(); WindowState = FormWindowState.Normal; Activate(); });
        menu.Items.Add("Connect", null, delegate { Launch(false); }); menu.Items.Add("Disconnect", null, delegate { StopWorker(); UpdateStatus("Disconnected by you."); });
        menu.Items.Add("Exit", null, delegate { quitting = true; Close(); }); tray.ContextMenuStrip = menu;
        tray.DoubleClick += delegate { Show(); Activate(); };
        FormClosing += delegate(object sender, FormClosingEventArgs e) { if (!quitting && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); } else { watchdog.Stop(); StopWorker(); tray.Dispose(); } };
        watchdog.Interval = 2000; watchdog.Tick += delegate { if (worker != null && !worker.HasExited && lastConnected != DateTime.MinValue && DateTime.UtcNow - lastConnected > TimeSpan.FromSeconds(45)) UpdateStatus("Connection unavailable. Waiting for the existing connection to recover."); }; watchdog.Start();
        Shown += delegate { if (File.Exists(Path.Combine(stateDirectory, "identity.json"))) Launch(false); else UpdateStatus("Pair this computer, enroll the code in SEKHEM Settings, then Connect."); };
    }
    private void UpdateStatus(string message) { status.Text = message; tray.Text = message.StartsWith("Connected") ? "SEKHEM Runtime — Connected" : "SEKHEM Runtime — Disconnected"; }
    private void Ui(Action action) { if (!IsDisposed && IsHandleCreated) try { BeginInvoke(action); } catch (InvalidOperationException) { } }
    private static string Quote(string value) { if (value.Contains("\"") || value.Contains("\n") || value.Contains("\r")) throw new InvalidDataException(); return "\"" + value.TrimEnd('\\') + "\""; }
    private void Launch(bool pairingOnly) {
        if (worker != null && !worker.HasExited) { UpdateStatus("Disconnect before pairing or reconnecting."); return; }
        StopWorker(); lastConnected = DateTime.MinValue;
        var arguments = Quote(Path.Combine(install, "runtime-client.cjs")) + " --url " + Quote(profile.runtimeUrl) + " --state " + Quote(stateDirectory) + " --native-helper " + Quote(Path.Combine(install, "SekhemFolderPicker.exe"));
        if (!String.IsNullOrEmpty(profile.caFile)) arguments += " --ca " + Quote(Path.Combine(install, profile.caFile));
        if (pairingOnly) arguments += " --pair-only";
        var child = new Process { StartInfo = new ProcessStartInfo(Path.Combine(install, "node.exe"), arguments) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = install, RedirectStandardOutput = true, RedirectStandardError = true }, EnableRaisingEvents = true };
        child.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data == null) return; string line = e.Data;
            Ui(delegate { if (worker != child) return;
                if (line.StartsWith("Pairing code: ")) { pairing.Text = line.Substring(14); UpdateStatus("Pairing code ready (10 minutes). Enroll in SEKHEM Settings, then Connect."); }
                if (line.StartsWith("Connected:") || line == "Runtime heartbeat: connected") { lastConnected = DateTime.UtcNow; UpdateStatus("Connected. Workspace operations require your authorization."); }
            });
        };
        child.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) Ui(delegate { if (worker == child) UpdateStatus("Connection unavailable. Check SEKHEM and the computer's enrollment."); }); };
        child.Exited += delegate { Ui(delegate { if (worker != child) return; pair.Enabled = start.Enabled = true; stop.Enabled = false;
            if (!pairingOnly) UpdateStatus("Stopped. Connection or identity was rejected. Reconnect explicitly after resolving it."); }); };
        try { job = new ProcessJob(); worker = child; child.Start(); job.Add(child); child.BeginOutputReadLine(); child.BeginErrorReadLine(); pair.Enabled = start.Enabled = false; stop.Enabled = true; UpdateStatus(pairingOnly ? "Preparing a pairing code…" : "Connecting…"); }
        catch { StopWorker(); UpdateStatus("Runtime could not start. Check installation and connection settings."); }
    }
    private void StopWorker() {
        var child = worker; worker = null;
        if (job != null) { job.Dispose(); job = null; }
        if (child != null) { try { if (!child.HasExited) { child.Kill(); child.WaitForExit(5000); } } catch (InvalidOperationException) { } child.Dispose(); }
        pair.Enabled = start.Enabled = true; stop.Enabled = false; lastConnected = DateTime.MinValue;
    }
}

// Closing the host/job terminates only its own worker and descendants, including an open picker.
internal sealed class ProcessJob : IDisposable {
    private IntPtr handle;
    [StructLayout(LayoutKind.Sequential)] private struct Basic { public long PerProcessTime, PerJobTime; public uint Flags; public UIntPtr Min, Max; public uint Active; public UIntPtr Affinity; public uint Priority, Scheduling; }
    [StructLayout(LayoutKind.Sequential)] private struct Io { public ulong ReadOp, WriteOp, OtherOp, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] private struct Extended { public Basic Basic; public Io Io; public UIntPtr ProcessMemory, JobMemory, PeakProcess, PeakJob; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll")] private static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref Extended info, uint size);
    [DllImport("kernel32.dll")] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    public ProcessJob() { handle = CreateJobObject(IntPtr.Zero, null); var info = new Extended(); info.Basic.Flags = 0x2000;
        if (handle == IntPtr.Zero || !SetInformationJobObject(handle, 9, ref info, (uint)Marshal.SizeOf(typeof(Extended)))) { Dispose(); throw new InvalidOperationException(); } }
    public void Add(Process p) { if (!AssignProcessToJobObject(handle, p.Handle)) throw new InvalidOperationException(); }
    public void Dispose() { if (handle != IntPtr.Zero) { CloseHandle(handle); handle = IntPtr.Zero; } }
}
