using System.Globalization;
using System.Windows;
using System.Windows.Data;
using Kapinda.Vendor.Core.Contracts;

namespace Kapinda.Vendor.App.Infrastructure;

public sealed class BoolToVisibilityConverter : IValueConverter
{
    public bool Invert { get; set; }
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        (value is true) ^ Invert ? Visibility.Visible : Visibility.Collapsed;
    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => Binding.DoNothing;
}

public sealed class NullToVisibilityConverter : IValueConverter
{
    public bool Invert { get; set; }
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var has = value is not null && (value is not string s || s.Length > 0);
        return has ^ Invert ? Visibility.Visible : Visibility.Collapsed;
    }
    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => Binding.DoNothing;
}

public sealed class StatusLabelConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) => (parameter as string) switch
    {
        "settlement" => SettlementStatusWire.FromWire(value as string)?.ToLabel() ?? value,
        "substitution" => SubstitutionPreferenceWire.FromWire(value as string)?.ToLabel() ?? value,
        "fulfillment" => ItemFulfillmentWire.FromWire(value as string)?.ToLabel() ?? value,
        "payment" => ProductPaymentMethodWire.FromWire(value as string)?.ToLabel() ?? value,
        _ => OrderStatusWire.FromWire(value as string)?.ToLabel() ?? value,
    };
    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => Binding.DoNothing;
}

public sealed class TryConverter : IValueConverter
{
    private static readonly CultureInfo Tr = CultureInfo.GetCultureInfo("tr-TR");
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        value is decimal d ? d.ToString("N2", Tr) + " TL" : "";
    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => Binding.DoNothing;
}

public sealed class PhoneConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is not string s || !s.StartsWith("+90", StringComparison.Ordinal) || s.Length != 13) return value;
        var d = s[3..];
        return $"0{d[..3]} {d[3..6]} {d[6..8]} {d[8..]}";
    }
    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => Binding.DoNothing;
}
