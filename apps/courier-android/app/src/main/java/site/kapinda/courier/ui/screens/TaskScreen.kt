package site.kapinda.courier.ui.screens

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import site.kapinda.courier.core.contracts.ProductPaymentMethod
import site.kapinda.courier.data.addressLine
import site.kapinda.courier.data.directions
import site.kapinda.courier.ui.components.EmptyState
import site.kapinda.courier.ui.components.LoadingBox
import site.kapinda.courier.ui.components.formatTrPhone
import site.kapinda.courier.ui.components.formatTry
import site.kapinda.courier.ui.components.statusLabel
import site.kapinda.courier.ui.viewmodel.TaskViewModel
import java.io.ByteArrayOutputStream

@Composable
fun TaskScreen(onScan: (String) -> Unit, onMap: (String) -> Unit, snackbar: SnackbarHostState, vm: TaskViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val ctx = LocalContext.current
    var releaseOpen by remember { mutableStateOf(false) }
    var reason by remember { mutableStateOf("") }
    val photo = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bmp: Bitmap? ->
        if (bmp != null) {
            val out = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, 85, out)
            vm.uploadProof(out.toByteArray())
        }
    }
    LaunchedEffect(state.message) { state.message?.let { snackbar.showSnackbar(it); vm.consumeMessage() } }
    if (state.loading) return LoadingBox()
    val o = state.order ?: return EmptyState("Görev bulunamadı.", description = "Görev başka bir kuryeye devredilmiş veya iptal edilmiş olabilir.")

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(o.orderNumber, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(statusLabel(o.status), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("1. Alış noktası", fontWeight = FontWeight.Bold)
                Text(o.vendors?.name ?: "")
                Text(o.vendors?.addressText ?: "", style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    o.vendors?.phone?.let { phone -> OutlinedButton(onClick = { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))) }) { Icon(Icons.Default.Call, null); Text(" Ara") } }
                    if (o.vendors?.lat != null && o.vendors.lng != null) {
                        OutlinedButton(onClick = { navigate(ctx, o.vendors.lat, o.vendors.lng) }) { Icon(Icons.Default.Navigation, null); Text(" Yol tarifi") }
                    }
                }
            }
        }
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("2. Teslimat", fontWeight = FontWeight.Bold)
                Text(o.customerName)
                Text(o.addressLine())
                o.directions()?.let { Text("Tarif: $it", style = MaterialTheme.typography.bodySmall) }
                o.customerNote?.let { Text("Not: $it", style = MaterialTheme.typography.bodySmall) }
                Text("Kapıda tahsil: ${formatTry(o.productSubtotal)} (${ProductPaymentMethod.fromWire(o.productPaymentMethod)?.label ?: ""})", fontWeight = FontWeight.SemiBold)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${o.customerPhone}"))) }) { Icon(Icons.Default.Call, null); Text(" ${formatTrPhone(o.customerPhone)}") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { navigate(ctx, o.deliveryLat, o.deliveryLng) }) { Icon(Icons.Default.Navigation, null); Text(" Yol tarifi") }
                    OutlinedButton(onClick = { onMap(o.id) }) { Icon(Icons.Default.Map, null); Text(" Harita") }
                }
            }
        }
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Ürünler (${o.itemCount})", fontWeight = FontWeight.Bold)
                state.items.forEach { i ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                        Text("${i.quantity} × ${i.productName}${if (i.fulfillment == "removed") " (çıkarıldı)" else ""}", modifier = Modifier.weight(1f))
                        Text(formatTry(i.lineTotal))
                    }
                    HorizontalDivider()
                }
            }
        }

        when (o.status) {
            "vendor_accepted", "preparing", "ready_for_pickup" -> Text("İşletme siparişi hazırlıyor. Hazır olduğunda bildirim alacaksınız.")
            "courier_assigned" -> Button(onClick = vm::pickedUp, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("Siparişi teslim aldım") }
            "picked_up" -> Button(onClick = vm::onTheWay, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("Yola çıktım") }
            "delivered" -> Text("Teslim edildi.", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
        }
        if (o.status in setOf("picked_up", "on_the_way")) {
            Button(onClick = { onScan(o.id) }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.QrCodeScanner, null); Text("  QR okut ve teslim et")
            }
            Text("Teslimat yalnızca müşterinin QR kodu okutularak tamamlanır.", style = MaterialTheme.typography.bodySmall)
        }
        if (o.status in setOf("picked_up", "on_the_way", "delivered")) {
            OutlinedButton(onClick = { photo.launch(null) }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.PhotoCamera, null); Text("  Teslimat fotoğrafı ekle (isteğe bağlı)")
            }
        }
        if (o.status in setOf("vendor_accepted", "preparing", "ready_for_pickup", "courier_assigned")) {
            TextButton(onClick = { releaseOpen = true }, modifier = Modifier.fillMaxWidth()) { Text("Görevi bırak", color = MaterialTheme.colorScheme.error) }
        }
    }

    if (releaseOpen) {
        AlertDialog(
            onDismissRequest = { releaseOpen = false },
            title = { Text("Görev bırakılsın mı?") },
            text = {
                Column {
                    Text("Sipariş havuza geri döner. Lütfen gerekçe yazın.")
                    OutlinedTextField(reason, { reason = it }, label = { Text("Gerekçe") }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                }
            },
            confirmButton = { TextButton(enabled = reason.isNotBlank(), onClick = { vm.release(reason.trim()); releaseOpen = false }) { Text("Bırak") } },
            dismissButton = { TextButton(onClick = { releaseOpen = false }) { Text("Vazgeç") } },
        )
    }
}

private fun navigate(ctx: android.content.Context, lat: Double, lng: Double) {
    val nav = Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=$lat,$lng&mode=d")).setPackage("com.google.android.apps.maps")
    val fallback = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving"))
    runCatching { ctx.startActivity(nav) }.onFailure { ctx.startActivity(fallback) }
}
