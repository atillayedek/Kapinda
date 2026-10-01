package site.kapinda.courier.location

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import site.kapinda.courier.MainActivity
import site.kapinda.courier.R
import site.kapinda.courier.data.CourierRepository
import javax.inject.Inject

/**
 * Aktif teslimat sırasında konum paylaşımı (foreground service, location tipi).
 * Pil dostu: dengeli doğruluk, 10 sn aralık, 15 m minimum yer değişimi; sunucu ayrıca throttle uygular.
 * Aktif görev bitince servis durdurulur (konum yalnız operasyonel olarak gerekli süre paylaşılır).
 */
@AndroidEntryPoint
class LocationTrackingService : LifecycleService() {
    @Inject lateinit var repository: CourierRepository
    private val client by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private var lastSentMs = 0L

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val loc = result.lastLocation ?: return
            val now = System.currentTimeMillis()
            if (now - lastSentMs < MIN_SEND_INTERVAL_MS) return
            lastSentMs = now
            lifecycleScope.launch {
                runCatching {
                    repository.updateLocation(
                        loc.latitude, loc.longitude,
                        if (loc.hasAccuracy()) loc.accuracy else null,
                        if (loc.hasBearing()) loc.bearing else null,
                        if (loc.hasSpeed()) loc.speed else null,
                    )
                }.onFailure { repository.logClientEvent("courier_tracking_failure", it.javaClass.simpleName) }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        if (intent?.action == ACTION_STOP) {
            stopTracking()
            return START_NOT_STICKY
        }
        if (!hasPermission()) {
            stopSelf()
            return START_NOT_STICKY
        }
        ServiceCompat.startForeground(
            this, NOTIFICATION_ID, buildNotification(),
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0,
        )
        startUpdates()
        return START_STICKY
    }

    @SuppressLint("MissingPermission")
    private fun startUpdates() {
        val request = LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, UPDATE_INTERVAL_MS)
            .setMinUpdateIntervalMillis(MIN_SEND_INTERVAL_MS)
            .setMinUpdateDistanceMeters(15f)
            .setWaitForAccurateLocation(false)
            .build()
        client.removeLocationUpdates(callback)
        client.requestLocationUpdates(request, callback, Looper.getMainLooper())
    }

    private fun stopTracking() {
        client.removeLocationUpdates(callback)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        client.removeLocationUpdates(callback)
        super.onDestroy()
    }

    private fun hasPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun buildNotification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, getString(R.string.channel_tracking), NotificationManager.IMPORTANCE_LOW))
        val pi = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_kapinda)
            .setContentTitle(getString(R.string.tracking_title))
            .setContentText(getString(R.string.tracking_text))
            .setOngoing(true)
            .setContentIntent(pi)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "kapinda_tracking"
        private const val NOTIFICATION_ID = 4101
        private const val UPDATE_INTERVAL_MS = 10_000L
        private const val MIN_SEND_INTERVAL_MS = 5_000L
        private const val ACTION_STOP = "site.kapinda.courier.STOP_TRACKING"

        fun start(context: Context) = ContextCompat.startForegroundService(context, Intent(context, LocationTrackingService::class.java))
        fun stop(context: Context) = context.startService(Intent(context, LocationTrackingService::class.java).setAction(ACTION_STOP))
    }
}
