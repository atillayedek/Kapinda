package site.kapinda.courier

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.mutableStateOf
import dagger.hilt.android.AndroidEntryPoint
import site.kapinda.courier.ui.KapindaCourierApp
import site.kapinda.courier.ui.theme.KapindaTheme

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val orderId = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        orderId.value = intent?.getStringExtra(EXTRA_ORDER_ID)
        setContent { KapindaTheme { KapindaCourierApp(orderId.value) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_ORDER_ID)?.let { orderId.value = it }
    }

    companion object {
        const val EXTRA_ORDER_ID = "order_id"
    }
}
