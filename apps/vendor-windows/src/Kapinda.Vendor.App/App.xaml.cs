using System.Globalization;
using System.Net.Http;
using System.Windows;
using System.Windows.Markup;
using Kapinda.Vendor.App.Infrastructure;
using Kapinda.Vendor.App.ViewModels;
using Kapinda.Vendor.Core.Services;
using Kapinda.Vendor.Core.Supabase;
using Microsoft.Extensions.DependencyInjection;

namespace Kapinda.Vendor.App;

public partial class App : Application
{
    private ServiceProvider? _services;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        var tr = CultureInfo.GetCultureInfo("tr-TR");
        CultureInfo.DefaultThreadCurrentCulture = tr;
        CultureInfo.DefaultThreadCurrentUICulture = tr;
        FrameworkElement.LanguageProperty.OverrideMetadata(typeof(FrameworkElement), new FrameworkPropertyMetadata(XmlLanguage.GetLanguage(tr.IetfLanguageTag)));

        DispatcherUnhandledException += (_, args) =>
        {
            // Kullanıcıya iç hata ayrıntısı gösterilmez
            MessageBox.Show(ErrorMessages.Of(args.Exception), "Kapında İşletme", MessageBoxButton.OK, MessageBoxImage.Error);
            args.Handled = true;
        };

        var services = new ServiceCollection();
        services.AddSingleton(AppConfig.LoadSupabase());
        services.AddSingleton(LocalPreferences.Load());
        services.AddSingleton<ISessionStore, DpapiSessionStore>();
        services.AddSingleton(_ => new HttpClient { Timeout = TimeSpan.FromSeconds(30) });
        services.AddSingleton<SupabaseClient>();
        services.AddSingleton<RealtimeClient>();
        services.AddSingleton<VendorService>();
        services.AddSingleton<AppState>();
        services.AddSingleton<IDialogService, DialogService>();
        services.AddSingleton<MainViewModel>();
        services.AddTransient<LoginViewModel>();
        services.AddTransient<DashboardViewModel>();
        services.AddTransient<ProductsViewModel>();
        services.AddTransient<BarcodeViewModel>();
        services.AddTransient<StockViewModel>();
        services.AddTransient<CategoriesViewModel>();
        services.AddTransient<AddressBookViewModel>();
        services.AddTransient<SalesViewModel>();
        services.AddTransient<SettlementViewModel>();
        services.AddTransient<HoursViewModel>();
        services.AddTransient<StoreViewModel>();
        services.AddTransient<NotificationsViewModel>();
        services.AddTransient<ProfileViewModel>();
        services.AddTransient<SettingsViewModel>();
        _services = services.BuildServiceProvider();

        var main = _services.GetRequiredService<MainViewModel>();
        var window = new MainWindow { DataContext = main };
        main.Window = window;
        MainWindow = window;
        window.Show();
        await main.StartAsync();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _services?.GetService<RealtimeClient>()?.Stop();
        _services?.Dispose();
        base.OnExit(e);
    }
}
