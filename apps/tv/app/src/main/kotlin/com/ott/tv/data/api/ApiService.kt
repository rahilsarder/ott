package com.ott.tv.data.api

import com.ott.tv.data.model.AuthResponse
import com.ott.tv.data.model.AuthUser
import com.ott.tv.data.model.DevicePollRequest
import com.ott.tv.data.model.DevicePollResponse
import com.ott.tv.data.model.DeviceStartResponse
import com.ott.tv.data.model.Profile
import com.ott.tv.data.model.RefreshRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface ApiService {

    @POST("devices/start")
    suspend fun startDevicePairing(): DeviceStartResponse

    @POST("devices/poll")
    suspend fun pollDevicePairing(@Body body: DevicePollRequest): DevicePollResponse

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): AuthResponse

    @POST("auth/logout")
    suspend fun logout(@Body body: RefreshRequest)

    @GET("auth/me")
    suspend fun me(): AuthUser

    @GET("profiles")
    suspend fun profiles(): List<Profile>

    @POST("profiles/{id}/select")
    suspend fun selectProfile(@Path("id") id: String): AuthResponse
}
