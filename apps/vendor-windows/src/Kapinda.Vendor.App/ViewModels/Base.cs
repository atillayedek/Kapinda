using CommunityToolkit.Mvvm.ComponentModel;
using Kapinda.Vendor.Core.Supabase;

namespace Kapinda.Vendor.App.ViewModels;

public abstract partial class PageViewModel : ObservableObject
{
    public abstract string Title { get; }

    [ObservableProperty] private bool _isBusy;
    [ObservableProperty] private string? _error;
    [ObservableProperty] private string? _info;

    /// <summary>Sayfa gösterildiğinde çağrılır.</summary>
    public virtual Task LoadAsync() => Task.CompletedTask;

    protected async Task RunAsync(Func<Task> action, string? success = null)
    {
        IsBusy = true;
        Error = null;
        Info = null;
        try
        {
            await action();
            if (success is not null) Info = success;
        }
        catch (Exception e)
        {
            Error = ErrorMessages.Of(e);
            if (e is AppException { Code: "KPD_INVALID_INPUT", Hint: { Length: > 0 } hint }) Error = hint;
        }
        finally
        {
            IsBusy = false;
        }
    }
}

public interface IDialogService
{
    bool Confirm(string title, string message);
    string? PromptReason(string title, string message);
    (byte[] Bytes, string ContentType)? PickImage();
    void SaveCsv(string defaultName, string csv);
}

/// <summary>Uygulama durumu: oturum açan kullanıcının işletmesi.</summary>
public sealed partial class AppState : ObservableObject
{
    [ObservableProperty] private Core.Models.VendorInfo? _vendor;
    public string VendorId => Vendor?.Id ?? throw new AppException("KPD_FORBIDDEN");
}
