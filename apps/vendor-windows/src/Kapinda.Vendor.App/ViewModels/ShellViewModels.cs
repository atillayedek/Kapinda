using System.Collections.ObjectModel;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Kapinda.Vendor.App.Infrastructure;
using Kapinda.Vendor.Core.Contracts;
using Kapinda.Vendor.Core.Models;
using Kapinda.Vendor.Core.Services;
using Kapinda.Vendor.Core.Supabase;
using Microsoft.Extensions.DependencyInjection;

namespace Kapinda.Vendor.App.ViewModels;

public sealed record NavItem(string Key, string Label, string Glyph);

public sealed partial class MainViewModel : ObservableObject
{
    private readonly IServiceProvider _sp;
    private readonly VendorService _svc;
    private readonly RealtimeClient _realtime;
    private readonly AppState _state;
    private readonly LocalPreferences _prefs;
    private readonly HashSet<string> _alerted = [];

    [ObservableProperty] private object? _current;
    [ObservableProperty] private bool _isSignedIn;
    [ObservableProperty] private bool _realtimeConnected;
    [ObservableProperty] private int _newOrderCount;
    [ObservableProperty] private NavItem? _selectedNav;
    [ObservableProperty] private string? _banner;

    public ObservableCollection<NavItem> Nav { get; } =
    [
        new("dashboard", "Dashboard", ""),
        new("new", "Yeni Sipariş", ""),
        new("orders", "Siparişler", ""),
        new("preparing", "Hazırlanıyor", ""),
        new("ready", "Hazır", ""),
        new("products", "Ürünler", ""),
        new("barcode", "Barkod", ""),
        new("stock", "Stok", ""),
        new("categories", "Kategoriler", ""),
        new("addressbook", "Adres Defteri", ""),
        new("sales", "Satışlar", ""),
        new("settlement", "Mutabakat", ""),
        new("hours", "Çalışma Saatleri", ""),
        new("store", "Mağaza", ""),
        new("notifications", "Bildirimler", ""),
        new("profile", "Profil", ""),
        new("settings", "Ayarlar", ""),
    ];

    public AppState State => _state;
    public Window? Window { get; set; }

    public MainViewModel(IServiceProvider sp, VendorService svc, RealtimeClient realtime, AppState state, LocalPreferences prefs)
    {
        _sp = sp;
        _svc = svc;
        _realtime = realtime;
        _state = state;
        _prefs = prefs;
        _svc.Api.SessionExpired += (_, _) => Application.Current?.Dispatcher.Invoke(() => _ = SignOutAsync());
        _realtime.ConnectionChanged += c => Application.Current?.Dispatcher.Invoke(() => RealtimeConnected = c);
        _realtime.Changed += OnRealtime;
    }

    public async Task StartAsync()
    {
        if (!_svc.Api.Options.IsConfigured)
        {
            Current = new MessageViewModel("Yapılandırma eksik", "appsettings.json içinde Supabase Url ve AnonKey tanımlanmalıdır.");
            return;
        }
        if (_svc.Api.Session is null)
        {
            ShowLogin();
            return;
        }
        await EnterAsync();
    }

    private void ShowLogin()
    {
        IsSignedIn = false;
        var login = _sp.GetRequiredService<LoginViewModel>();
        login.SignedIn += async () => await EnterAsync();
        Current = login;
    }

    /// <summary>Giriş sonrası: vendor rolü ve aktif işletme üyeliği doğrulanır (sunucu RLS ayrıca uygular).</summary>
    public async Task EnterAsync()
    {
        try
        {
            if (!await _svc.HasVendorRoleAsync())
            {
                var app = await _svc.LatestApplicationAsync();
                Current = new PendingViewModel(app, null, () => _ = EnterAsync(), () => _ = SignOutAsync());
                return;
            }
            var memberships = await _svc.MembershipsAsync();
            var vendor = memberships.Select(m => m.Vendors).FirstOrDefault(v => v?.Id == _prefs.LastVendorId) ?? memberships.Select(m => m.Vendors).FirstOrDefault();
            if (vendor is null || vendor.Status != ApprovalStatus.Active.ToWire())
            {
                Current = new PendingViewModel(null, vendor, () => _ = EnterAsync(), () => _ = SignOutAsync());
                return;
            }
            _state.Vendor = vendor;
            _prefs.LastVendorId = vendor.Id;
            _prefs.Save();
            IsSignedIn = true;
            _realtime.Start(["orders", "notifications"]);
            await RefreshNewOrderCountAsync();
            SelectedNav = Nav[0];
        }
        catch (AppException e) when (e.Code == "KPD_AUTH_REQUIRED")
        {
            ShowLogin();
        }
        catch (Exception e)
        {
            Current = new MessageViewModel("Bağlantı sorunu", ErrorMessages.Of(e), "Tekrar dene", () => _ = EnterAsync());
        }
    }

    partial void OnSelectedNavChanged(NavItem? value)
    {
        if (value is null) return;
        Navigate(value.Key);
    }

