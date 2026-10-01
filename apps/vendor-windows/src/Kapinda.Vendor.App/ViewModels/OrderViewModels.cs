using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Kapinda.Vendor.Core.Contracts;
using Kapinda.Vendor.Core.Models;
using Kapinda.Vendor.Core.Services;

namespace Kapinda.Vendor.App.ViewModels;

public sealed partial class DashboardViewModel(VendorService svc, AppState state) : PageViewModel, INavigates
{
    public override string Title => "Dashboard";
    public Action<string, object?>? NavigateTo { get; set; }

    [ObservableProperty] private SalesSummary? _today;
    [ObservableProperty] private int _pendingCount;
    [ObservableProperty] private int _preparingCount;
    [ObservableProperty] private int _readyCount;
    [ObservableProperty] private bool _isOpen;
    public ObservableCollection<OrderRow> Recent { get; } = [];
    public string VendorName => state.Vendor?.Name ?? "";

    public override Task LoadAsync() => RunAsync(async () =>
    {
        var start = new DateTimeOffset(DateTime.Today, TimeZoneInfo.Local.GetUtcOffset(DateTime.Today));
        Today = await svc.SalesSummaryAsync(state.VendorId, start, start.AddDays(1));
        var active = await svc.OrdersAsync(state.VendorId, ["vendor_pending", "vendor_accepted", "preparing", "ready_for_pickup", "courier_assigned"], 200);
        PendingCount = active.Count(o => o.Status == "vendor_pending");
        PreparingCount = active.Count(o => o.Status is "vendor_accepted" or "preparing");
        ReadyCount = active.Count(o => o.Status is "ready_for_pickup" or "courier_assigned");
        IsOpen = state.Vendor?.IsOpen ?? false;
        Recent.Clear();
        foreach (var o in await svc.OrdersAsync(state.VendorId, null, 10)) Recent.Add(o);
    });

    [RelayCommand]
    private Task ToggleOpenAsync() => RunAsync(async () =>
    {
        await svc.SetOpenAsync(state.VendorId, !IsOpen);
        IsOpen = !IsOpen;
        if (state.Vendor is not null) state.Vendor = state.Vendor with { IsOpen = IsOpen };
    }, IsOpen ? "İşletme kapatıldı. Yeni sipariş alınmayacak." : "İşletme açıldı.");

    [RelayCommand] private void Open(OrderRow? o) { if (o is not null) NavigateTo?.Invoke("order", o.Id); }
}

public sealed partial class OrdersViewModel(VendorService svc, AppState state, string title, OrderStatus[] statuses) : PageViewModel, INavigates
{
    public override string Title => title;
    public Action<string, object?>? NavigateTo { get; set; }
    public ObservableCollection<OrderRow> Items { get; } = [];
    [ObservableProperty] private int _page;
    [ObservableProperty] private bool _hasMore;
    [ObservableProperty] private bool _isEmpty;
    private const int PageSize = 50;

    public override Task LoadAsync() => RunAsync(async () =>
    {
        var rows = await svc.OrdersAsync(state.VendorId, statuses.Select(s => s.ToWire()).ToArray(), PageSize, Page * PageSize);
        Items.Clear();
        foreach (var o in rows) Items.Add(o);
        HasMore = rows.Count == PageSize;
        IsEmpty = Items.Count == 0;
    });

    [RelayCommand] private void Open(OrderRow? o) { if (o is not null) NavigateTo?.Invoke("order", o.Id); }
    [RelayCommand] private async Task NextAsync() { Page++; await LoadAsync(); }
    [RelayCommand] private async Task PrevAsync() { if (Page > 0) { Page--; await LoadAsync(); } }
    [RelayCommand] private Task RefreshAsync() => LoadAsync();
}

public sealed partial class OrderDetailViewModel(VendorService svc, AppState state, IDialogService dialogs, string orderId) : PageViewModel, INavigates
{
    public override string Title => "Sipariş Detayı";
    public Action<string, object?>? NavigateTo { get; set; }
    [ObservableProperty] private OrderRow? _order;
    public ObservableCollection<OrderItemRow> Items { get; } = [];
    public ObservableCollection<ProductRow> Alternatives { get; } = [];
    [ObservableProperty] private ProductRow? _selectedAlternative;

