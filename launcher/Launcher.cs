using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
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
        private Label lblStatus;
        private Button btnOpenBrowser;
        private Button btnStop;
        private Timer checkTimer;
        private bool isServerReady = false;

        public MainForm()
        {
            this.Text = "DM Vault | デュエマ ストレージマネージャー";
            this.Size = new Size(420, 240);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(15, 23, 42); // slate-900

            Label lblTitle = new Label();
            lblTitle.Text = "DM Vault デュエマ管理アプリ";
            lblTitle.Font = new Font("Segoe UI", 13, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(24, 20);
            lblTitle.AutoSize = true;
            this.Controls.Add(lblTitle);

            lblStatus = new Label();
            lblStatus.Text = "サーバーを起動しています...";
            lblStatus.Font = new Font("Segoe UI", 9.5f);
            lblStatus.ForeColor = Color.FromArgb(148, 163, 184); // slate-400
            lblStatus.Location = new Point(25, 56);
            lblStatus.AutoSize = true;
            this.Controls.Add(lblStatus);

            btnOpenBrowser = new Button();
            btnOpenBrowser.Text = "ブラウザでアプリを開く (localhost:3000)";
            btnOpenBrowser.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btnOpenBrowser.BackColor = Color.FromArgb(37, 99, 235); // blue-600
            btnOpenBrowser.ForeColor = Color.White;
            btnOpenBrowser.FlatStyle = FlatStyle.Flat;
            btnOpenBrowser.FlatAppearance.BorderSize = 0;
            btnOpenBrowser.Size = new Size(356, 42);
            btnOpenBrowser.Location = new Point(24, 95);
            btnOpenBrowser.Enabled = false;
            btnOpenBrowser.Cursor = Cursors.Hand;
            btnOpenBrowser.Click += (s, e) => OpenBrowser();
            this.Controls.Add(btnOpenBrowser);

            btnStop = new Button();
            btnStop.Text = "アプリを終了する";
            btnStop.Font = new Font("Segoe UI", 9);
            btnStop.BackColor = Color.FromArgb(30, 41, 59); // slate-800
            btnStop.ForeColor = Color.FromArgb(203, 213, 225);
            btnStop.FlatStyle = FlatStyle.Flat;
            btnStop.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
            btnStop.Size = new Size(356, 34);
            btnStop.Location = new Point(24, 146);
            btnStop.Cursor = Cursors.Hand;
            btnStop.Click += (s, e) => this.Close();
            this.Controls.Add(btnStop);

            this.FormClosing += MainForm_FormClosing;
            this.Shown += MainForm_Shown;
        }

        private void MainForm_Shown(object sender, EventArgs e)
        {
            StartServer();
        }

        private void StartServer()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string nextBin = Path.Combine(baseDir, "node_modules", "next", "dist", "bin", "next");
                string nodePath = FindNodeExe();

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodePath;
                psi.Arguments = string.Format("\"{0}\" start -p 3000", nextBin);
                psi.WorkingDirectory = baseDir;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;

                serverProcess = Process.Start(psi);

                checkTimer = new Timer();
                checkTimer.Interval = 700;
                int attempts = 0;
                checkTimer.Tick += (s, e) =>
                {
                    attempts++;
                    if (IsPortInUse(3000))
                    {
                        checkTimer.Stop();
                        isServerReady = true;
                        lblStatus.Text = "✅ アプリケーション稼働中 (http://localhost:3000)";
                        lblStatus.ForeColor = Color.FromArgb(52, 211, 153); // emerald-400
                        btnOpenBrowser.Enabled = true;
                        btnOpenBrowser.BackColor = Color.FromArgb(37, 99, 235);
                        OpenBrowser();
                    }
                    else if (attempts > 20)
                    {
                        checkTimer.Stop();
                        lblStatus.Text = "⚠️ サーバー起動に時間がかかっています...";
                        btnOpenBrowser.Enabled = true;
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

        private string FindNodeExe()
        {
            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string standard = Path.Combine(programFiles, "nodejs", "node.exe");
            if (File.Exists(standard)) return standard;

            return "node.exe";
        }

        private bool IsPortInUse(int port)
        {
            try
            {
                using (TcpClient tcpClient = new TcpClient())
                {
                    IAsyncResult result = tcpClient.BeginConnect("127.0.0.1", port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(300);
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

        private void OpenBrowser()
        {
            try
            {
                Process.Start(new ProcessStartInfo("http://localhost:3000") { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show("ブラウザを開けませんでした: " + ex.Message);
            }
        }

        private void MainForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            if (checkTimer != null) checkTimer.Stop();
            KillServerProcess();
        }

        private void KillServerProcess()
        {
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
                // ポート3000のプロセスを終了
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c for /f \"tokens=5\" %a in ('netstat -aon ^| find \":3000\"') do taskkill /f /pid %a");
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process.Start(psi);
            }
            catch {}
        }
    }
}

