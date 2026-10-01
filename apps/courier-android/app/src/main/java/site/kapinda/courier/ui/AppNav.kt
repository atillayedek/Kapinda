package site.kapinda.courier.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import site.kapinda.courier.ui.screens.ApprovalScreen
import site.kapinda.courier.ui.screens.EarningsScreen
import site.kapinda.courier.ui.screens.HistoryScreen
import site.kapinda.courier.ui.screens.HomeScreen
import site.kapinda.courier.ui.screens.IncidentsScreen
import site.kapinda.courier.ui.screens.LoginScreen
import site.kapinda.courier.ui.screens.MapScreen
import site.kapinda.courier.ui.screens.MessageScreen
import site.kapinda.courier.ui.screens.NotificationsScreen
import site.kapinda.courier.ui.screens.ProfileScreen
import site.kapinda.courier.ui.screens.ScanScreen
import site.kapinda.courier.ui.screens.SplashScreen
import site.kapinda.courier.ui.screens.TaskScreen
import site.kapinda.courier.ui.viewmodel.Gate
import site.kapinda.courier.ui.viewmodel.SessionViewModel

@Composable
fun KapindaCourierApp(initialOrderId: String?, session: SessionViewModel = hiltViewModel()) {
    val gate by session.gate.collectAsStateWithLifecycle()
    when (val g = gate) {
        Gate.Loading -> SplashScreen()
        Gate.NotConfigured -> MessageScreen("Yapılandırma eksik", "Uygulama Supabase bağlantı bilgileri olmadan derlenmiş. Yönetici ile iletişime geçin.")
        Gate.SignedOut -> LoginScreen(onLoggedIn = { session.refresh() })
        is Gate.NotCourier -> ApprovalScreen(g.application, null, { session.refresh() }, { session.signOut() })
        is Gate.Inactive -> ApprovalScreen(null, g.profile, { session.refresh() }, { session.signOut() })
        is Gate.Error -> MessageScreen("Bağlantı sorunu", g.message, "Tekrar dene" to { session.refresh() }, "Çıkış yap" to { session.signOut() })
        is Gate.Ready -> MainScaffold(g, initialOrderId, session)
    }
}

private data class Tab(val route: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)
private val tabs = listOf(
    Tab("home", "Görevler", Icons.Default.LocalShipping),
    Tab("pool", "Havuz", Icons.Default.Inbox),
    Tab("history", "Geçmiş", Icons.Default.History),
    Tab("earnings", "Kazanç", Icons.Default.Payments),
    Tab("profile", "Profil", Icons.Default.Person),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainScaffold(gate: Gate.Ready, initialOrderId: String?, session: SessionViewModel) {
    val nav = rememberNavController()
    val snackbar = remember { SnackbarHostState() }
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val isTab = tabs.any { it.route == route }
    LaunchedEffect(initialOrderId) { initialOrderId?.let { nav.navigate("task/$it") } }
    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text(titleFor(route)) },
                navigationIcon = { if (!isTab) IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } },
                actions = { IconButton(onClick = { nav.navigate("incidents") }) { Icon(Icons.Default.Warning, "Acil durum", tint = MaterialTheme.colorScheme.error) } },
            )
        },
        bottomBar = {
            if (isTab) NavigationBar {
                tabs.forEach { t ->
                    NavigationBarItem(selected = route == t.route, onClick = {
                        nav.navigate(t.route) { popUpTo(nav.graph.findStartDestination().id) { saveState = true }; launchSingleTop = true; restoreState = true }
                    }, icon = { Icon(t.icon, null) }, label = { Text(t.label) })
                }
            }
        },
    ) { padding ->
        NavHost(nav, startDestination = "home", modifier = Modifier.padding(padding)) {
            composable("home") { HomeScreen(onOpenTask = { nav.navigate("task/$it") }, snackbar = snackbar, showPool = false) }
            composable("pool") { HomeScreen(onOpenTask = { nav.navigate("task/$it") }, snackbar = snackbar, showPool = true) }
            composable("history") { HistoryScreen(onOpen = { nav.navigate("task/$it") }) }
            composable("earnings") { EarningsScreen() }
            composable("profile") {
                ProfileScreen(gate.profile, session.email, onIncidents = { nav.navigate("incidents") }, onNotifications = { nav.navigate("notifications") }, onSignOut = { session.signOut() })
            }
            composable("task/{orderId}") { TaskScreen(onScan = { nav.navigate("scan/$it") }, onMap = { nav.navigate("map/$it") }, snackbar = snackbar) }
            composable("map/{orderId}") { MapScreen() }
            composable("scan/{orderId}") { ScanScreen(onDone = { nav.popBackStack("home", inclusive = false) }) }
            composable("incidents") { IncidentsScreen(snackbar) }
            composable("notifications") { NotificationsScreen() }
        }
    }
}

private fun titleFor(route: String?): String = when {
    route == null -> "Kapında Kurye"
    route.startsWith("task") -> "Görev"
    route.startsWith("map") -> "Harita"
    route.startsWith("scan") -> "QR okut"
    route == "incidents" -> "Acil durum"
    route == "notifications" -> "Bildirimler"
    else -> tabs.firstOrNull { it.route == route }?.label ?: "Kapında Kurye"
}

