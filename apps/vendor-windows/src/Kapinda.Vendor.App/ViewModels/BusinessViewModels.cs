using System.Collections.ObjectModel;
using System.Globalization;
using System.Text;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Kapinda.Vendor.App.Infrastructure;
using Kapinda.Vendor.Core.Contracts;
using Kapinda.Vendor.Core.Models;
using Kapinda.Vendor.Core.Services;

namespace Kapinda.Vendor.App.ViewModels;

public sealed partial class SalesViewModel(VendorService svc, AppState state, IDialogService dialogs) : PageViewModel
{
    public override string Title => "Satışlar";
    public string[] Ranges { get; } = ["Bugün", "Son 7 gün", "Son 30 gün"];
    [ObservableProperty] private string _range = "Bugün";
    [ObservableProperty] private SalesSummary? _summary;
    public ObservableCollection<CommissionRow> Commissions { get; } = [];

    private (DateTimeOffset From, DateTimeOffset To) Window()
    {
        var today = new DateTimeOffset(DateTime.Today, TimeZoneInfo.Local.GetUtcOffset(DateTime.Today));
        var days = Range switch { "Son 7 gün" => 6, "Son 30 gün" => 29, _ => 0 };
        return (today.AddDays(-days), today.AddDays(1));
    }

    partial void OnRangeChanged(string value) => _ = LoadAsync();

    public override Task LoadAsync() => RunAsync(async () =>
    {
        var (from, to) = Window();
        Summary = await svc.SalesSummaryAsync(state.VendorId, from, to);
        Commissions.Clear();
        foreach (var c in await svc.CommissionsAsync(state.VendorId, from, to)) Commissions.Add(c);
    });

    [RelayCommand]
    private void ExportCsv()
    {
        var sb = new StringBuilder("teslim;siparis;uygun_kalem;birim;komisyon;urun_gmv\r\n");
        foreach (var c in Commissions)
            sb.Append(CultureInfo.InvariantCulture, $"{c.DeliveredAt:yyyy-MM-dd HH:mm};{c.OrderId};{c.EligibleItemCount};{c.UnitAmount};{c.TotalAmount};{c.ProductGmv}\r\n");
        dialogs.SaveCsv("kapinda-satislar.csv", sb.ToString());
    }
}

public sealed partial class SettlementViewModel(VendorService svc, AppState state) : PageViewModel
{
    public override string Title => "Mutabakat";
    public ObservableCollection<SettlementRow> Items { get; } = [];
    public override Task LoadAsync() => RunAsync(async () =>
    {
        Items.Clear();
        foreach (var s in await svc.SettlementsAsync(state.VendorId)) Items.Add(s);
    });
    public static string StatusLabel(string s) => SettlementStatusWire.FromWire(s)?.ToLabel() ?? s;
}

public sealed partial class HourRow : ObservableObject
{
    public string? Id { get; init; }
    public int Weekday { get; init; }
    public string DayName => new[] { "Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi" }[Weekday];
    [ObservableProperty] private string _opensAt = "09:00";
    [ObservableProperty] private string _closesAt = "23:00";
    [ObservableProperty] private bool _isClosed;
}

public sealed partial class HoursViewModel(VendorService svc, AppState state) : PageViewModel
{
    public override string Title => "Çalışma Saatleri";
    public ObservableCollection<HourRow> Days { get; } = [];

    public override Task LoadAsync() => RunAsync(async () =>
    {
        var existing = await svc.HoursAsync(state.VendorId);
        Days.Clear();
        foreach (var d in new[] { 1, 2, 3, 4, 5, 6, 0 })
        {
            var h = existing.FirstOrDefault(x => x.Weekday == d);
            Days.Add(new HourRow { Id = h?.Id, Weekday = d, OpensAt = h?.OpensAt?[..5] ?? "09:00", ClosesAt = h?.ClosesAt?[..5] ?? "23:00", IsClosed = h?.IsClosed ?? false });
        }
    });

