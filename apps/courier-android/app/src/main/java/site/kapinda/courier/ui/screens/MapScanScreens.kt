package site.kapinda.courier.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.util.Size
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.rememberMarkerState
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import site.kapinda.courier.ui.components.EmptyState
import site.kapinda.courier.ui.components.LoadingBox
import site.kapinda.courier.ui.viewmodel.ScanViewModel
import site.kapinda.courier.ui.viewmodel.TaskViewModel
import java.util.concurrent.Executors

@Composable
fun MapScreen(vm: TaskViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val ctx = LocalContext.current
    if (state.loading) return LoadingBox()
    val o = state.order ?: return EmptyState("Görev bulunamadı.")
    val dest = LatLng(o.deliveryLat, o.deliveryLng)
    val vendor = o.vendors?.lat?.let { lat -> o.vendors.lng?.let { LatLng(lat, it) } }
    val camera = rememberCameraPositionState { position = CameraPosition.fromLatLngZoom(dest, 14f) }
    val hasLocation = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    GoogleMap(Modifier.fillMaxSize(), cameraPositionState = camera, properties = MapProperties(isMyLocationEnabled = hasLocation)) {
        vendor?.let { Marker(state = rememberMarkerState(position = it), title = "Alış: ${o.vendors?.name}", icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_ORANGE)) }
        Marker(state = rememberMarkerState(position = dest), title = "Teslimat: ${o.customerName}", icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_GREEN))
    }
}

/** QR okutma: CameraX + ML Kit. Okunan içerik doğrulama için sunucuya gönderilir (HMAC, süre, kurye bağlaması sunucuda). */
@Composable
fun ScanScreen(onDone: () -> Unit, vm: ScanViewModel = hiltViewModel()) {
    val ctx = LocalContext.current
    val state by vm.state.collectAsStateWithLifecycle()
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    LaunchedEffect(Unit) { if (!granted) launcher.launch(Manifest.permission.CAMERA) }

    state.deliveredOrderNumber?.let {
        return Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Teslimat tamamlandı", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Text(it, modifier = Modifier.padding(top = 8.dp))
            Text("Ürün bedelini kapıda tahsil etmeyi unutmayın.", modifier = Modifier.padding(top = 8.dp))
            Button(onClick = onDone, modifier = Modifier.fillMaxWidth().padding(top = 24.dp)) { Text("Görevlere dön") }
        }
    }
    if (!granted) return EmptyState("Kamera izni gerekli.", description = "QR okutmak için kamera iznini verin.")

    Box(Modifier.fillMaxSize()) {
        CameraPreview(onQr = { if (!state.busy && state.error == null) vm.verify(it) })
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Color.Black.copy(alpha = 0.6f)).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            when {
                state.busy -> { CircularProgressIndicator(Modifier.size(32.dp)); Text("Doğrulanıyor…", color = Color.White) }
                state.error != null -> {
                    Text(state.error!!, color = Color.White)
                    Button(onClick = vm::reset, modifier = Modifier.padding(top = 8.dp)) { Text("Tekrar okut") }
                }
                else -> Text("Müşterinin teslimat QR kodunu çerçeveye getirin.", color = Color.White)
            }
        }
    }
}

@androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)
@Composable
private fun CameraPreview(onQr: (String) -> Unit) {
    val ctx = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val executor = remember { Executors.newSingleThreadExecutor() }
    val scanner = remember { BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()) }
    DisposableEffect(Unit) { onDispose { executor.shutdown(); scanner.close() } }
    AndroidView(modifier = Modifier.fillMaxSize(), factory = { c ->
        val view = PreviewView(c)
        val providerFuture = ProcessCameraProvider.getInstance(c)
        providerFuture.addListener({
            val provider = providerFuture.get()
            val preview = Preview.Builder().build().also { it.surfaceProvider = view.surfaceProvider }
            @Suppress("DEPRECATION")
            val analysis = ImageAnalysis.Builder().setTargetResolution(Size(1280, 720)).setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
            analysis.setAnalyzer(executor) { proxy ->
                val media = proxy.image
                if (media == null) { proxy.close(); return@setAnalyzer }
                scanner.process(InputImage.fromMediaImage(media, proxy.imageInfo.rotationDegrees))
                    .addOnSuccessListener { codes -> codes.firstOrNull()?.rawValue?.let { v -> if (v.startsWith("KPD1.")) ContextCompat.getMainExecutor(ctx).execute { onQr(v) } } }
                    .addOnCompleteListener { proxy.close() }
            }
            provider.unbindAll()
            provider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
        }, ContextCompat.getMainExecutor(c))
        view
    })
}

