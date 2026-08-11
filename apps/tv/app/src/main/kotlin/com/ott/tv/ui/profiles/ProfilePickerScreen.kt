package com.ott.tv.ui.profiles

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import com.ott.tv.data.model.Profile
import com.ott.tv.ui.theme.Bone
import com.ott.tv.ui.theme.Brass
import com.ott.tv.ui.theme.Night

@Composable
fun ProfilePickerScreen(
    viewModel: ProfilePickerViewModel = hiltViewModel(),
    onProfileSelected: (Profile) -> Unit,
) {
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Night)
            .padding(48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = "Who's watching?", color = Bone, fontSize = 32.sp, fontWeight = FontWeight.SemiBold)
        Spacer(modifier = Modifier.height(40.dp))

        when (val current = state) {
            is ProfilePickerUiState.Loading -> Text("Loading profiles…", color = Bone)
            is ProfilePickerUiState.Error -> Text("Couldn't load profiles.", color = MaterialTheme.colorScheme.error)
            is ProfilePickerUiState.Loaded -> {
                Row(horizontalArrangement = Arrangement.spacedBy(32.dp)) {
                    current.profiles.forEach { profile ->
                        ProfileTile(
                            profile = profile,
                            onClick = {
                                viewModel.select(profile)
                                onProfileSelected(profile)
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfileTile(profile: Profile, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(
            onClick = onClick,
            modifier = Modifier
                .size(120.dp)
                .clip(CircleShape),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(CircleShape)
                    .background(avatarColor(profile.avatarKey)),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = profile.name.take(1).uppercase(),
                    color = Night,
                    fontSize = 40.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        Spacer(modifier = Modifier.height(12.dp))
        Text(text = profile.name, color = Bone)
    }
}

private fun avatarColor(key: String): Color = when (key) {
    "red" -> Color(0xFFB4553F)
    "blue" -> Color(0xFF4E7BA6)
    "green" -> Color(0xFF7FA86B)
    "yellow" -> Color(0xFFD9C15A)
    "purple" -> Color(0xFF8B6FB0)
    "orange" -> Color(0xFFD98A4A)
    "teal" -> Color(0xFF4FA89A)
    "pink" -> Color(0xFFC9749B)
    else -> Brass
}