    [RelayCommand]
    private async Task SaveAsync()
    {
        foreach (var d in Days.Where(d => !d.IsClosed))
        {
            if (!TimeOnly.TryParse(d.OpensAt, CultureInfo.InvariantCulture, out var o) || !TimeOnly.TryParse(d.ClosesAt, CultureInfo.InvariantCulture, out var c) || o == c)
            {
                Error = $"{d.DayName}: saatleri SS:DD biçiminde girin (açılış ve kapanış farklı olmalı).";
                return;
            }
        }
        await RunAsync(() => svc.SaveHoursAsync(state.VendorId, Days.Select(d => new VendorHour(d.Id, state.VendorId, d.Weekday, d.OpensAt, d.ClosesAt, d.IsClosed))),
            "Çalışma saatleri kaydedildi. Hizmet bölgesi saatleri dışında sipariş alınmaz.");
        await LoadAsync();
    }
}

public sealed partial class StoreViewModel(VendorService svc, AppState state, IDialogService dialogs) : PageViewModel
{
    public override string Title => "Mağaza";
    [ObservableProperty] private string? _description;
    [ObservableProperty] private string _phone = "";
    [ObservableProperty] private string? _email;
    [ObservableProperty] private bool _isOpen;
    public VendorInfo? Vendor => state.Vendor;
    public string? LogoUrl => state.Vendor?.LogoPath is { } p ? svc.Api.PublicUrl("vendor-assets", p) : null;

    public override Task LoadAsync() => RunAsync(async () =>
    {
        var m = (await svc.MembershipsAsync()).FirstOrDefault(x => x.VendorId == state.VendorId)?.Vendors;
        if (m is not null) state.Vendor = m;
        Description = state.Vendor?.Description;
        Phone = state.Vendor?.Phone ?? "";
        Email = state.Vendor?.Email;
        IsOpen = state.Vendor?.IsOpen ?? false;
        OnPropertyChanged(nameof(Vendor));
        OnPropertyChanged(nameof(LogoUrl));
    });

    [RelayCommand] private Task SaveAsync() => RunAsync(() => svc.UpdateStoreAsync(state.VendorId, Description, Phone, Email), "Mağaza bilgileri kaydedildi.");

    [RelayCommand]
    private Task ToggleOpenAsync() => RunAsync(async () =>
    {
        await svc.SetOpenAsync(state.VendorId, !IsOpen);
        IsOpen = !IsOpen;
    }, "Durum güncellendi.");

    [RelayCommand]
    private async Task UploadLogoAsync()
    {
        var file = dialogs.PickImage();
        if (file is null) return;
        await RunAsync(() => svc.UploadVendorAssetAsync(state.VendorId, "logo", file.Value.Bytes, file.Value.ContentType), "Logo yüklendi.");
        await LoadAsync();
    }
}

public sealed partial class NotificationsViewModel(VendorService svc) : PageViewModel
{
    public override string Title => "Bildirimler";
    public ObservableCollection<NotificationRow> Items { get; } = [];
    public override Task LoadAsync() => RunAsync(async () =>
    {
        Items.Clear();
        foreach (var n in await svc.NotificationsAsync()) Items.Add(n);
    });
    [RelayCommand] private async Task MarkAllReadAsync() { await RunAsync(() => svc.MarkNotificationsReadAsync()); await LoadAsync(); }
}

public sealed partial class ProfileViewModel(VendorService svc, AppState state) : PageViewModel
{
    public override string Title => "Profil";
    public string Email => svc.Api.Session?.Email ?? "";
    public string VendorName => state.Vendor?.Name ?? "";
    public string Rating => state.Vendor is { RatingCount: > 0 } v ? $"{v.RatingAvg:0.0} ({v.RatingCount} değerlendirme)" : "Henüz değerlendirme yok";
    public string Commission => $"Satılan her uygun ürün kalemi için {BusinessRules.CommissionPerItemTry:0} TL. Teslimat ücretini Kapında tahsil eder; ürün bedelini kapıda siz tahsil edersiniz.";
}

public sealed partial class SettingsViewModel(LocalPreferences prefs, MainViewModel main) : PageViewModel
{
    public override string Title => "Ayarlar";
    public bool SoundAlerts { get => prefs.SoundAlerts; set { prefs.SoundAlerts = value; prefs.Save(); OnPropertyChanged(); } }
    public bool FlashWindow { get => prefs.FlashWindow; set { prefs.FlashWindow = value; prefs.Save(); OnPropertyChanged(); } }
    public string Version => typeof(SettingsViewModel).Assembly.GetName().Version?.ToString() ?? "";
    [RelayCommand] private Task SignOutAsync() => main.SignOutAsync();
}
