package com.ott.tv.data.api

import com.ott.tv.data.auth.AuthTokenHolder
import com.ott.tv.data.auth.TokenStore
import com.ott.tv.data.model.AuthResponse
import com.ott.tv.data.model.RefreshRequest
import javax.inject.Inject
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route

/**
 * Refreshes on a 401, mirroring apps/web/src/lib/api.ts's refresh-and-retry-once
 * behaviour. Two things that file's simpler single-threaded browser environment
 * doesn't have to deal with:
 *
 * - OkHttp can call [authenticate] from several threads at once for concurrent
 *   requests that all 401 together. Two overlapping refresh calls would each
 *   consume the single-use refresh token the other needed, tripping the server's
 *   reuse-detection and killing the whole session family. The lock plus a
 *   double-check against [AuthTokenHolder] (has someone else already refreshed
 *   while we waited for it?) collapses concurrent failures into one real refresh
 *   call, the same way `refreshInFlight` does on the web.
 * - There's no cookie jar, so the new refresh token has to be read out of the
 *   response body and persisted here, not left for the browser to receive
 *   invisibly via Set-Cookie.
 */
class TokenAuthenticator @Inject constructor(
    private val tokenStore: TokenStore,
    private val tokenHolder: AuthTokenHolder,
    private val json: Json,
    @PlainHttpClient private val plainClient: OkHttpClient,
) : Authenticator {

    private val lock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) >= 2) return null // already retried once — give up, not a loop.

        val failedToken = response.request.header("Authorization")?.removePrefix("Bearer ")

        synchronized(lock) {
            val current = tokenHolder.accessToken
            if (current != null && current != failedToken) {
                // Another thread already refreshed while we waited for the lock.
                return response.request.newBuilder().header("Authorization", "Bearer $current").build()
            }

            val storedRefreshToken = tokenStore.refreshToken ?: return null
            val refreshed = performRefresh(storedRefreshToken) ?: return null

            tokenHolder.accessToken = refreshed.accessToken
            refreshed.refreshToken?.let { tokenStore.refreshToken = it }

            return response.request.newBuilder().header("Authorization", "Bearer ${refreshed.accessToken}").build()
        }
    }

    private fun performRefresh(refreshToken: String): AuthResponse? {
        val requestJson = json.encodeToString(RefreshRequest(refreshToken))
        val request = Request.Builder()
            .url(NetworkConfig.BASE_URL + "auth/refresh")
            .post(requestJson.toRequestBody("application/json".toMediaType()))
            .build()

        return plainClient.newCall(request).execute().use { httpResponse ->
            if (!httpResponse.isSuccessful) return null
            val body = httpResponse.body?.string() ?: return null
            json.decodeFromString<AuthResponse>(body)
        }
    }

    private fun responseCount(response: Response): Int {
        var result = 1
        var prior = response.priorResponse
        while (prior != null) {
            result++
            prior = prior.priorResponse
        }
        return result
    }
}
