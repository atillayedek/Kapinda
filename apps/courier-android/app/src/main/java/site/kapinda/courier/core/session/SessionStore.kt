package site.kapinda.courier.core.session

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class Session(
    val accessToken: String,
    val refreshToken: String,
    val expiresAtEpochSec: Long,
    val userId: String,
    val email: String?,
)

/** Oturum bilgisi Android Keystore destekli şifreli depoda tutulur. */
@Singleton
class SessionStore @Inject constructor(@ApplicationContext context: Context) {
    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "kapinda_secure_session",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
    private val json = Json { ignoreUnknownKeys = true }

    fun load(): Session? = prefs.getString(KEY, null)?.let { runCatching { json.decodeFromString<Session>(it) }.getOrNull() }

    fun save(session: Session) {
        prefs.edit().putString(KEY, json.encodeToString(session)).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY).remove(FCM_KEY).apply()
    }

    var fcmToken: String?
        get() = prefs.getString(FCM_KEY, null)
        set(value) = prefs.edit().putString(FCM_KEY, value).apply()

    val deviceId: String
        get() = prefs.getString(DEVICE_KEY, null) ?: java.util.UUID.randomUUID().toString().also { prefs.edit().putString(DEVICE_KEY, it).apply() }

    private companion object {
        const val KEY = "session"
        const val FCM_KEY = "fcm_token"
        const val DEVICE_KEY = "device_id"
    }
}
