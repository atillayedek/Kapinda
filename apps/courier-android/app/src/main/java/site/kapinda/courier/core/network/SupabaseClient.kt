package site.kapinda.courier.core.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import site.kapinda.courier.core.errors.AppException
import site.kapinda.courier.core.session.Session
import site.kapinda.courier.core.session.SessionStore
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Supabase Auth (GoTrue), PostgREST, RPC, Edge Functions ve Storage için ince istemci.
 * Yetkilendirme sunucuda (RLS + SECURITY DEFINER RPC) yapılır; istemci yalnız kullanıcının JWT'sini taşır.
 */
@Singleton
class SupabaseClient @Inject constructor(
    private val http: OkHttpClient,
    private val sessions: SessionStore,
) {
    val json = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true }
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val refreshMutex = Mutex()

    @Volatile var onSessionInvalid: (() -> Unit)? = null

    private fun requireConfigured() {
        if (!SupabaseConfig.isConfigured) throw AppException("KPD_NOT_CONFIGURED")
    }

    private fun base(path: String): Request.Builder = Request.Builder()
        .url(SupabaseConfig.url + path)
        .header("apikey", SupabaseConfig.anonKey)
        .header("X-Client-Info", "kapinda-courier-android")

    // ------------------------------------------------------------------ Auth
    suspend fun signIn(email: String, password: String): Session = withContext(Dispatchers.IO) {
        requireConfigured()
        val body = buildJsonObject { put("email", email.trim().lowercase()); put("password", password) }
        val req = base("/auth/v1/token?grant_type=password").post(body.toString().toRequestBody(jsonType)).build()
        executeRaw(req).use { res ->
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) {
                val msg = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull()
                val code = (msg?.get("error_code") ?: msg?.get("error"))?.jsonPrimitive?.contentOrNull.orEmpty()
                throw AppException(
                    when {
                        code.contains("email_not_confirmed") -> "KPD_EMAIL_NOT_CONFIRMED"
                        res.code == 400 || code.contains("invalid") -> "KPD_INVALID_CREDENTIALS"
                        res.code == 429 -> "KPD_RATE_LIMITED"
                        else -> "KPD_INTERNAL"
                    },
                )
            }
            parseSession(json.parseToJsonElement(text).jsonObject).also(sessions::save)
        }
    }

    private fun parseSession(o: JsonObject): Session {
        val user = o["user"]!!.jsonObject
        return Session(
            accessToken = o["access_token"]!!.jsonPrimitive.content,
            refreshToken = o["refresh_token"]!!.jsonPrimitive.content,
            expiresAtEpochSec = o["expires_at"]?.jsonPrimitive?.long ?: (System.currentTimeMillis() / 1000 + (o["expires_in"]?.jsonPrimitive?.long ?: 3600)),
            userId = user["id"]!!.jsonPrimitive.content,
            email = user["email"]?.jsonPrimitive?.contentOrNull,
        )
    }

    suspend fun accessToken(forceRefresh: Boolean = false): String = refreshMutex.withLock {
        val s = sessions.load() ?: throw AppException("KPD_AUTH_REQUIRED")
        val now = System.currentTimeMillis() / 1000
        if (!forceRefresh && s.expiresAtEpochSec - now > 60) return s.accessToken
        withContext(Dispatchers.IO) {
            val body = buildJsonObject { put("refresh_token", s.refreshToken) }
            val req = base("/auth/v1/token?grant_type=refresh_token").post(body.toString().toRequestBody(jsonType)).build()
            executeRaw(req).use { res ->
                val text = res.body?.string().orEmpty()
                if (!res.isSuccessful) {
                    if (res.code in 400..499) {
                        sessions.clear()
                        onSessionInvalid?.invoke()
                        throw AppException("KPD_AUTH_REQUIRED")
                    }
                    throw AppException("KPD_INTERNAL")
                }
                parseSession(json.parseToJsonElement(text).jsonObject).also(sessions::save).accessToken
            }
        }
    }

    suspend fun signOut() = withContext(Dispatchers.IO) {
        val token = sessions.load()?.accessToken
        if (token != null && SupabaseConfig.isConfigured) {
            runCatching {
                executeRaw(base("/auth/v1/logout").header("Authorization", "Bearer $token").post(ByteArray(0).toRequestBody()).build()).close()
            }
        }
        sessions.clear()
    }

    fun currentSession(): Session? = sessions.load()

    // ------------------------------------------------------------------ Data
    suspend fun rpc(name: String, args: JsonObject = JsonObject(emptyMap())): JsonElement =
        authed { token -> base("/rest/v1/rpc/$name").header("Authorization", "Bearer $token").post(args.toString().toRequestBody(jsonType)).build() }

    /** PostgREST GET. query: "select=...&status=eq.x" */
    suspend fun select(table: String, query: String): JsonElement =
        authed { token -> base("/rest/v1/$table?$query").header("Authorization", "Bearer $token").get().build() }

    suspend fun function(name: String, body: JsonObject): JsonElement =
        authed { token -> base("/functions/v1/$name").header("Authorization", "Bearer $token").post(body.toString().toRequestBody(jsonType)).build() }

    suspend fun upload(bucket: String, path: String, bytes: ByteArray, contentType: String): Unit {
        authed { token ->
            base("/storage/v1/object/$bucket/$path")
                .header("Authorization", "Bearer $token")
                .header("x-upsert", "false")
                .post(bytes.toRequestBody(contentType.toMediaType()))
                .build()
        }
    }

    private suspend fun authed(build: (String) -> Request): JsonElement {
        requireConfigured()
        var token = accessToken()
        repeat(2) { attempt ->
            val result = withContext(Dispatchers.IO) {
                executeRaw(build(token)).use { res -> res.code to res.body?.string().orEmpty() }
            }
            val (code, text) = result
            if (code == 401 && attempt == 0) {
                token = accessToken(forceRefresh = true)
                return@repeat
            }
            if (code in 200..299) return if (text.isBlank()) JsonNull else json.parseToJsonElement(text)
            throw mapError(code, text)
        }
        throw AppException("KPD_AUTH_REQUIRED")
    }

    private fun mapError(status: Int, text: String): AppException {
        val o = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull()
        // Edge Function biçimi: {"error":{"code":"KPD_..."}}
        val fnCode = runCatching { o?.get("error")?.jsonObject?.get("code")?.jsonPrimitive?.contentOrNull }.getOrNull()
        val message = fnCode ?: o?.get("message")?.jsonPrimitive?.contentOrNull.orEmpty()
        val hint = o?.get("hint")?.jsonPrimitive?.contentOrNull
        if (Regex("^KPD_[A-Z_]+$").matches(message)) return AppException(message, hint)
        val pgCode = o?.get("code")?.jsonPrimitive?.contentOrNull
        return AppException(
            when {
                pgCode == "23505" -> "KPD_DUPLICATE"
                pgCode == "42501" || status == 403 -> "KPD_FORBIDDEN"
                status == 401 -> "KPD_AUTH_REQUIRED"
                status == 404 -> "KPD_NOT_FOUND"
                status == 429 -> "KPD_RATE_LIMITED"
                else -> "KPD_INTERNAL"
            },
        )
    }

    private fun executeRaw(req: Request): Response = try {
        http.newCall(req).execute()
    } catch (e: IOException) {
        throw AppException("KPD_NETWORK", cause = e)
    }

    @Suppress("unused")
    private fun emptyBody(): RequestBody = ByteArray(0).toRequestBody()
}
