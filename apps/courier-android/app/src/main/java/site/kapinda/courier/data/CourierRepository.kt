package site.kapinda.courier.data

import android.os.Build
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import site.kapinda.courier.BuildConfig
import site.kapinda.courier.core.errors.AppException
import site.kapinda.courier.core.network.SupabaseClient
import site.kapinda.courier.core.session.SessionStore
import java.net.URLEncoder
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

/** Tüm kurye işlemleri sunucu RPC'leriyle yapılır; durum, atama ve teslimat yetkisi sunucuda doğrulanır. */
@Singleton
class CourierRepository @Inject constructor(
    private val api: SupabaseClient,
    private val sessions: SessionStore,
) {
    private val json get() = api.json

    suspend fun signIn(email: String, password: String) = api.signIn(email, password)

    suspend fun signOut() {
        sessions.fcmToken?.let { token -> runCatching { api.rpc("revoke_device_token", buildJsonObject { put("p_token", token) }) } }
        api.signOut()
    }

    fun isSignedIn() = api.currentSession() != null
    fun currentEmail() = api.currentSession()?.email

    suspend fun hasCourierRole(): Boolean {
        val uid = api.currentSession()?.userId ?: return false
        val rows = api.select("user_roles", "select=role&user_id=eq.${enc(uid)}&role=eq.courier")
        return json.decodeFromJsonElement(ListSerializer(kotlinx.serialization.json.JsonObject.serializer()), rows).isNotEmpty()
    }

    suspend fun profile(): CourierProfile? {
        val uid = api.currentSession()?.userId ?: throw AppException("KPD_AUTH_REQUIRED")
        val rows = api.select(
            "couriers",
            "select=id,display_name,phone,vehicle_type,vehicle_plate,status,availability,max_active_orders,active_order_count,rating_avg,rating_count&user_id=eq.${enc(uid)}",
        )
        return json.decodeFromJsonElement(ListSerializer(CourierProfile.serializer()), rows).firstOrNull()
    }

    suspend fun latestApplication(): CourierApplication? {
        val uid = api.currentSession()?.userId ?: return null
        val rows = api.select("courier_applications", "select=status,review_note&applicant_user_id=eq.${enc(uid)}&order=created_at.desc&limit=1")
        return json.decodeFromJsonElement(ListSerializer(CourierApplication.serializer()), rows).firstOrNull()
    }

    suspend fun setOnline(online: Boolean): String =
        api.rpc("courier_set_online", buildJsonObject { put("p_online", online) }).jsonPrimitive.content

    suspend fun pool(): List<PoolOrder> =
        json.decodeFromJsonElement(ListSerializer(PoolOrder.serializer()), api.rpc("courier_available_orders"))

    suspend fun accept(orderId: String) = api.rpc("courier_accept_order", buildJsonObject { put("p_order_id", orderId) })

    suspend fun release(orderId: String, reason: String) =
        api.rpc("courier_release_order", buildJsonObject { put("p_order_id", orderId); put("p_reason", reason) })

    suspend fun updateStatus(orderId: String, to: String) =
        api.rpc("courier_update_order_status", buildJsonObject { put("p_order_id", orderId); put("p_to", to) })

    private val orderCols = "id,order_number,status,customer_name,customer_phone,delivery_address,delivery_lat,delivery_lng,product_subtotal," +
        "product_payment_method,item_count,distance_km,customer_note,created_at,delivered_at,delivery_fee,vendors(name,phone,address_text,lat,lng)"

    /** RLS: kurye yalnız kendisine atanmış siparişleri görür. */
    suspend fun activeOrders(): List<ActiveOrder> {
        val rows = api.select("orders", "select=${enc(orderCols)}&status=not.in.(delivered,cancelled,rejected,failed)&order=created_at.asc")
        return json.decodeFromJsonElement(ListSerializer(ActiveOrder.serializer()), rows)
    }

    suspend fun order(id: String): ActiveOrder? {
        val rows = api.select("orders", "select=${enc(orderCols)}&id=eq.${enc(id)}")
        return json.decodeFromJsonElement(ListSerializer(ActiveOrder.serializer()), rows).firstOrNull()
    }

    suspend fun items(orderId: String): List<OrderItemRow> {
        val rows = api.select("order_items", "select=id,product_name,quantity,unit,line_total,fulfillment&order_id=eq.${enc(orderId)}")
        return json.decodeFromJsonElement(ListSerializer(OrderItemRow.serializer()), rows)
    }

    suspend fun history(limit: Int = 50, offset: Int = 0): List<ActiveOrder> {
        val rows = api.select("orders", "select=${enc(orderCols)}&status=eq.delivered&order=delivered_at.desc&limit=$limit&offset=$offset")
        return json.decodeFromJsonElement(ListSerializer(ActiveOrder.serializer()), rows)
    }

    suspend fun earnings(from: Instant, to: Instant): Earnings =
        json.decodeFromJsonElement(Earnings.serializer(), api.rpc("courier_earnings_summary", buildJsonObject { put("p_from", from.toString()); put("p_to", to.toString()) }))

    suspend fun updateLocation(lat: Double, lng: Double, accuracy: Float?, heading: Float?, speed: Float?): Boolean =
        api.rpc("courier_update_location", buildJsonObject {
            put("p_lat", lat); put("p_lng", lng)
            if (accuracy != null) put("p_accuracy", accuracy) else put("p_accuracy", JsonNull)
            if (heading != null) put("p_heading", heading) else put("p_heading", JsonNull)
            if (speed != null) put("p_speed", speed) else put("p_speed", JsonNull)
        }).jsonPrimitive.content.toBoolean()

    suspend fun reportIncident(type: String, description: String?, lat: Double?, lng: Double?): String =
        api.rpc("courier_report_incident", buildJsonObject {
            put("p_type", type)
            put("p_description", description)
            put("p_lat", lat); put("p_lng", lng)
        }).jsonPrimitive.content

    suspend fun incidents(): List<IncidentRow> {
        val rows = api.select("courier_incidents", "select=id,incident_type,description,status,created_at&order=created_at.desc&limit=30")
        return json.decodeFromJsonElement(ListSerializer(IncidentRow.serializer()), rows)
    }

    /** QR doğrulaması: HMAC ve süre Edge Function'da, atomik tüketim ve delivered geçişi veritabanında. */
    suspend fun verifyQr(qr: String, lat: Double?, lng: Double?): QrVerifyResult =
        json.decodeFromJsonElement(QrVerifyResult.serializer(), api.function("verify-delivery-qr", buildJsonObject {
            put("qr", qr)
            put("lat", lat); put("lng", lng)
            putJsonObject("device") {
                put("model", "${Build.MANUFACTURER} ${Build.MODEL}".take(80))
                put("os", "Android ${Build.VERSION.RELEASE}")
                put("app_version", BuildConfig.VERSION_NAME)
                put("device_id", sessions.deviceId)
            }
        }))

    /** Opsiyonel teslimat fotoğrafı: private bucket + RPC kaydı. QR'ın yerine geçmez. */
    suspend fun uploadProof(orderId: String, courierId: String, jpeg: ByteArray, lat: Double?, lng: Double?) {
        if (jpeg.size > 5 * 1024 * 1024) throw AppException("KPD_INVALID_INPUT")
        val path = "$orderId/$courierId/${UUID.randomUUID()}.jpg"
        try {
            api.upload("delivery-proofs", path, jpeg, "image/jpeg")
        } catch (e: AppException) {
            throw AppException("KPD_STORAGE_UPLOAD_FAILED", cause = e)
        }
        api.rpc("courier_add_delivery_proof", buildJsonObject {
            put("p_order_id", orderId); put("p_storage_path", path); put("p_mime", "image/jpeg"); put("p_size", jpeg.size)
            put("p_lat", lat); put("p_lng", lng)
        })
    }

    suspend fun notifications(): List<NotificationRow> {
        val rows = api.select("notifications", "select=id,type,title,body,read_at,created_at&order=created_at.desc&limit=50")
        return json.decodeFromJsonElement(ListSerializer(NotificationRow.serializer()), rows)
    }

    suspend fun markNotificationsRead() = api.rpc("mark_notifications_read", buildJsonObject { put("p_ids", JsonNull) })

    suspend fun registerDeviceToken(token: String) {
        api.rpc("register_device_token", buildJsonObject {
            put("p_token", token); put("p_app", "courier"); put("p_platform", "android")
            put("p_device_id", sessions.deviceId); put("p_device_name", "${Build.MANUFACTURER} ${Build.MODEL}".take(200))
        })
        sessions.fcmToken = token
    }

    suspend fun logClientEvent(type: String, message: String) = runCatching {
        api.rpc("log_client_event", buildJsonObject {
            put("p_source", "courier_android"); put("p_type", type); put("p_severity", "warning"); put("p_message", message.take(900))
            putJsonObject("p_context") { put("app_version", BuildConfig.VERSION_NAME) }
        })
    }
}
