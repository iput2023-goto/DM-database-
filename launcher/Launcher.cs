using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace DMVaultLauncher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }

    public class MainForm : Form
    {
        private Process serverProcess;
        private Process appWindowProcess;
        private Label lblStatus;
        private Button btnOpenWindow;
        private Button btnStop;
        private Timer checkTimer;
        private Timer windowWatchTimer;
        private NotifyIcon trayIcon;
        private bool isServerReady = false;
        private bool isExiting = false;

        public MainForm()
        {
            this.Text = "DM Vault | デュエマ ストレージマネージャー";
            this.Size = new Size(430, 230);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(15, 23, 42); // slate-900

            Icon appIcon = null;
            try
            {
                appIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (appIcon != null)
                {
                    this.Icon = appIcon;
                    PictureBox picIcon = new PictureBox();
                    picIcon.Image = appIcon.ToBitmap();
                    picIcon.SizeMode = PictureBoxSizeMode.Zoom;
                    picIcon.Size = new Size(36, 36);
                    picIcon.Location = new Point(24, 18);
                    this.Controls.Add(picIcon);
                }
            }
            catch {}

            // システムトレイアイコン（専用ウィンドウ表示中はランチャーを隠してトレイに常駐）
            trayIcon = new NotifyIcon();
            if (appIcon != null) trayIcon.Icon = appIcon;
            trayIcon.Text = "DM Vault デュエマ管理アプリ";
            trayIcon.Visible = true;
            ContextMenu trayMenu = new ContextMenu();
            trayMenu.MenuItems.Add("アプリウィンドウを開く", (s, e) => LaunchDesktopAppWindow());
            trayMenu.MenuItems.Add("コントローラーを表示", (s, e) => ShowControllerWindow());
            trayMenu.MenuItems.Add("-");
            trayMenu.MenuItems.Add("終了する", (s, e) => ExitApp());
            trayIcon.ContextMenu = trayMenu;
            trayIcon.DoubleClick += (s, e) => LaunchDesktopAppWindow();

            Label lblTitle = new Label();
            lblTitle.Text = "DM Vault デュエマ管理アプリ";
            lblTitle.Font = new Font("Yu Gothic UI", 13, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(68, 22);
            lblTitle.AutoSize = true;
            this.Controls.Add(lblTitle);

            lblStatus = new Label();
            lblStatus.Text = "専用アプリウィンドウを準備しています...";
            lblStatus.Font = new Font("Yu Gothic UI", 9.5f);
            lblStatus.ForeColor = Color.FromArgb(148, 163, 184); // slate-400
            lblStatus.Location = new Point(25, 62);
            lblStatus.AutoSize = true;
            this.Controls.Add(lblStatus);

            btnOpenWindow = new Button();
            btnOpenWindow.Text = "専用アプリ画面を開く";
            btnOpenWindow.Font = new Font("Yu Gothic UI", 10f, FontStyle.Bold);
            btnOpenWindow.BackColor = Color.FromArgb(37, 99, 235); // blue-600
            btnOpenWindow.ForeColor = Color.White;
            btnOpenWindow.FlatStyle = FlatStyle.Flat;
            btnOpenWindow.FlatAppearance.BorderSize = 0;
            btnOpenWindow.Size = new Size(366, 42);
            btnOpenWindow.Location = new Point(24, 96);
            btnOpenWindow.Enabled = false;
            btnOpenWindow.Cursor = Cursors.Hand;
            btnOpenWindow.Click += (s, e) => LaunchDesktopAppWindow();
            this.Controls.Add(btnOpenWindow);

            btnStop = new Button();
            btnStop.Text = "アプリを終了する";
            btnStop.Font = new Font("Yu Gothic UI", 9);
            btnStop.BackColor = Color.FromArgb(30, 41, 59); // slate-800
            btnStop.ForeColor = Color.FromArgb(203, 213, 225);
            btnStop.FlatStyle = FlatStyle.Flat;
            btnStop.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
            btnStop.Size = new Size(366, 34);
            btnStop.Location = new Point(24, 146);
            btnStop.Cursor = Cursors.Hand;
            btnStop.Click += (s, e) => ExitApp();
            this.Controls.Add(btnStop);

            this.FormClosing += MainForm_FormClosing;
            this.Shown += MainForm_Shown;
        }

        private async void MainForm_Shown(object sender, EventArgs e)
        {
            await EnsureBuiltAndStartServerAsync();
        }

        private async Task EnsureBuiltAndStartServerAsync()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string nodePath = FindNodeExe();
                string nextBin = Path.Combine(baseDir, "node_modules", "next", "dist", "bin", "next");
                string buildIdPath = Path.Combine(baseDir, ".next", "BUILD_ID");

                // 1. node_modules が無ければ自動インストール
                if (!File.Exists(nextBin))
                {
                    lblStatus.Text = "初回セットアップ中（パッケージを導入しています）...";
                    await Task.Run(() => RunCommandSync("cmd.exe", "/c npm install", baseDir));
                }

                // 2. .next/BUILD_ID が無ければ自動ビルド
                if (!File.Exists(buildIdPath) && File.Exists(nextBin))
                {
                    lblStatus.Text = "初回ビルドを実行しています（約15秒）...";
                    await Task.Run(() => RunCommandSync(nodePath, string.Format("\"{0}\" build", nextBin), baseDir));
                }

                // 既存のポート3000がすでに稼働中ならそのままウィンドウを開く
                if (IsPortInUse(3000))
                {
                    OnServerReady();
                    return;
                }

                lblStatus.Text = "ローカルデータベースサーバーを起動中...";

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodePath;
                psi.Arguments = string.Format("\"{0}\" start -p 3000 -H 0.0.0.0", nextBin);
                psi.WorkingDirectory = baseDir;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;

                serverProcess = Process.Start(psi);

                checkTimer = new Timer();
                checkTimer.Interval = 400;
                int attempts = 0;
                checkTimer.Tick += (s, e) =>
                {
                    attempts++;
                    if (IsPortInUse(3000))
                    {
                        checkTimer.Stop();
                        OnServerReady();
                    }
                    else if (attempts > 40)
                    {
                        checkTimer.Stop();
                        lblStatus.Text = "⚠️ サーバー起動に時間がかかっています...";
                        btnOpenWindow.Enabled = true;
                    }
                };
                checkTimer.Start();
            }
            catch (Exception ex)
            {
                lblStatus.Text = "起動エラー: " + ex.Message;
                lblStatus.ForeColor = Color.FromArgb(248, 113, 113);
            }
        }

        private void OnServerReady()
        {
            isServerReady = true;
            lblStatus.Text = "✅ 専用アプリウィンドウを起動しました";
            lblStatus.ForeColor = Color.FromArgb(52, 211, 153);
            btnOpenWindow.Enabled = true;
            LaunchDesktopAppWindow();
        }

        private void RunCommandSync(string fileName, string arguments, string workingDir)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = fileName;
                psi.Arguments = arguments;
                psi.WorkingDirectory = workingDir;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                using (Process p = Process.Start(psi))
                {
                    if (p != null) p.WaitForExit();
                }
            }
            catch {}
        }

        private string FindNodeExe()
        {
            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string standard = Path.Combine(programFiles, "nodejs", "node.exe");
            if (File.Exists(standard)) return standard;
            return "node.exe";
        }

        private string FindAppHostBrowserExe()
        {
            // Edge (32-bit/64-bit) または Chrome を検索して --app モード（アドレスバー・タブ無しの専用デスクトップウィンドウ）で起動する
            string[] candidates = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe")
            };

            foreach (string path in candidates)
            {
                if (!string.IsNullOrEmpty(path) && File.Exists(path))
                {
                    return path;
                }
            }
            return null;
        }

        private void LaunchDesktopAppWindow()
        {
            try
            {
                string appHostExe = FindAppHostBrowserExe();
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string profileDir = Path.Combine(baseDir, ".desktop_app_profile");

                if (appHostExe != null)
                {
                    // 専用プロファイル＋アプリモードで起動（タブやURLバー無しの完全な独立デスクトップウィンドウ）
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = appHostExe;
                    psi.Arguments = string.Format(
                        "--app=\"http://localhost:3000\" --user-data-dir=\"{0}\" --window-size=1380,900 --no-first-run --no-default-browser-check --disable-features=Translate,msEdgeSidebarV2",
                        profileDir
                    );
                    psi.UseShellExecute = false;
                    appWindowProcess = Process.Start(psi);

                    // ランチャーの小窓は隠して専用アプリウィンドウだけを表示する
                    this.Hide();
                    this.ShowInTaskbar = false;

                    // 専用アプリウィンドウが閉じられたらサーバーも自動停止して完全終了する
                    if (windowWatchTimer != null) windowWatchTimer.Stop();
                    windowWatchTimer = new Timer();
                    windowWatchTimer.Interval = 600;
                    windowWatchTimer.Tick += (s, e) =>
                    {
                        if (appWindowProcess != null && appWindowProcess.HasExited)
                        {
                            windowWatchTimer.Stop();
                            ExitApp();
                        }
                    };
                    windowWatchTimer.Start();
                }
                else
                {
                    Process.Start(new ProcessStartInfo("http://localhost:3000") { UseShellExecute = true });
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("アプリウィンドウを開けませんでした: " + ex.Message);
            }
        }

        private void ShowControllerWindow()
        {
            this.Show();
            this.ShowInTaskbar = true;
            this.WindowState = FormWindowState.Normal;
            this.Activate();
        }

        private bool IsPortInUse(int port)
        {
            try
            {
                using (TcpClient tcpClient = new TcpClient())
                {
                    IAsyncResult result = tcpClient.BeginConnect("127.0.0.1", port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(250);
                    if (success && tcpClient.Connected)
                    {
                        tcpClient.EndConnect(result);
                        return true;
                    }
                    return false;
                }
            }
            catch
            {
                return false;
            }
        }

        private void ExitApp()
        {
            if (isExiting) return;
            isExiting = true;
            if (checkTimer != null) checkTimer.Stop();
            if (windowWatchTimer != null) windowWatchTimer.Stop();
            if (trayIcon != null)
            {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }
            KillServerProcess();
            Application.Exit();
        }

        private void MainForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            ExitApp();
        }

        private void KillServerProcess()
        {
            try
            {
                if (appWindowProcess != null && !appWindowProcess.HasExited)
                {
                    appWindowProcess.CloseMainWindow();
                }
            }
            catch {}

            try
            {
                if (serverProcess != null && !serverProcess.HasExited)
                {
                    serverProcess.Kill();
                }
            }
            catch {}

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c for /f \"tokens=5\" %a in ('netstat -aon ^| find \":3000\"') do taskkill /f /pid %a");
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process.Start(psi);
            }
            catch {}
        }
    }
}
