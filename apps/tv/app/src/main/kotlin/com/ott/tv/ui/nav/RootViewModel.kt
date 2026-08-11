package com.ott.tv.ui.nav

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ott.tv.data.auth.SessionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.launch

@HiltViewModel
class RootViewModel @Inject constructor(
    val session: SessionRepository,
) : ViewModel() {
    init {
        viewModelScope.launch { session.restore() }
    }
}
