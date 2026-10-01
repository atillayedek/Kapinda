package site.kapinda.courier.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import site.kapinda.courier.core.contracts.CourierAvailability
import site.kapinda.courier.data.ActiveOrder
import site.kapinda.courier.data.PoolOrder
import site.kapinda.courier.data.addressLine
import site.kapinda.courier.ui.components.EmptyState
import site.kapinda.courier.ui.components.ErrorCard
import site.kapinda.courier.ui.components.LoadingBox
import site.kapinda.courier.ui.components.statusLabel
import site.kapinda.courier.ui.viewmodel.HomeViewModel

@Composable
fun HomeScreen(onOpenTask: (String) -> Unit, snackbar: SnackbarHostState, showPool: Boolean, vm: HomeViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val permissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { vm.refresh(silent = true) }
    LaunchedEffect(Unit) {
        val perms = buildList {
            add(Manifest.permission.ACCESS_FINE_LOCATION); add(Manifest.permission.ACCESS_COARSE_LOCATION)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) add(Manifest.permission.POST_NOTIFICATIONS)
        }
        permissions.launch(perms.toTypedArray())
    }
    LaunchedEffect(state.message) { state.message?.let { snackbar.showSnackbar(it); vm.consumeMessage() } }

    if (state.loading && state.profile == null) return LoadingBox()
    val profile = state.profile
    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        state.error?.let { item { ErrorCard(it) { vm.refresh() } } }
        if (profile != null && !showPool) {
            item {
                val online = profile.availability in setOf("available", "busy")
                Card(colors = CardDefaults.cardColors(containerColor = if (online) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant)) {
                    Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(profile.displayName, fontWeight = FontWeight.Bold)
                            Text("${CourierAvailability.fromWire(profile.availability)?.label ?: profile.availability} · ${profile.activeOrderCount}/${profile.maxActiveOrders} aktif görev")
                            if (profile.availability == "unavailable") Text("Acil durum kaydınız çözülene kadar görev alamazsınız.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        }
                        Switch(checked = online, enabled = !state.busy && profile.availability != "unavailable", onCheckedChange = { vm.setOnline(it) })
                    }
                }
            }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Aktif görevlerim", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    IconButton(onClick = { vm.refresh() }) { Icon(Icons.Default.Refresh, contentDescription = "Yenile") }
                }
            }
            if (state.active.isEmpty()) item { EmptyState("Aktif görev yok.", description = "Çevrimiçi olun ve havuzdan görev alın.") }
            items(state.active, key = { it.id }) { ActiveCard(it) { onOpenTask(it.id) } }
        }
        if (showPool) {
            item { Text("Sipariş havuzu", style = MaterialTheme.typography.titleMedium) }
            if (profile?.availability !in setOf("available", "busy")) {
                item { EmptyState("Çevrimdışısınız.", description = "Havuzu görmek için Görevler ekranından çevrimiçi olun.") }
            } else if (state.pool.isEmpty()) {
                item { EmptyState("Havuzda bekleyen sipariş yok.", description = "Yeni siparişler bildirim olarak gelir.") }
            }
            items(state.pool, key = { it.orderId }) { PoolCard(it, enabled = !state.busy && profile?.availability == "available") { vm.accept(it.orderId) } }
        }
    }
}

@Composable
private fun ActiveCard(o: ActiveOrder, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(o.orderNumber, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                AssistChip(onClick = onClick, label = { Text(statusLabel(o.status)) })
            }
            Text("Alış: ${o.vendors?.name ?: ""}")
            Text("Teslim: ${o.addressLine()}", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun PoolCard(o: PoolOrder, enabled: Boolean, onAccept: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(o.orderNumber, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text(statusLabel(o.status), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            }
            Text("Alış: ${o.vendorName} — ${o.vendorAddress}")
            Text("Teslim bölgesi: ${o.destinationNeighborhood ?: "—"} · ${"%.1f".format(o.distanceKm)} km · ${o.itemCount} ürün", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.width(8.dp))
            Button(onClick = onAccept, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text("Görevi al") }
        }
    }
}
