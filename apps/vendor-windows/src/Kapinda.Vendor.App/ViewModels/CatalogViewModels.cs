using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Kapinda.Vendor.Core.Models;
using Kapinda.Vendor.Core.Services;
using Kapinda.Vendor.Core.Supabase;

namespace Kapinda.Vendor.App.ViewModels;

public sealed partial class ProductsViewModel(VendorService svc, AppState state, IDialogService dialogs) : PageViewModel, INavigates
{
    public override string Title => "Ürünler";
    public Action<string, object?>? NavigateTo { get; set; }
    public ObservableCollection<ProductRow> Items { get; } = [];
    [ObservableProperty] private string _search = "";

    public override Task LoadAsync() => RunAsync(async () =>
    {
        Items.Clear();
        foreach (var p in await svc.ProductsAsync(state.VendorId, Search, 500)) Items.Add(p);
    });

    [RelayCommand] private Task SearchNowAsync() => LoadAsync();
    [RelayCommand] private void Add() => NavigateTo?.Invoke("product-edit", null);
    [RelayCommand] private void Edit(ProductRow? p) { if (p is not null) NavigateTo?.Invoke("product-edit", p); }

    [RelayCommand]
    private async Task DeleteAsync(ProductRow? p)
    {
        if (p is null || !dialogs.Confirm("Ürünü sil", $"\"{p.Name}\" silinsin mi? Geçmiş siparişler etkilenmez.")) return;
        await RunAsync(() => svc.DeleteProductAsync(p.Id), "Ürün silindi.");
        await LoadAsync();
    }
}

public sealed partial class ProductEditViewModel : PageViewModel, INavigates
{
    public static readonly object NewMarker = new();
    private readonly VendorService _svc;
    private readonly AppState _state;
    private readonly IDialogService _dialogs;
    private string? _productId;

    public override string Title => _productId is null ? "Ürün Ekle" : "Ürün Düzenle";
    public Action<string, object?>? NavigateTo { get; set; }
    public ObservableCollection<CategoryRow> Categories { get; } = [];
    public string[] Units { get; } = ["adet", "kg", "lt", "paket", "demet"];

    [ObservableProperty] private string _name = "";
    [ObservableProperty] private string? _description;
    [ObservableProperty] private string? _barcode;
    [ObservableProperty] private string _price = "";
    [ObservableProperty] private string _unit = "adet";
    [ObservableProperty] private bool _trackStock = true;
    [ObservableProperty] private string _stock = "0";
    [ObservableProperty] private bool _isActive = true;
    [ObservableProperty] private CategoryRow? _category;
    [ObservableProperty] private string? _imagePath;

    public ProductEditViewModel(VendorService svc, AppState state, IDialogService dialogs, object product)
    {
        _svc = svc;
        _state = state;
        _dialogs = dialogs;
        if (product is ProductRow p)
        {
            _productId = p.Id;
            _name = p.Name;
            _description = p.Description;
            _barcode = p.Barcode;
            _price = p.Price.ToString("0.00", System.Globalization.CultureInfo.GetCultureInfo("tr-TR"));
            _unit = p.Unit;
            _trackStock = p.TrackStock;
            _stock = (p.StockQuantity ?? 0).ToString(System.Globalization.CultureInfo.InvariantCulture);
            _isActive = p.IsActive;
            _imagePath = p.FirstImagePath;
            _pendingCategoryId = p.CategoryId;
        }
        else if (product is BarcodePrefill b)
        {
            _barcode = b.Barcode;
        }
    }

    private readonly string? _pendingCategoryId;

    public override Task LoadAsync() => RunAsync(async () =>
    {
        Categories.Clear();
        // Mevzuat gereği online satışa kapalı kategoriler ürün eklemede sunulmaz
        foreach (var c in (await _svc.CategoriesAsync()).Where(c => c.IsOnlineSaleAllowed)) Categories.Add(c);
        Category = Categories.FirstOrDefault(c => c.Id == _pendingCategoryId) ?? Category;
    });

    [RelayCommand]
    private async Task SaveAsync()
    {
        if (!decimal.TryParse(Price.Replace('.', ','), System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.GetCultureInfo("tr-TR"), out var price))
        {
            Error = "Geçerli bir fiyat girin.";
            return;
        }
        int? stock = TrackStock ? (int.TryParse(Stock, out var s) ? s : null) : null;
        var input = new ProductInput(Category?.Id ?? "", Name, Description, string.IsNullOrWhiteSpace(Barcode) ? null : Barcode.Trim(), price, Unit, TrackStock, stock, IsActive);
        var errors = Validation.ValidateProduct(input);
        if (errors.Count > 0)
        {
            Error = string.Join(" ", errors);
            return;
        }
        await RunAsync(async () =>
        {
            var saved = await _svc.SaveProductAsync(_state.VendorId, _productId, input);
            _productId = saved.Id;
            OnPropertyChanged(nameof(Title));
        }, "Ürün kaydedildi.");
    }

