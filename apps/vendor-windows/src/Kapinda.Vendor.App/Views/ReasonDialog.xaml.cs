using System.Windows;

namespace Kapinda.Vendor.App.Views;

public partial class ReasonDialog : Window
{
    public string Reason => ReasonBox.Text.Trim();

    public ReasonDialog(string title, string message)
    {
        InitializeComponent();
        Title = title;
        Heading.Text = title;
        Body.Text = message;
        Loaded += (_, _) => ReasonBox.Focus();
    }

    private void OnConfirm(object sender, RoutedEventArgs e)
    {
        if (Reason.Length < 3)
        {
            MessageBox.Show(this, "Lütfen bir gerekçe yazın.", Title, MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        DialogResult = true;
    }
}
