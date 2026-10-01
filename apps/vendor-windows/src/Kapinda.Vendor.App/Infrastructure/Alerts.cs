using System.Media;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace Kapinda.Vendor.App.Infrastructure;

/// <summary>Yeni sipariş uyarısı: sistem sesi + görev çubuğu yanıp sönmesi (FCM masaüstünde yoktur; Realtime kullanılır).</summary>
public static class Alerts
{
    [StructLayout(LayoutKind.Sequential)]
    private struct FLASHWINFO
    {
        public uint cbSize;
        public IntPtr hwnd;
        public uint dwFlags;
        public uint uCount;
        public uint dwTimeout;
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool FlashWindowEx(ref FLASHWINFO pwfi);

    private const uint FLASHW_ALL = 3;
    private const uint FLASHW_TIMERNOFG = 12;

    public static void NewOrder(Window? window, LocalPreferences prefs)
    {
        if (prefs.SoundAlerts) SystemSounds.Exclamation.Play();
        if (prefs.FlashWindow && window is not null)
        {
            var info = new FLASHWINFO
            {
                cbSize = (uint)Marshal.SizeOf<FLASHWINFO>(),
                hwnd = new WindowInteropHelper(window).Handle,
                dwFlags = FLASHW_ALL | FLASHW_TIMERNOFG,
                uCount = uint.MaxValue,
                dwTimeout = 0,
            };
            FlashWindowEx(ref info);
        }
    }
}
