package com.ott.tv.ui.profiles

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ott.tv.data.api.ApiService
import com.ott.tv.data.api.safeCall
import com.ott.tv.data.auth.SessionRepository
import com.ott.tv.data.model.Profile
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

sealed interface ProfilePickerUiState {
    data object Loading : ProfilePickerUiState
    data class Loaded(val profiles: List<Profile>) : ProfilePickerUiState
    data object Error : ProfilePickerUiState
}

@HiltViewModel
class ProfilePickerViewModel @Inject constructor(
    private val api: ApiService,
    private val session: SessionRepository,
    private val json: Json,
) : ViewModel() {

    private val _uiState = MutableStateFlow<ProfilePickerUiState>(ProfilePickerUiState.Loading)
    val uiState: StateFlow<ProfilePickerUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.value = ProfilePickerUiState.Loading
            _uiState.value = try {
                ProfilePickerUiState.Loaded(safeCall(json) { api.profiles() })
            } catch (_: Exception) {
                ProfilePickerUiState.Error
            }
        }
    }

    fun select(profile: Profile) {
        viewModelScope.launch {
            runCatching { session.selectProfile(profile) }
        }
    }
}
