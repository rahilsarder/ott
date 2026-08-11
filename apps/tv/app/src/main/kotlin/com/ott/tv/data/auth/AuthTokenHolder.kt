package com.ott.tv.data.auth

import javax.inject.Inject
import javax.inject.Singleton

/**
 * The in-memory access token — mirrors apps/web/src/lib/api.ts's module-level
 * `accessToken` variable. Deliberately not persisted (see TokenStore's doc comment):
 * short-lived, and cheaply re-minted from the refresh token on process start.
 */
@Singleton
class AuthTokenHolder @Inject constructor() {
    @Volatile
    var accessToken: String? = null
}
