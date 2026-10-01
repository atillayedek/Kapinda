package site.kapinda.courier.ui.viewmodel

import android.annotation.SuppressLint
import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.firebase.messaging.FirebaseMessaging
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import site.kapinda.courier.KapindaApp
import site.kapinda.courier.core.errors.AppException
import site.kapinda.courier.core.errors.ErrorMessages
import site.kapinda.courier.core.network.RealtimeClient
import site.kapinda.courier.core.network.SupabaseConfig
import site.kapinda.courier.data.ActiveOrder
import site.kapinda.courier.data.CourierApplication
import site.kapinda.courier.data.CourierProfile
import site.kapinda.courier.data.CourierRepository
import site.kapinda.courier.data.Earnings
import site.kapinda.courier.data.IncidentRow
import site.kapinda.courier.data.NotificationRow
import site.kapinda.courier.data.OrderItemRow
import site.kapinda.courier.data.PoolOrder
import site.kapinda.courier.location.LocationTrackingService
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import javax.inject.Inject

/** Konum: tek seferlik, dengeli doğruluk; izin yoksa null döner. */
@SuppressLint("MissingPermission")
suspend fun currentLocation(app: Application): Pair<Double, Double>? = runCatching {
    val client = LocationServices.getFusedLocationProviderClient(app)
    withTimeoutOrNull(8_000) {
        client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token).await()
    }?.let { it.latitude to it.longitude }
}.getOrNull()

sealed interface Gate {
    data object Loading : Gate
    data object NotConfigured : Gate
    data object SignedOut : Gate
    data class NotCourier(val application: CourierApplication?) : Gate
    data class Inactive(val profile: CourierProfile) : Gate
    data class Ready(val profile: CourierProfile) : Gate
    data class Error(val message: String) : Gate
}

@HiltViewModel
class SessionViewModel @Inject constructor(
    private val repo: CourierRepository,
    private val realtime: RealtimeClient,
    app: Application,
) : AndroidViewModel(app) {
    private val _gate = MutableStateFlow<Gate>(Gate.Loading)
    val gate: StateFlow<Gate> = _gate.asStateFlow()
    val email: String? get() = repo.currentEmail()

    init { refresh() }

    fun refresh() = viewModelScope.launch {
        _gate.value = Gate.Loading
        _gate.value = when {
            !SupabaseConfig.isConfigured -> Gate.NotConfigured
            !repo.isSignedIn() -> Gate.SignedOut
            else -> try {
                val profile = repo.profile()
                when {
                    profile == null || !repo.hasCourierRole() -> Gate.NotCourier(repo.latestApplication())
                    profile.status != "active" -> Gate.Inactive(profile)
                    else -> {
                        registerPush()
                        realtime.start(listOf("orders", "notifications"))
                        Gate.Ready(profile)
                    }
                }
            } catch (e: AppException) {
                if (e.code == "KPD_AUTH_REQUIRED") Gate.SignedOut else Gate.Error(ErrorMessages.of(e))
            }
        }
    }

    private fun registerPush() = viewModelScope.launch {
        if (!KapindaApp.firebaseReady(getApplication())) return@launch
        runCatching {
            val token = FirebaseMessaging.getInstance().token.await()
            repo.registerDeviceToken(token)
        }.onFailure { repo.logClientEvent("fcm_failure", "token_register_failed") }
    }

    fun signOut() = viewModelScope.launch {
        LocationTrackingService.stop(getApplication())
        realtime.stop()
        runCatching { repo.signOut() }
        _gate.value = Gate.SignedOut
    }
}

data class LoginState(val busy: Boolean = false, val error: String? = null)

@HiltViewModel
class LoginViewModel @Inject constructor(private val repo: CourierRepository) : ViewModel() {
    private val _state = MutableStateFlow(LoginState())
    val state: StateFlow<LoginState> = _state.asStateFlow()

    fun login(email: String, password: String, onSuccess: () -> Unit) = viewModelScope.launch {
        if (email.isBlank() || password.isBlank()) {
            _state.value = LoginState(error = "E-posta ve şifre zorunludur.")
            return@launch
        }
        _state.value = LoginState(busy = true)
        runCatching { repo.signIn(email, password) }
            .onSuccess { _state.value = LoginState(); onSuccess() }
            .onFailure { _state.value = LoginState(error = ErrorMessages.of(it)) }
    }
}

