package site.kapinda.courier.core.network

import site.kapinda.courier.BuildConfig

/** Yalnız herkese açık (anon/publishable) anahtar. service_role anahtarı uygulamaya ASLA girmez. */
object SupabaseConfig {
    val url: String = BuildConfig.SUPABASE_URL.trimEnd('/')
    val anonKey: String = BuildConfig.SUPABASE_ANON_KEY
    val isConfigured: Boolean get() = url.startsWith("https://") && anonKey.isNotBlank()
}