    public bool CanAccept => Order?.Status == "vendor_pending";
    public bool CanPrepare => Order?.Status == "vendor_accepted";
    public bool CanReady => Order?.Status == "preparing";
    public bool CanCancel => Order?.Status is "vendor_accepted" or "preparing";
    public bool CanEditItems => Order?.Status is "vendor_pending" or "vendor_accepted" or "preparing";
    public string StatusLabel => Order is null ? "" : OrderStatusWire.FromWire(Order.Status)?.ToLabel() ?? Order.Status;
    public string PaymentLabel => Order is null ? "" : ProductPaymentMethodWire.FromWire(Order.ProductPaymentMethod)?.ToLabel() ?? "";

    partial void OnOrderChanged(OrderRow? value)
    {
        OnPropertyChanged(nameof(CanAccept));
        OnPropertyChanged(nameof(CanPrepare));
        OnPropertyChanged(nameof(CanReady));
        OnPropertyChanged(nameof(CanCancel));
        OnPropertyChanged(nameof(CanEditItems));
        OnPropertyChanged(nameof(StatusLabel));
        OnPropertyChanged(nameof(PaymentLabel));
    }

    public override Task LoadAsync() => RunAsync(async () =>
    {
        Order = await svc.OrderAsync(orderId);
        Items.Clear();
        foreach (var i in await svc.OrderItemsAsync(orderId)) Items.Add(i);
        if (Alternatives.Count == 0)
            foreach (var p in (await svc.ProductsAsync(state.VendorId, null, 500)).Where(p => p.IsActive && (!p.TrackStock || p.StockQuantity > 0))) Alternatives.Add(p);
    });

    [RelayCommand] private Task AcceptAsync() => Transition("vendor_accepted", null, "Sipariş kabul edildi.");
    [RelayCommand] private Task PrepareAsync() => Transition("preparing", null, "Hazırlanıyor olarak işaretlendi.");
    [RelayCommand] private Task ReadyAsync() => Transition("ready_for_pickup", null, "Sipariş hazır. Kuryeler bilgilendirildi.");

    [RelayCommand]
    private Task RejectAsync()
    {
        var reason = dialogs.PromptReason("Siparişi reddet", "Müşteriye iletilecek red gerekçesini yazın.");
        return reason is null ? Task.CompletedTask : Transition(Order?.Status == "vendor_pending" ? "rejected" : "cancelled", reason, "Sipariş iptal edildi.");
    }

    private async Task Transition(string to, string? reason, string ok)
    {
        await RunAsync(() => svc.UpdateOrderStatusAsync(orderId, to, reason), ok);
        await LoadAsync();
    }

    /// <summary>Stokta yok: müşterinin önceden seçtiği tercih sunucuda uygulanır (alternatif / çıkar / iptal).</summary>
    [RelayCommand]
    private async Task MarkUnavailableAsync(OrderItemRow? item)
    {
        if (item is null) return;
        var pref = SubstitutionPreferenceWire.FromWire(item.SubstitutionPreference);
        var msg = pref switch
        {
            SubstitutionPreference.FindAlternative => SelectedAlternative is null
                ? $"Müşteri alternatif istedi ancak alternatif ürün seçmediniz. \"{item.ProductName}\" siparişten çıkarılacak."
                : $"\"{item.ProductName}\" yerine \"{SelectedAlternative.Name}\" eklenecek.",
            SubstitutionPreference.NotifyAndCancel => "Müşteri bu durumda siparişin iptalini istedi. Sipariş iptal edilecek.",
            _ => $"\"{item.ProductName}\" siparişten çıkarılacak.",
        };
        if (!dialogs.Confirm("Ürün stokta yok", msg)) return;
        await RunAsync(() => svc.MarkItemUnavailableAsync(item.Id, pref == SubstitutionPreference.FindAlternative ? SelectedAlternative?.Id : null, null), "Güncellendi. Müşteri bilgilendirildi.");
        await LoadAsync();
    }

    [RelayCommand] private void Back() => NavigateTo?.Invoke("orders", null);
}