data class HomeState(
    val loading: Boolean = true,
    val profile: CourierProfile? = null,
    val active: List<ActiveOrder> = emptyList(),
    val pool: List<PoolOrder> = emptyList(),
    val busy: Boolean = false,
    val error: String? = null,
    val message: String? = null,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val repo: CourierRepository,
    private val realtime: RealtimeClient,
    app: Application,
) : AndroidViewModel(app) {
    private val _state = MutableStateFlow(HomeState())
    val state: StateFlow<HomeState> = _state.asStateFlow()
    private var poller: Job? = null

    init {
        refresh()
        viewModelScope.launch { realtime.changes.collect { if (it.table == "orders") refresh(silent = true) } }
        poller = viewModelScope.launch {
            while (isActive) {
                delay(20_000)
                if (_state.value.profile?.availability in setOf("available", "busy")) refresh(silent = true)
            }
        }
    }

    fun refresh(silent: Boolean = false) = viewModelScope.launch {
        if (!silent) _state.update { it.copy(loading = true, error = null) }
        runCatching {
            val profile = repo.profile()
            val active = repo.activeOrders()
            val pool = if (profile?.availability in setOf("available", "busy")) repo.pool() else emptyList()
            Triple(profile, active, pool)
        }.onSuccess { (profile, active, pool) ->
            _state.update { it.copy(loading = false, profile = profile, active = active, pool = pool, error = null) }
            syncTracking(active)
        }.onFailure { e -> _state.update { it.copy(loading = false, error = ErrorMessages.of(e)) } }
    }

    /** Konum servisi yalnız kuryeye atanmış aktif teslimat varken çalışır. */
    private fun syncTracking(active: List<ActiveOrder>) {
        val needs = active.any { it.status in setOf("courier_assigned", "picked_up", "on_the_way") }
        if (needs) LocationTrackingService.start(getApplication()) else LocationTrackingService.stop(getApplication())
    }

    fun setOnline(online: Boolean) = act { repo.setOnline(online); if (online) "Çevrimiçisiniz." else "Çevrimdışısınız. Yeni görev almazsınız." }

    fun accept(orderId: String) = act { repo.accept(orderId); "Görev size atandı." }

    private fun act(block: suspend () -> String) = viewModelScope.launch {
        _state.update { it.copy(busy = true, message = null) }
        runCatching { block() }
            .onSuccess { msg -> _state.update { it.copy(busy = false, message = msg) }; refresh(silent = true) }
            .onFailure { e -> _state.update { it.copy(busy = false, message = ErrorMessages.of(e)) }; refresh(silent = true) }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }
}

data class TaskState(
    val loading: Boolean = true,
    val order: ActiveOrder? = null,
    val items: List<OrderItemRow> = emptyList(),
    val busy: Boolean = false,
    val message: String? = null,
    val delivered: Boolean = false,
)

@HiltViewModel
class TaskViewModel @Inject constructor(
    private val repo: CourierRepository,
    private val realtime: RealtimeClient,
    savedState: SavedStateHandle,
    app: Application,
) : AndroidViewModel(app) {
    val orderId: String = checkNotNull(savedState["orderId"])
    private val _state = MutableStateFlow(TaskState())
    val state: StateFlow<TaskState> = _state.asStateFlow()

    init {
        load()
        viewModelScope.launch { realtime.changes.collect { if (it.table == "orders" && it.record?.get("id")?.toString()?.trim('"') == orderId) load() } }
    }

    fun load() = viewModelScope.launch {
        runCatching { repo.order(orderId) to repo.items(orderId) }
            .onSuccess { (o, items) -> _state.update { it.copy(loading = false, order = o, items = items, delivered = o?.status == "delivered") } }
            .onFailure { e -> _state.update { it.copy(loading = false, message = ErrorMessages.of(e)) } }
    }

    fun pickedUp() = act("Sipariş teslim alındı.") { repo.updateStatus(orderId, "picked_up") }
    fun onTheWay() = act("Yola çıktınız. Müşteri bilgilendirildi.") { repo.updateStatus(orderId, "on_the_way") }
    fun release(reason: String) = act("Görev havuza bırakıldı.") { repo.release(orderId, reason) }

    fun uploadProof(jpeg: ByteArray) = viewModelScope.launch {
        val courierId = repo.profile()?.id ?: return@launch
        _state.update { it.copy(busy = true) }
        val loc = currentLocation(getApplication())
        runCatching { repo.uploadProof(orderId, courierId, jpeg, loc?.first, loc?.second) }
            .onSuccess { _state.update { it.copy(busy = false, message = "Teslimat fotoğrafı kaydedildi.") } }
            .onFailure { e ->
                repo.logClientEvent("storage_failure", "delivery_proof_upload_failed")
                _state.update { it.copy(busy = false, message = ErrorMessages.of(e)) }
            }
    }

    private fun act(success: String, block: suspend () -> Unit) = viewModelScope.launch {
        _state.update { it.copy(busy = true, message = null) }
        runCatching { block() }
            .onSuccess { _state.update { it.copy(busy = false, message = success) } }
            .onFailure { e -> _state.update { it.copy(busy = false, message = ErrorMessages.of(e)) } }
        load()
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }
}

