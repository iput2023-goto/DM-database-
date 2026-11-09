using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;

class GenerateIcon
{
    static GraphicsPath RoundedRect(RectangleF bounds, float radius)
    {
        float d = radius * 2f;
        GraphicsPath path = new GraphicsPath();
        path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
        path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
        path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
        path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    static Bitmap RenderIconBitmap(int size)
    {
        Bitmap bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            g.Clear(Color.Transparent);

            float s = size / 256f;

            // 角丸ベース背景
            RectangleF bgRect = new RectangleF(10 * s, 10 * s, 236 * s, 236 * s);
            using (GraphicsPath bgPath = RoundedRect(bgRect, 50 * s))
            using (LinearGradientBrush bgBrush = new LinearGradientBrush(
                bgRect,
                Color.FromArgb(15, 23, 42),
                Color.FromArgb(30, 27, 75),
                LinearGradientMode.ForwardDiagonal))
            using (LinearGradientBrush goldBrush = new LinearGradientBrush(
                bgRect,
                Color.FromArgb(253, 224, 71),
                Color.FromArgb(180, 83, 9),
                LinearGradientMode.ForwardDiagonal))
            using (Pen goldPen = new Pen(goldBrush, Math.Max(1.5f, 7f * s)))
            {
                g.FillPath(bgBrush, bgPath);
                g.DrawPath(goldPen, bgPath);
            }

            // 背面カード（左傾き）
            GraphicsState st1 = g.Save();
            g.TranslateTransform(128 * s, 132 * s);
            g.RotateTransform(-12f);
            g.TranslateTransform(-128 * s, -132 * s);
            RectangleF backCard = new RectangleF(80 * s, 60 * s, 92 * s, 130 * s);
            using (GraphicsPath bcPath = RoundedRect(backCard, 12 * s))
            using (SolidBrush bcFill = new SolidBrush(Color.FromArgb(30, 41, 59)))
            using (Pen bcPen = new Pen(Color.FromArgb(100, 116, 139), Math.Max(1f, 3.5f * s)))
            {
                g.FillPath(bcFill, bcPath);
                g.DrawPath(bcPen, bcPath);
            }
            g.Restore(st1);

            // 中央メインカード（右傾き）
            GraphicsState st2 = g.Save();
            g.TranslateTransform(128 * s, 132 * s);
            g.RotateTransform(4f);
            g.TranslateTransform(-128 * s, -132 * s);
            RectangleF mainCard = new RectangleF(84 * s, 58 * s, 92 * s, 130 * s);
            using (GraphicsPath mcPath = RoundedRect(mainCard, 12 * s))
            using (LinearGradientBrush mcFill = new LinearGradientBrush(
                mainCard,
                Color.FromArgb(37, 99, 235),
                Color.FromArgb(147, 51, 234),
                LinearGradientMode.ForwardDiagonal))
            using (LinearGradientBrush mcGold = new LinearGradientBrush(
                mainCard,
                Color.FromArgb(254, 240, 138),
                Color.FromArgb(217, 119, 6),
                LinearGradientMode.Vertical))
            using (Pen mcPen = new Pen(mcGold, Math.Max(1.2f, 5.5f * s)))
            {
                g.FillPath(mcFill, mcPath);
                g.DrawPath(mcPen, mcPath);
            }

            // カード内フレーム＆DMロゴ（32px以上の時）
            if (size >= 32)
            {
                RectangleF innerFrame = new RectangleF(94 * s, 70 * s, 72 * s, 54 * s);
                using (GraphicsPath ifPath = RoundedRect(innerFrame, 6 * s))
                using (SolidBrush ifFill = new SolidBrush(Color.FromArgb(15, 23, 42)))
                using (Pen ifPen = new Pen(Color.FromArgb(245, 158, 11), Math.Max(1f, 2.5f * s)))
                {
                    g.FillPath(ifFill, ifPath);
                    g.DrawPath(ifPen, ifPath);
                }

                using (Font dmFont = new Font("Arial", Math.Max(6f, 24f * s), FontStyle.Bold, GraphicsUnit.Pixel))
                using (SolidBrush dmBrush = new SolidBrush(Color.FromArgb(253, 224, 71)))
                {
                    StringFormat sf = new StringFormat();
                    sf.Alignment = StringAlignment.Center;
                    sf.LineAlignment = StringAlignment.Center;
                    g.DrawString("DM", dmFont, dmBrush, new RectangleF(94 * s, 72 * s, 72 * s, 52 * s), sf);
                }

                RectangleF textBox = new RectangleF(94 * s, 132 * s, 72 * s, 42 * s);
                using (GraphicsPath tbPath = RoundedRect(textBox, 5 * s))
                using (SolidBrush tbFill = new SolidBrush(Color.FromArgb(210, 15, 23, 42)))
                {
                    g.FillPath(tbFill, tbPath);
                }
            }
            g.Restore(st2);

            // 5文明オーブ（光・水・闇・火・自然）
            PointF[] centers = new PointF[]
            {
                new PointF(128 * s, 32 * s),  // 光
                new PointF(216 * s, 96 * s),  // 水
                new PointF(186 * s, 206 * s), // 闇
                new PointF(70 * s, 206 * s),  // 火
                new PointF(40 * s, 96 * s)    // 自然
            };
            Color[] orbFills = new Color[]
            {
                Color.FromArgb(250, 204, 21), // 光 (黄)
                Color.FromArgb(56, 189, 248), // 水 (青)
                Color.FromArgb(168, 85, 247), // 闇 (紫)
                Color.FromArgb(239, 68, 68),  // 火 (赤)
                Color.FromArgb(34, 197, 94)   // 自然 (緑)
            };
            Color[] orbBorders = new Color[]
            {
                Color.FromArgb(254, 249, 195),
                Color.FromArgb(224, 242, 254),
                Color.FromArgb(243, 232, 255),
                Color.FromArgb(254, 226, 226),
                Color.FromArgb(220, 252, 231)
            };

            float r = 16f * s;
            for (int i = 0; i < 5; i++)
            {
                RectangleF orbRect = new RectangleF(centers[i].X - r, centers[i].Y - r, r * 2f, r * 2f);
                using (SolidBrush b = new SolidBrush(orbFills[i]))
                using (Pen p = new Pen(orbBorders[i], Math.Max(1f, 3f * s)))
                {
                    g.FillEllipse(b, orbRect);
                    g.DrawEllipse(p, orbRect);
                }
            }
        }
        return bmp;
    }

