package site.kapinda.courier.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import site.kapinda.courier.core.contracts.OrderStatus
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val tr = Locale.forLanguageTag("tr-TR")
private val dateTime = DateTimeFormatter.ofPattern("d MMM yyyy HH:mm", tr).withZone(ZoneId.of("Europe/Istanbul"))

fun formatTry(v: Double): String = NumberFormat.getNumberInstance(tr).apply { minimumFractionDigits = 2; maximumFractionDigits = 2 }.format(v) + " TL"
fun formatDateTime(iso: String?): String = iso?.let { runCatching { dateTime.format(Instant.parse(it.replace(" ", "T").let { s -> if (s.endsWith("Z") || s.contains("+")) s else s + "Z" })) }.getOrNull() } ?: "—"
fun statusLabel(wire: String): String = OrderStatus.fromWire(wire)?.label ?: wire

fun formatTrPhone(canonical: String): String {
    val d = canonical.removePrefix("+90")
    return if (d.length == 10) "0${d.substring(0, 3)} ${d.substring(3, 6)} ${d.substring(6, 8)} ${d.substring(8)}" else canonical
}

@Composable
fun LoadingBox(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
fun EmptyState(title: String, modifier: Modifier = Modifier, description: String? = null) {
    Column(modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        description?.let { Text(it, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
fun ErrorCard(message: String, onRetry: (() -> Unit)? = null) {
    Card(Modifier.fillMaxWidth().padding(16.dp)) {
        Column(Modifier.padding(16.dp)) {
            Text(message, color = MaterialTheme.colorScheme.error)
            if (onRetry != null) {
                Spacer(Modifier.height(8.dp))
                Button(onClick = onRetry) { Text("Tekrar dene") }
            }
        }
    }
}
