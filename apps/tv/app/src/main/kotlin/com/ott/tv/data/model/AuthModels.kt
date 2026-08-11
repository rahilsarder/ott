package com.ott.tv.data.model

import kotlinx.serialization.Serializable

@Serializable
data class AuthUser(
    val id: String,
    val email: String,
    val name: String,
    val role: String,
)

@Serializable
data class AuthResponse(
    val accessToken: String,
    val expiresIn: Int,
    val user: AuthUser,
    /** Only present when this app refreshed via [RefreshRequest] rather than a cookie. */
    val refreshToken: String? = null,
)

/** This app has no cookie jar, so every refresh/logout call carries its refresh token here. */
@Serializable
data class RefreshRequest(
    val refreshToken: String,
)