    public void Navigate(string key, object? arg = null)
    {
        PageViewModel page = key switch
        {
            "dashboard" => _sp.GetRequiredService<DashboardViewModel>(),
            "new" => Orders("Yeni Sipariş", [OrderStatus.VendorPending]),
            "orders" => Orders("Siparişler", null),
            "preparing" => Orders("Hazırlanıyor", [OrderStatus.VendorAccepted, OrderStatus.Preparing]),
            "ready" => Orders("Hazır", [OrderStatus.ReadyForPickup, OrderStatus.CourierAssigned]),
            "order" => ActivatorUtilities.CreateInstance<OrderDetailViewModel>(_sp, (string)arg!),
            "products" => _sp.GetRequiredService<ProductsViewModel>(),
            "product-edit" => ActivatorUtilities.CreateInstance<ProductEditViewModel>(_sp, arg ?? ProductEditViewModel.NewMarker),
            "barcode" => _sp.GetRequiredService<BarcodeViewModel>(),
            "stock" => _sp.GetRequiredService<StockViewModel>(),
            "categories" => _sp.GetRequiredService<CategoriesViewModel>(),
            "addressbook" => _sp.GetRequiredService<AddressBookViewModel>(),
            "sales" => _sp.GetRequiredService<SalesViewModel>(),
            "settlement" => _sp.GetRequiredService<SettlementViewModel>(),
            "hours" => _sp.GetRequiredService<HoursViewModel>(),
            "store" => _sp.GetRequiredService<StoreViewModel>(),
            "notifications" => _sp.GetRequiredService<NotificationsViewModel>(),
            "profile" => _sp.GetRequiredService<ProfileViewModel>(),
            "settings" => _sp.GetRequiredService<SettingsViewModel>(),
            _ => _sp.GetRequiredService<DashboardViewModel>(),
        };
        if (page is INavigates n) n.NavigateTo = Navigate;
        Current = page;
        _ = page.LoadAsync();
    }

    private OrdersViewModel Orders(string title, OrderStatus[]? statuses) =>
        ActivatorUtilities.CreateInstance<OrdersViewModel>(_sp, title, statuses ?? Array.Empty<OrderStatus>());

    private void OnRealtime(RealtimeChange change)
    {
        Application.Current?.Dispatcher.Invoke(async () =>
        {
            if (change.Table != "orders" || change.Record is null) return;
            var id = change.Record["id"]?.GetValue<string>();
            var status = change.Record["status"]?.GetValue<string>();
            var number = change.Record["order_number"]?.GetValue<string>();
            if (id is not null && status == OrderStatus.VendorPending.ToWire() && _alerted.Add(id))
            {
                Banner = $"Yeni sipariş: {number}";
                Alerts.NewOrder(Window, _prefs);
            }
            await RefreshNewOrderCountAsync();
            if (Current is PageViewModel p and (OrdersViewModel or DashboardViewModel or OrderDetailViewModel)) await p.LoadAsync();
        });
    }

    public async Task RefreshNewOrderCountAsync()
    {
        if (_state.Vendor is null) return;
        try
        {
            NewOrderCount = (await _svc.OrdersAsync(_state.VendorId, [OrderStatus.VendorPending.ToWire()], 100)).Count;
        }
        catch (AppException)
        {
            // sayaç kritik değil
        }
    }

    [RelayCommand]
    private void OpenNewOrders()
    {
        Banner = null;
        SelectedNav = Nav.First(n => n.Key == "new");
    }

    [RelayCommand]
    public async Task SignOutAsync()
    {
        _realtime.Stop();
        await _svc.Api.SignOutAsync();
        _state.Vendor = null;
        ShowLogin();
    }
}

public interface INavigates
{
    Action<string, object?>? NavigateTo { get; set; }
}

public sealed partial class LoginViewModel(SupabaseClient api) : PageViewModel
{
    public override string Title => "Giriş";
    public event Func<Task>? SignedIn;

    [ObservableProperty] private string _email = "";

    [RelayCommand]
    private async Task LoginAsync(object? passwordBox)
    {
        var password = (passwordBox as System.Windows.Controls.PasswordBox)?.Password ?? "";
        if (string.IsNullOrWhiteSpace(Email) || password.Length == 0)
        {
            Error = "E-posta ve şifre zorunludur.";
            return;
        }
        await RunAsync(async () =>
        {
            await api.SignInAsync(Email, password);
            if (SignedIn is not null) await SignedIn();
        });
    }
}

public sealed partial class PendingViewModel : PageViewModel
{
    public override string Title => "Onay Bekleniyor";
    public string Heading { get; }
    public string Body { get; }
    public IRelayCommand RefreshCommand { get; }
    public IRelayCommand SignOutCommand { get; }

    public PendingViewModel(VendorApplicationRow? app, VendorInfo? vendor, Action refresh, Action signOut)
    {
        (Heading, Body) = (app, vendor) switch
        {
            (_, { Status: "suspended" }) => ("İşletme hesabı askıya alındı", "Ayrıntılar için destek@kapinda.site adresine yazın."),
            (_, not null) => ("Onay bekleniyor", "İşletme hesabınız henüz aktif değil."),
            ({ Status: "pending" }, _) => ("Başvurunuz inceleniyor", "Esnaf başvurunuz onaylandığında siparişleri buradan yönetebilirsiniz."),
            ({ Status: "rejected" }, _) => ("Başvurunuz onaylanmadı", app?.ReviewNote ?? "Ayrıntılar için destek ekibiyle iletişime geçin."),
            _ => ("İşletme hesabı bulunamadı", "Bu hesap için işletme kaydı yok. kapinda.site/esnaf-basvurusu adresinden başvurabilirsiniz."),
        };
        RefreshCommand = new RelayCommand(refresh);
        SignOutCommand = new RelayCommand(signOut);
    }
}

public sealed class MessageViewModel : PageViewModel
{
    public override string Title { get; }
    public string Body { get; }
    public string? ActionLabel { get; }
    public IRelayCommand? ActionCommand { get; }

    public MessageViewModel(string title, string body, string? actionLabel = null, Action? action = null)
    {
        Title = title;
        Body = body;
        ActionLabel = actionLabel;
        ActionCommand = action is null ? null : new RelayCommand(action);
    }
}
