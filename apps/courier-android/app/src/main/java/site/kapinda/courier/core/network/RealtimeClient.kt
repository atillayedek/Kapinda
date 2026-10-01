package site.kapinda.courier.core.network

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Inject
import javax.inject.Singleton

data class RealtimeChange(val table: String, val type: String, val record: JsonObject?)

/**
 * Supabase Realtime (Phoenix protokolü). postgres_changes yalnız RLS'in kullanıcıya izin verdiği satırları iletir;
 * kanal kurye oturumuna özeldir. Bağlantı koparsa üstel geri çekilme ile yeniden bağlanır.
 */
@Singleton
class RealtimeClient @Inject constructor(
    private val http: OkHttpClient,
    private val supabase: SupabaseClient,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val ref = AtomicInteger(1)
    private var socket: WebSocket? = null
    private var heartbeat: Job? = null
    private var tables: List<String> = emptyList()
    private var wanted = false
    private var backoffMs = 1000L

    private val _changes = MutableSharedFlow<RealtimeChange>(extraBufferCapacity = 64)
    val changes: SharedFlow<RealtimeChange> = _changes

    fun start(tables: List<String>) {
        if (!SupabaseConfig.isConfigured) return
        this.tables = tables
        wanted = true
        if (socket == null) connect()
    }

    fun stop() {
        wanted = false
        heartbeat?.cancel()
        socket?.close(1000, "stop")
        socket = null
    }

    private fun connect() = scope.launch {
        val token = runCatching { supabase.accessToken() }.getOrNull() ?: return@launch
        val wsUrl = SupabaseConfig.url.replaceFirst("https://", "wss://") + "/realtime/v1/websocket?apikey=${SupabaseConfig.anonKey}&vsn=1.0.0"
        socket = http.newWebSocket(Request.Builder().url(wsUrl).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: okhttp3.Response) {
                backoffMs = 1000L
                val join = buildJsonObject {
                    put("topic", "realtime:courier")
                    put("event", "phx_join")
                    putJsonObject("payload") {
                        putJsonObject("config") {
                            putJsonArray("postgres_changes") {
                                tables.forEach { t -> add(buildJsonObject { put("event", "*"); put("schema", "public"); put("table", t) }) }
                            }
                        }
                        put("access_token", token)
                    }
                    put("ref", ref.getAndIncrement().toString())
                }
                webSocket.send(join.toString())
                heartbeat?.cancel()
                heartbeat = scope.launch {
                    while (isActive) {
                        delay(25_000)
                        webSocket.send("""{"topic":"phoenix","event":"heartbeat","payload":{},"ref":"${ref.getAndIncrement()}"}""")
                        // Token yenilendiyse kanala bildir
                        runCatching { supabase.accessToken() }.getOrNull()?.let { t ->
                            webSocket.send(buildJsonObject {
                                put("topic", "realtime:courier"); put("event", "access_token")
                                putJsonObject("payload") { put("access_token", t) }; put("ref", ref.getAndIncrement().toString())
                            }.toString())
                        }
                    }
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val msg = runCatching { supabase.json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return
                if (msg["event"]?.jsonPrimitive?.contentOrNull != "postgres_changes") return
                val data = msg["payload"]?.jsonObject?.get("data")?.jsonObject ?: return
                _changes.tryEmit(
                    RealtimeChange(
                        table = data["table"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                        type = data["type"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                        record = data["record"] as? JsonObject,
                    ),
                )
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: okhttp3.Response?) = reconnect()
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = reconnect()
        })
    }

    private fun reconnect() {
        heartbeat?.cancel()
        socket = null
        if (!wanted) return
        scope.launch {
            delay(backoffMs)
            backoffMs = (backoffMs * 2).coerceAtMost(60_000)
            if (wanted && socket == null) connect()
        }
    }
}
