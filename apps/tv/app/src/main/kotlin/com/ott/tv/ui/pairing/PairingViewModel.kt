package com.ott.tv.ui.pairing

import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ott.tv.data.api.ApiService
import com.ott.tv.data.api.safeCall
import com.ott.tv.data.auth.SessionRepository
import com.ott.tv.data.model.DevicePollRequest
import com.ott.tv.data.model.DeviceStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

sealed interface PairingUiState {
    data object Loading : PairingUiState
    data class Waiting(val qrBitmap: Bitmap, val userCode: String) : PairingUiState
    data object Denied : PairingUiState
    data object Expired : PairingUiState
    data object Error : PairingUiState
    data object Approved : PairingUiState
}

@HiltViewModel
class PairingViewModel @Inject constructor(
    private val api: ApiService,
    private val session: SessionRepository,
    private val json: Json,
) : ViewModel() {

    private val _uiState = MutableStateFlow<PairingUiState>(PairingUiState.Loading)
    val uiState: StateFlow<PairingUiState> = _uiState.asStateFlow()

    private var pollJob: Job? = null

    init {
        start()
    }

    fun start() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            _uiState.value = PairingUiState.Loading
            try {
                val started = safeCall(json) { api.startDevicePairing() }
                val qrBitmap = generateQrBitmap(started.verificationUrlComplete, sizePx = 512)
                _uiState.value = PairingUiState.Waiting(qrBitmap, started.userCode)

                while (isActive) {
                    delay(started.interval * 1000L)
                    val poll = safeCall(json) { api.pollDevicePairing(DevicePollRequest(started.deviceCode)) }
                    when (poll.status) {
                        DeviceStatus.PENDING, DeviceStatus.SLOW_DOWN -> Unit // keep waiting
                        DeviceStatus.DENIED -> {
                            _uiState.value = PairingUiState.Denied
                            return@launch
                        }
                        DeviceStatus.EXPIRED -> {
                            _uiState.value = PairingUiState.Expired
                            return@launch
                        }
                        DeviceStatus.APPROVED -> {
                            session.applyApprovedPairing(poll)
                            _uiState.value = PairingUiState.Approved
                            return@launch
                        }
                    }
                }
            } catch (_: Exception) {
                _uiState.value = PairingUiState.Error
            }
        }
    }

    override fun onCleared() {
        pollJob?.cancel()
    }
}