data class ScanState(val busy: Boolean = false, val error: String? = null, val deliveredOrderNumber: String? = null)

@HiltViewModel
class ScanViewModel @Inject constructor(private val repo: CourierRepository, app: Application) : AndroidViewModel(app) {
    private val _state = MutableStateFlow(ScanState())
    val state: StateFlow<ScanState> = _state.asStateFlow()

    fun verify(qr: String) {
        if (_state.value.busy || _state.value.deliveredOrderNumber != null) return
        viewModelScope.launch {
            _state.value = ScanState(busy = true)
            val loc = currentLocation(getApplication())
            runCatching { repo.verifyQr(qr, loc?.first, loc?.second) }
                .onSuccess { _state.value = ScanState(deliveredOrderNumber = it.orderNumber ?: "") }
                .onFailure { e -> _state.value = ScanState(error = ErrorMessages.of(e)) }
        }
    }

    fun reset() { _state.value = ScanState() }
}

data class HistoryState(val loading: Boolean = true, val items: List<ActiveOrder> = emptyList(), val error: String? = null, val canLoadMore: Boolean = true)

@HiltViewModel
class HistoryViewModel @Inject constructor(private val repo: CourierRepository) : ViewModel() {
    private val _state = MutableStateFlow(HistoryState())
    val state: StateFlow<HistoryState> = _state.asStateFlow()
    init { loadMore() }
    fun loadMore() = viewModelScope.launch {
        runCatching { repo.history(limit = 30, offset = _state.value.items.size) }
            .onSuccess { page -> _state.update { it.copy(loading = false, items = it.items + page, canLoadMore = page.size == 30) } }
            .onFailure { e -> _state.update { it.copy(loading = false, error = ErrorMessages.of(e)) } }
    }
}

data class EarningsState(val loading: Boolean = true, val today: Earnings? = null, val week: Earnings? = null, val month: Earnings? = null, val error: String? = null)

@HiltViewModel
class EarningsViewModel @Inject constructor(private val repo: CourierRepository) : ViewModel() {
    private val _state = MutableStateFlow(EarningsState())
    val state: StateFlow<EarningsState> = _state.asStateFlow()
    init { load() }
    fun load() = viewModelScope.launch {
        val zone = ZoneId.of("Europe/Istanbul")
        val startOfDay = Instant.now().atZone(zone).truncatedTo(ChronoUnit.DAYS).toInstant()
        val end = startOfDay.plus(1, ChronoUnit.DAYS)
        runCatching {
            Triple(repo.earnings(startOfDay, end), repo.earnings(startOfDay.minus(6, ChronoUnit.DAYS), end), repo.earnings(startOfDay.minus(29, ChronoUnit.DAYS), end))
        }.onSuccess { (d, w, m) -> _state.value = EarningsState(false, d, w, m) }
            .onFailure { e -> _state.value = EarningsState(false, error = ErrorMessages.of(e)) }
    }
}

data class IncidentState(val busy: Boolean = false, val items: List<IncidentRow> = emptyList(), val message: String? = null)

@HiltViewModel
class IncidentViewModel @Inject constructor(private val repo: CourierRepository, app: Application) : AndroidViewModel(app) {
    private val _state = MutableStateFlow(IncidentState())
    val state: StateFlow<IncidentState> = _state.asStateFlow()
    init { load() }
    fun load() = viewModelScope.launch { runCatching { repo.incidents() }.onSuccess { list -> _state.update { it.copy(items = list) } } }

    fun report(type: String, description: String?) = viewModelScope.launch {
        _state.update { it.copy(busy = true, message = null) }
        val loc = currentLocation(getApplication())
        runCatching { repo.reportIncident(type, description?.takeIf { it.isNotBlank() }, loc?.first, loc?.second) }
            .onSuccess { _state.update { it.copy(busy = false, message = "Bildiriminiz yönetime iletildi.") }; load() }
            .onFailure { e -> _state.update { it.copy(busy = false, message = ErrorMessages.of(e)) } }
    }
    fun consumeMessage() = _state.update { it.copy(message = null) }
}

data class NotificationsState(val loading: Boolean = true, val items: List<NotificationRow> = emptyList(), val error: String? = null)

@HiltViewModel
class NotificationsViewModel @Inject constructor(private val repo: CourierRepository) : ViewModel() {
    private val _state = MutableStateFlow(NotificationsState())
    val state: StateFlow<NotificationsState> = _state.asStateFlow()
    init { load() }
    fun load() = viewModelScope.launch {
        runCatching { repo.notifications() }
            .onSuccess { _state.value = NotificationsState(false, it) }
            .onFailure { e -> _state.value = NotificationsState(false, error = ErrorMessages.of(e)) }
    }
    fun markAllRead() = viewModelScope.launch { runCatching { repo.markNotificationsRead() }; load() }
}
