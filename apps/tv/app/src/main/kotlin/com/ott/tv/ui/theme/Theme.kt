package com.ott.tv.ui.theme

import androidx.compose.runtime.Composable
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

private val OttColorScheme = darkColorScheme(
    primary = Brass,
    onPrimary = Night,
    secondary = BrassHot,
    onSecondary = Night,
    background = Night,
    onBackground = Bone,
    surface = Night2,
    onSurface = Bone,
    surfaceVariant = Night3,
    onSurfaceVariant = Ash,
    border = Hairline,
    error = SignalBad,
)

@Composable
fun OttTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = OttColorScheme,
        content = content,
    )
}
