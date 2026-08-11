package com.ott.tv.data.model

import kotlinx.serialization.Serializable

@Serializable
data class DeviceStartResponse(
    val userCode: String,
    val deviceCode: String,
    val verificationUrl: String,
    val verificationUrlComplete: String,
    val expiresIn: Int,
    val interval: Int,
)

@Serializable
data class DevicePollRequest(
    val deviceCode: String,
)

/**
 * Mirrors packages/shared/src/device.ts's DevicePollResponse discriminated union as a
 * flat, nullable-fields shape — simpler than a polymorphic sealed hierarchy for one
 * response type, and [status] is exactly what call sites branch on.
 */
@Serializable
data class DevicePollResponse(
    val status: String,
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val expiresIn: Int? = null,
    val user: AuthUser? = null,
)

object DeviceStatus {
    const val PENDING = "pending"
    const val SLOW_DOWN = "slow_down"
    const val DENIED = "denied"
    const val EXPIRED = "expired"
    const val APPROVED = "approved"
}
