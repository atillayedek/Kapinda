package site.kapinda.courier.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import site.kapinda.courier.data.CourierApplication
import site.kapinda.courier.data.CourierProfile
import site.kapinda.courier.ui.viewmodel.LoginViewModel

@Composable
fun SplashScreen() {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Kapında Kurye", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.ExtraBold)
        CircularProgressIndicator(Modifier.padding(top = 24.dp))
    }
}

@Composable
fun LoginScreen(onLoggedIn: () -> Unit, vm: LoginViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Text("Kapında Kurye", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.ExtraBold)
        Text("Onaylı kurye hesabınızla giriş yapın.", modifier = Modifier.padding(top = 4.dp, bottom = 24.dp))
        OutlinedTextField(email, { email = it }, label = { Text("E-posta") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next))
        OutlinedTextField(password, { password = it }, label = { Text("Şifre") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done))
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 12.dp)) }
        Button(onClick = { vm.login(email, password, onLoggedIn) }, enabled = !state.busy, modifier = Modifier.fillMaxWidth().padding(top = 20.dp)) {
            Text(if (state.busy) "Giriş yapılıyor…" else "Giriş yap")
        }
        Text("Kurye başvurusu ve şifre işlemleri için kapinda.site adresini kullanın.", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 16.dp))
    }
}

@Composable
fun MessageScreen(title: String, body: String, primary: Pair<String, () -> Unit>? = null, secondary: Pair<String, () -> Unit>? = null) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(body, modifier = Modifier.padding(top = 12.dp))
        primary?.let { (label, action) -> Button(onClick = action, modifier = Modifier.fillMaxWidth().padding(top = 24.dp)) { Text(label) } }
        secondary?.let { (label, action) -> OutlinedButton(onClick = action, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text(label) } }
    }
}

@Composable
fun ApprovalScreen(application: CourierApplication?, inactive: CourierProfile?, onRefresh: () -> Unit, onSignOut: () -> Unit) {
    val (title, body) = when {
        inactive?.status == "suspended" -> "Hesabınız askıya alındı" to "Kurye hesabınız yönetim tarafından askıya alındı. Destek: destek@kapinda.site"
        inactive != null -> "Onay bekleniyor" to "Kurye hesabınız henüz aktif değil."
        application?.status == "pending" -> "Başvurunuz inceleniyor" to "Kurye başvurunuz onaylandığında bu ekrandan görev almaya başlayabilirsiniz."
        application?.status == "rejected" -> "Başvurunuz onaylanmadı" to (application.reviewNote ?: "Ayrıntılar için destek ekibiyle iletişime geçin.")
        else -> "Kurye hesabı bulunamadı" to "Bu hesap için kurye kaydı yok. kapinda.site/kurye-basvurusu adresinden başvurabilirsiniz."
    }
    MessageScreen(title, body, "Durumu yenile" to onRefresh, "Çıkış yap" to onSignOut)
}
