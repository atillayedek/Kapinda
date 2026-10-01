using System.IO;
using System.Windows;
using Kapinda.Vendor.App.ViewModels;
using Kapinda.Vendor.App.Views;
using Microsoft.Win32;

namespace Kapinda.Vendor.App.Infrastructure;

public sealed class DialogService : IDialogService
{
    private static Window? Owner => Application.Current?.MainWindow;

    public bool Confirm(string title, string message) =>
        MessageBox.Show(Owner!, message, title, MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes;

    public string? PromptReason(string title, string message)
    {
        var dlg = new ReasonDialog(title, message) { Owner = Owner };
        return dlg.ShowDialog() == true ? dlg.Reason : null;
    }

    public (byte[] Bytes, string ContentType)? PickImage()
    {
        var dlg = new OpenFileDialog { Filter = "Görseller (*.jpg;*.jpeg;*.png;*.webp)|*.jpg;*.jpeg;*.png;*.webp", Multiselect = false };
        if (dlg.ShowDialog(Owner) != true) return null;
        var ext = Path.GetExtension(dlg.FileName).ToLowerInvariant();
        var type = ext switch { ".png" => "image/png", ".webp" => "image/webp", _ => "image/jpeg" };
        var info = new FileInfo(dlg.FileName);
        if (info.Length > 3 * 1024 * 1024)
        {
            MessageBox.Show(Owner!, "Görsel en fazla 3 MB olabilir.", "Kapında", MessageBoxButton.OK, MessageBoxImage.Warning);
            return null;
        }
        return (File.ReadAllBytes(dlg.FileName), type);
    }

    public void SaveCsv(string defaultName, string csv)
    {
        var dlg = new SaveFileDialog { FileName = defaultName, Filter = "CSV (*.csv)|*.csv" };
        if (dlg.ShowDialog(Owner) == true) File.WriteAllText(dlg.FileName, "﻿" + csv, System.Text.Encoding.UTF8);
    }
}
