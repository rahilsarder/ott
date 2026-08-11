package com.ott.tv.ui.nav

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.material3.Text
import com.ott.tv.ui.pairing.PairingScreen
import com.ott.tv.ui.profiles.ProfilePickerScreen
import com.ott.tv.ui.theme.Bone
import com.ott.tv.ui.theme.Night

/**
 * Root routing composable. A plain state-conditional rather than a real NavHost —
 * there are only two destinations in M1 (device-pairing sign-in, profile picker).
 * This is the natural place to grow into a NavHost with a real back stack once M2
 * adds Home/Title Detail/Player, without changing how MainActivity calls it.
 */
@Composable
fun OttNavGraph(rootViewModel: RootViewModel = hiltViewModel()) {
    val sessionState by rootViewModel.session.state.collectAsState()

    when {
        !sessionState.ready -> LoadingScreen()
        sessionState.user == null -> PairingScreen()
        else -> ProfilePickerScreen(onProfileSelected = { /* M2: navigate into Home once it exists */ })
    }
}

@Composable
private fun LoadingScreen() {
    androidx.compose.foundation.layout.Box(
        modifier = Modifier.fillMaxSize().background(Night),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = "Loading…", color = Bone)
    }
}