    static void Main(string[] args)
    {
        string outPath = args.Length > 0 ? args[0] : "launcher\\app.ico";
        int[] sizes = new int[] { 256, 64, 48, 32, 16 };
        List<byte[]> pngBuffers = new List<byte[]>();

        foreach (int sz in sizes)
        {
            using (Bitmap bmp = RenderIconBitmap(sz))
            using (MemoryStream ms = new MemoryStream())
            {
                bmp.Save(ms, ImageFormat.Png);
                pngBuffers.Add(ms.ToArray());
            }
        }

        using (FileStream fs = new FileStream(outPath, FileMode.Create, FileAccess.Write))
        using (BinaryWriter bw = new BinaryWriter(fs))
        {
            // ICONDIR
            bw.Write((ushort)0); // reserved
            bw.Write((ushort)1); // type = 1 (ICO)
            bw.Write((ushort)sizes.Length);

            int offset = 6 + (16 * sizes.Length);
            for (int i = 0; i < sizes.Length; i++)
            {
                int sz = sizes[i];
                byte[] buf = pngBuffers[i];
                bw.Write((byte)(sz >= 256 ? 0 : sz));
                bw.Write((byte)(sz >= 256 ? 0 : sz));
                bw.Write((byte)0); // palette
                bw.Write((byte)0); // reserved
                bw.Write((ushort)1); // color planes
                bw.Write((ushort)32); // bits per pixel
                bw.Write((uint)buf.Length);
                bw.Write((uint)offset);
                offset += buf.Length;
            }

            for (int i = 0; i < pngBuffers.Count; i++)
            {
                bw.Write(pngBuffers[i]);
            }
        }
        Console.WriteLine("Generated multi-size icon: " + outPath);
    }
}

