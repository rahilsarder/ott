package com.ott.tv.ui.pairing

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.ott.tv.ui.theme.Bone
import com.ott.tv.ui.theme.Brass
import com.ott.tv.ui.theme.Night

@Composable
fun PairingScreen(viewModel: PairingViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Night)
            .padding(48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "Sign in on your phone or computer",
            color = Bone,
            fontSize = 28.sp,
            fontWeight = FontWeight.SemiBold,
        )

        Spacer(modifier = Modifier.height(24.dp))

        when (val current = state) {
            is PairingUiState.Loading -> Text("Preparing your code…", color = Bone)

            is PairingUiState.Waiting -> {
                Image(
                    bitmap = current.qrBitmap.asImageBitmap(),
                    contentDescription = "Scan to sign in",
                    modifier = Modifier
                        .size(280.dp)
                        .background(Bone)
                        .padding(12.dp),
                )
                Spacer(modifier = Modifier.height(20.dp))
                Text(
                    text = "Visit the link and enter this code:",
                    color = Bone,
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = current.userCode,
                    color = Brass,
                    fontSize = 40.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(text = "Waiting for approval…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            is PairingUiState.Denied -> RetryMessage("Sign-in was denied.", viewModel::start)
            is PairingUiState.Expired -> RetryMessage("This code expired.", viewModel::start)
            is PairingUiState.Error -> RetryMessage("Something went wrong.", viewModel::start)
            is PairingUiState.Approved -> Text("Signed in…", color = Bone)
        }
    }
}

@Composable
private fun RetryMessage(message: String, onRetry: () -> Unit) {
    Text(text = message, color = Bone)
    Spacer(modifier = Modifier.height(16.dp))
    Button(onClick = onRetry) {
        Text("Try again")
    }
}
