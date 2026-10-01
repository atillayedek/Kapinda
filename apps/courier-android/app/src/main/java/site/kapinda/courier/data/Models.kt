package site.kapinda.courier.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class CourierProfile(
    val id: String,
    @SerialName("display_name") val displayName: String,
    val phone: String,
    @SerialName("vehicle_type") val vehicleType: String,
    @SerialName("vehicle_plate") val vehiclePlate: String? = null,
    val status: String,
    val availability: String,
    @SerialName("max_active_orders") val maxActiveOrders: Int,
    @SerialName("active_order_count") val activeOrderCount: Int,
    @SerialName("rating_avg") val ratingAvg: Double = 0.0,
    @SerialName("rating_count") val ratingCount: Int = 0,
)

@Serializable
data class CourierApplication(val status: String, @SerialName("review_note") val reviewNote: String? = null)

@Serializable
data class PoolOrder(
    @SerialName("order_id") val orderId: String,
    @SerialName("order_number") val orderNumber: String,
    val status: String,
    @SerialName("vendor_name") val vendorName: String,
    @SerialName("vendor_address") val vendorAddress: String,
    @SerialName("vendor_lat") val vendorLat: Double? = null,
    @SerialName("vendor_lng") val vendorLng: Double? = null,
    @SerialName("destination_neighborhood") val destinationNeighborhood: String? = null,
    @SerialName("destination_lat") val destinationLat: Double? = null,
    @SerialName("destination_lng") val destinationLng: Double? = null,
    @SerialName("distance_km") val distanceKm: Double,
    @SerialName("item_count") val itemCount: Int,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class VendorRef(val name: String, val phone: String? = null, @SerialName("address_text") val addressText: String? = null, val lat: Double? = null, val lng: Double? = null)

@Serializable
data class ActiveOrder(
    val id: String,
    @SerialName("order_number") val orderNumber: String,
    val status: String,
    @SerialName("customer_name") val customerName: String,
    @SerialName("customer_phone") val customerPhone: String,
    @SerialName("delivery_address") val deliveryAddress: JsonObject,
    @SerialName("delivery_lat") val deliveryLat: Double,
    @SerialName("delivery_lng") val deliveryLng: Double,
    @SerialName("product_subtotal") val productSubtotal: Double,
    @SerialName("product_payment_method") val productPaymentMethod: String,
    @SerialName("item_count") val itemCount: Int,
    @SerialName("distance_km") val distanceKm: Double,
    @SerialName("customer_note") val customerNote: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("delivered_at") val deliveredAt: String? = null,
    @SerialName("delivery_fee") val deliveryFee: Double = 0.0,
    val vendors: VendorRef? = null,
)

@Serializable
data class OrderItemRow(
    val id: String,
    @SerialName("product_name") val productName: String,
    val quantity: Int,
    val unit: String,
    @SerialName("line_total") val lineTotal: Double,
    val fulfillment: String,
)

@Serializable
data class Earnings(
    @SerialName("delivered_count") val deliveredCount: Int,
    @SerialName("delivery_fee_total") val deliveryFeeTotal: Double,
    @SerialName("distance_km_total") val distanceKmTotal: Double,
    @SerialName("rating_avg") val ratingAvg: Double,
    @SerialName("rating_count") val ratingCount: Int,
)

@Serializable
data class IncidentRow(
    val id: String,
    @SerialName("incident_type") val incidentType: String,
    val description: String? = null,
    val status: String,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class NotificationRow(
    val id: String,
    val type: String,
    val title: String,
    val body: String,
    @SerialName("read_at") val readAt: String? = null,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class QrVerifyResult(val result: String, @SerialName("order_id") val orderId: String? = null, @SerialName("order_number") val orderNumber: String? = null)

fun ActiveOrder.addressLine(): String {
    fun f(k: String) = deliveryAddress[k]?.toString()?.trim('"')?.takeIf { it.isNotBlank() && it != "null" }
    return listOfNotNull(
        f("neighborhood"), f("street"), f("building")?.let { "No: $it" }, f("apartment"),
        f("floor")?.let { "Kat $it" }, f("door_number")?.let { "Daire $it" },
    ).joinToString(", ")
}

fun ActiveOrder.directions(): String? = deliveryAddress["directions"]?.toString()?.trim('"')?.takeIf { it.isNotBlank() && it != "null" }