    [RelayCommand]
    private async Task AddImageAsync()
    {
        if (_productId is null)
        {
            Error = "Görsel eklemek için önce ürünü kaydedin.";
            return;
        }
        var file = _dialogs.PickImage();
        if (file is null) return;
        await RunAsync(() => _svc.AddProductImageAsync(_state.VendorId, _productId, file.Value.Bytes, file.Value.ContentType), "Görsel yüklendi.");
    }

    public string? ImageUrl => ImagePath is null ? null : _svc.Api.PublicUrl("product-images", ImagePath);
    partial void OnImagePathChanged(string? value) => OnPropertyChanged(nameof(ImageUrl));

    [RelayCommand] private void Back() => NavigateTo?.Invoke("products", null);
}

/// <summary>USB barkod okuyucu klavye gibi çalışır: okutulan kod kutuya yazılıp Enter ile aranır.</summary>
public sealed partial class BarcodeViewModel(VendorService svc, AppState state) : PageViewModel, INavigates
{
    public override string Title => "Barkod";
    public Action<string, object?>? NavigateTo { get; set; }
    [ObservableProperty] private string _code = "";
    [ObservableProperty] private ProductRow? _found;
    [ObservableProperty] private string _newStock = "";

    [RelayCommand]
    private async Task LookupAsync()
    {
        Found = null;
        var code = Code.Trim();
        if (!Validation.IsValidEan13(code))
        {
            Error = "Geçerli bir EAN-13 barkodu okutun.";
            return;
        }
        await RunAsync(async () =>
        {
            Found = await svc.ProductByBarcodeAsync(state.VendorId, code);
            if (Found is null) Info = "Bu barkoda ait ürün bulunamadı. Yeni ürün olarak ekleyebilirsiniz.";
            NewStock = Found?.StockQuantity?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "";
        });
    }

    [RelayCommand]
    private async Task SaveStockAsync()
    {
        if (Found is null || !int.TryParse(NewStock, out var q) || q < 0) { Error = "Geçerli bir stok miktarı girin."; return; }
        await RunAsync(() => svc.SetStockAsync(Found.Id, q), "Stok güncellendi.");
    }

    /// <summary>Bulunamayan barkod için yeni ürün formunu barkod dolu açar.</summary>
    [RelayCommand]
    private void CreateNew() => NavigateTo?.Invoke("product-edit", new BarcodePrefill(Code.Trim()));

    [RelayCommand] private void Edit() { if (Found is not null) NavigateTo?.Invoke("product-edit", Found); }
}

public sealed record BarcodePrefill(string Barcode);

public sealed partial class StockRow(ProductRow product) : ObservableObject
{
    public ProductRow Product { get; } = product;
    [ObservableProperty] private string _quantity = product.StockQuantity?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "0";
}

public sealed partial class StockViewModel(VendorService svc, AppState state) : PageViewModel
{
    public override string Title => "Stok";
    public ObservableCollection<StockRow> Items { get; } = [];
    [ObservableProperty] private bool _onlyLow;

    public override Task LoadAsync() => RunAsync(async () =>
    {
        Items.Clear();
        foreach (var p in (await svc.ProductsAsync(state.VendorId, null, 1000)).Where(p => p.TrackStock && (!OnlyLow || p.StockQuantity <= 5))) Items.Add(new StockRow(p));
    });

    partial void OnOnlyLowChanged(bool value) => _ = LoadAsync();

    [RelayCommand]
    private async Task SaveAsync(StockRow? row)
    {
        if (row is null || !int.TryParse(row.Quantity, out var q) || q < 0) { Error = "Geçerli bir stok miktarı girin."; return; }
        await RunAsync(() => svc.SetStockAsync(row.Product.Id, q), $"{row.Product.Name}: stok {q} olarak kaydedildi.");
    }
}

public sealed partial class CategoriesViewModel(VendorService svc, AppState state) : PageViewModel
{
    public override string Title => "Kategoriler";
    public sealed record CategoryCount(CategoryRow Category, int ProductCount);
    public ObservableCollection<CategoryCount> Items { get; } = [];

    public override Task LoadAsync() => RunAsync(async () =>
    {
        var cats = await svc.CategoriesAsync();
        var products = await svc.ProductsAsync(state.VendorId, null, 2000);
        Items.Clear();
        foreach (var c in cats) Items.Add(new CategoryCount(c, products.Count(p => p.CategoryId == c.Id)));
    });
}

public sealed partial class AddressBookViewModel(VendorService svc, AppState state) : PageViewModel
{
    public override string Title => "Adres Defteri";
    [ObservableProperty] private string _phone = "";
    public ObservableCollection<AddressBookEntry> Results { get; } = [];

    /// <summary>Telefon her biçimde girilebilir (0532…, +90…, 532…); normalizasyon sunucuda yapılır.</summary>
    [RelayCommand]
    private Task LookupAsync() => RunAsync(async () =>
    {
        Results.Clear();
        foreach (var e in await svc.AddressBookLookupAsync(state.VendorId, Phone)) Results.Add(e);
        if (Results.Count == 0) Info = "Bu telefon numarasına ait kayıtlı adres bulunamadı.";
    });

    public static string ErrorFor(Exception e) => ErrorMessages.Of(e);
}
