package site.kapinda.courier.ui.screens

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import site.kapinda.courier.BuildConfig
import site.kapinda.courier.core.contracts.BusinessRules
import site.kapinda.courier.core.contracts.IncidentType
import site.kapinda.courier.data.CourierProfile
import site.kapinda.courier.data.Earnings
import site.kapinda.courier.data.addressLine
import site.kapinda.courier.ui.components.EmptyState
import site.kapinda.courier.ui.components.ErrorCard
import site.kapinda.courier.ui.components.LoadingBox
import site.kapinda.courier.ui.components.formatDateTime
import site.kapinda.courier.ui.components.formatTrPhone
import site.kapinda.courier.ui.components.formatTry
import site.kapinda.courier.ui.viewmodel.EarningsViewModel
import site.kapinda.courier.ui.viewmodel.HistoryViewModel
import site.kapinda.courier.ui.viewmodel.IncidentViewModel
import site.kapinda.courier.ui.viewmodel.NotificationsViewModel

@Composable
fun HistoryScreen(onOpen: (String) -> Unit, vm: HistoryViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    if (state.loading) return LoadingBox()
    state.error?.let { return ErrorCard(it) { vm.loadMore() } }
    if (state.items.isEmpty()) return EmptyState("Henüz teslimat bulunmuyor.")
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(state.items, key = { it.id }) { o ->
            Card(onClick = { onOpen(o.id) }, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(o.orderNumber, fontWeight = FontWeight.Bold)
                    Text("${o.vendors?.name ?: ""} → ${o.addressLine()}", style = MaterialTheme.typography.bodySmall)
                    Text("Teslim: ${formatDateTime(o.deliveredAt)} · ${"%.1f".format(o.distanceKm)} km", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        if (state.canLoadMore) item { TextButton(onClick = { vm.loadMore() }, modifier = Modifier.fillMaxWidth()) { Text("Daha fazla") } }
    }
}

@Composable
fun EarningsScreen(vm: EarningsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    if (state.loading) return LoadingBox()
    state.error?.let { return ErrorCard(it) { vm.load() } }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Teslimat özetim", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text("Tutarlar, teslim ettiğiniz siparişlerin teslimat ücretlerinin toplamıdır. Ödeme koşullarınız sözleşmenize göre belirlenir.", style = MaterialTheme.typography.bodySmall)
        state.today?.let { EarningsCard("Bugün", it) }
        state.week?.let { EarningsCard("Son 7 gün", it) }
        state.month?.let { EarningsCard("Son 30 gün", it) }
        state.month?.let { if (it.ratingCount > 0) Text("Puanınız: ${"%.1f".format(it.ratingAvg)} (${it.ratingCount} değerlendirme)") }
    }
}

@Composable
private fun EarningsCard(title: String, e: Earnings) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(title, fontWeight = FontWeight.Bold)
            Text("${e.deliveredCount} teslimat · ${"%.1f".format(e.distanceKmTotal)} km")
            Text("Teslimat ücreti toplamı: ${formatTry(e.deliveryFeeTotal)}")
        }
    }
}

/** Acil durum bildirimi. İlk beş ciddi türde kurye sunucu tarafından otomatik "kullanılamaz" yapılır. */
@Composable
fun IncidentsScreen(snackbar: SnackbarHostState, vm: IncidentViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    var type by remember { mutableStateOf<IncidentType?>(null) }
    var description by remember { mutableStateOf("") }
    LaunchedEffect(state.message) { state.message?.let { snackbar.showSnackbar(it); vm.consumeMessage() } }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Acil Durum Bildir", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
        IncidentType.entries.forEach { t ->
            FilterChip(selected = type == t, onClick = { type = t }, label = { Text(t.label) }, modifier = Modifier.fillMaxWidth())
        }
        type?.let { if (it in BusinessRules.SERIOUS_INCIDENT_TYPES) Text("Bu bildirimden sonra yeni görev almazsınız; yönetim sizinle iletişime geçecek.", style = MaterialTheme.typography.bodySmall) }
        OutlinedTextField(description, { description = it.take(1000) }, label = { Text("Açıklama (isteğe bağlı)") }, modifier = Modifier.fillMaxWidth(), minLines = 3)
        Button(
            onClick = { type?.let { vm.report(it.wire, description); description = ""; type = null } },
            enabled = type != null && !state.busy,
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (state.busy) "Gönderiliyor…" else "Yönetime bildir") }
        Text("Hayati tehlike varsa önce 112'yi arayın.", fontWeight = FontWeight.Bold)
        if (state.items.isNotEmpty()) Text("Bildirimlerim", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
        state.items.forEach { i ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(IncidentType.fromWire(i.incidentType)?.label ?: i.incidentType, fontWeight = FontWeight.Bold)
                    i.description?.let { Text(it) }
                    Text("${formatDateTime(i.createdAt)} · ${mapOf("open" to "Açık", "acknowledged" to "Görüldü", "resolved" to "Çözüldü")[i.status] ?: i.status}", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
fun NotificationsScreen(vm: NotificationsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    if (state.loading) return LoadingBox()
    state.error?.let { return ErrorCard(it) { vm.load() } }
    if (state.items.isEmpty()) return EmptyState("Henüz bildirim bulunmuyor.")
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { TextButton(onClick = { vm.markAllRead() }) { Text("Tümünü okundu say") } }
        items(state.items, key = { it.id }) { n ->
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = if (n.readAt == null) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface)) {
                Column(Modifier.padding(12.dp)) {
                    Text(n.title, fontWeight = FontWeight.Bold)
                    Text(n.body)
                    Text(formatDateTime(n.createdAt), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
fun ProfileScreen(profile: CourierProfile?, email: String?, onIncidents: () -> Unit, onNotifications: () -> Unit, onSignOut: () -> Unit) {
    val ctx = LocalContext.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Profil", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        profile?.let { p ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text(p.displayName, fontWeight = FontWeight.Bold)
                    Text(email ?: "")
                    Text(formatTrPhone(p.phone))
                    Text("${p.vehicleType}${p.vehiclePlate?.let { " · $it" } ?: ""}")
                    Text("Eşzamanlı görev sınırı: ${p.maxActiveOrders}")
                    if (p.ratingCount > 0) Text("Puan: ${"%.1f".format(p.ratingAvg)} (${p.ratingCount})")
                }
            }
        }
        OutlinedButton(onClick = onNotifications, modifier = Modifier.fillMaxWidth()) { Text("Bildirimler") }
        Button(onClick = onIncidents, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error), modifier = Modifier.fillMaxWidth()) { Text("Acil Durum Bildir") }
        Text("Ayarlar", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
        OutlinedButton(onClick = {
            ctx.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName))
        }, modifier = Modifier.fillMaxWidth()) { Text("Bildirim ayarları") }
        OutlinedButton(onClick = {
            ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.fromParts("package", ctx.packageName, null)))
        }, modifier = Modifier.fillMaxWidth()) { Text("Uygulama izinleri (konum, kamera)") }
        Row(Modifier.fillMaxWidth()) { Text("Sürüm ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.bodySmall) }
        Text("Destek: destek@kapinda.site · +90 531 870 1189", style = MaterialTheme.typography.bodySmall)
        TextButton(onClick = onSignOut, modifier = Modifier.fillMaxWidth()) { Text("Çıkış yap", color = MaterialTheme.colorScheme.error) }
    }
}
