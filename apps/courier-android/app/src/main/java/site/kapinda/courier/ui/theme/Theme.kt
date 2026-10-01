package site.kapinda.courier.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val KapindaGreen = Color(0xFF0F6B4F)
val KapindaSaffron = Color(0xFFF2A541)
val KapindaCream = Color(0xFFF6F4EF)
val KapindaRed = Color(0xFFC62828)

private val Light = lightColorScheme(
    primary = KapindaGreen, onPrimary = Color.White,
    secondary = KapindaSaffron, onSecondary = Color(0xFF3A2400),
    background = KapindaCream, surface = Color.White,
    error = KapindaRed,
)
private val Dark = darkColorScheme(
    primary = Color(0xFF6FD3AE), onPrimary = Color(0xFF00382A),
    secondary = KapindaSaffron, onSecondary = Color(0xFF3A2400),
    error = Color(0xFFFF8A80),
)

@Composable
fun KapindaTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
}
