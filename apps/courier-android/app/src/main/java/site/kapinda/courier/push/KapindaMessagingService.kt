package site.kapinda.courier.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import site.kapinda.courier.MainActivity
import site.kapinda.courier.R
import site.kapinda.courier.data.CourierRepository
import javax.inject.Inject

/** FCM: yeni görev, atama, teslim almaya hazır, acil/yönetici bildirimleri. Token cihaz bazlı kaydedilir. */
@AndroidEntryPoint
class KapindaMessagingService : FirebaseMessagingService() {
    @Inject lateinit var repository: CourierRepository
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        if (repository.isSignedIn()) scope.launch { runCatching { repository.registerDeviceToken(token) } }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: getString(R.string.app_name)
        val body = message.notification?.body ?: message.data["body"] ?: return
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, getString(R.string.channel_orders), NotificationManager.IMPORTANCE_HIGH))
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            message.data["order_id"]?.let { putExtra(MainActivity.EXTRA_ORDER_ID, it) }
        }
        val pi = PendingIntent.getActivity(this, message.data.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        nm.notify(
            (message.messageId ?: System.currentTimeMillis().toString()).hashCode(),
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_kapinda)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build(),
        )
    }

    companion object {
        const val CHANNEL_ID = "kapinda_orders"
    }
}
