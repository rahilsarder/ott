package com.ott.tv.data.auth

import com.ott.tv.data.api.ApiService
import com.ott.tv.data.api.safeCall
import com.ott.tv.data.model.AuthUser
import com.ott.tv.data.model.DevicePollResponse
import com.ott.tv.data.model.Profile
import com.ott.tv.data.model.RefreshRequest
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json

data class SessionState(
    val user: AuthUser? = null,
    val profile: Profile? = null,
    /** False until the boot-time restore attempt (refresh + /auth/me) has finished, either way. */
    val ready: Boolean = false,
)

/**
 * The TV-app equivalent of apps/web/src/lib/session.tsx — same shape (user, profile,
 * ready, sign-out, select-profile), adapted for a client with its own token storage
 * instead of an httpOnly cookie.
 */
@Singleton
class SessionRepository @Inject constructor(
    private val api: ApiService,
    private val tokenStore: TokenStore,
    private val tokenHolder: AuthTokenHolder,
    private val json: Json,
) {
    private val _state = MutableStateFlow(SessionState())
    val state: StateFlow<SessionState> = _state.asStateFlow()

    /** Called once on app start: re-mint a session from the stored refresh token, if any. */
    suspend fun restore() {
        val storedRefreshToken = tokenStore.refreshToken
        if (storedRefreshToken == null) {
            _state.value = SessionState(ready = true)
            return
        }

        try {
            val refreshed = safeCall(json) { api.refresh(RefreshRequest(storedRefreshToken)) }
            tokenHolder.accessToken = refreshed.accessToken
            refreshed.refreshToken?.let { tokenStore.refreshToken = it }

            val user = safeCall(json) { api.me() }
            val profile = restoreActiveProfile()
            _state.value = SessionState(user = user, profile = profile, ready = true)
        } catch (_: Exception) {
            tokenStore.clear()
            tokenHolder.accessToken = null
            _state.value = SessionState(ready = true)
        }
    }

    private suspend fun restoreActiveProfile(): Profile? {
        val storedProfileId = tokenStore.activeProfileId ?: return null
        val profiles = safeCall(json) { api.profiles() }
        val match = profiles.find { it.id == storedProfileId } ?: return null
        return applyProfileSelection(match)
    }

    /** Applies a session that was already fully issued elsewhere — the device-pairing approval flow. */
    fun applyApprovedPairing(poll: DevicePollResponse) {
        require(poll.status == "approved") { "applyApprovedPairing called with status=${poll.status}" }
        val accessToken = requireNotNull(poll.accessToken)
        val refreshToken = requireNotNull(poll.refreshToken)
        val user = requireNotNull(poll.user)

        tokenHolder.accessToken = accessToken
        tokenStore.refreshToken = refreshToken
        tokenStore.activeProfileId = null
        _state.value = SessionState(user = user, profile = null, ready = true)
    }

    suspend fun selectProfile(profile: Profile) {
        val scoped = applyProfileSelection(profile)
        _state.value = _state.value.copy(profile = scoped)
    }

    private suspend fun applyProfileSelection(profile: Profile): Profile {
        val scoped = safeCall(json) { api.selectProfile(profile.id) }
        tokenHolder.accessToken = scoped.accessToken
        tokenStore.activeProfileId = profile.id
        return profile
    }

    suspend fun signOut() {
        val refreshToken = tokenStore.refreshToken
        if (refreshToken != null) {
            runCatching { api.logout(RefreshRequest(refreshToken)) }
        }
        tokenHolder.accessToken = null
        tokenStore.clear()
        _state.value = SessionState(ready = true)
    }
}
