package com.ott.tv.data.api

import com.ott.tv.data.auth.AuthTokenHolder
import javax.inject.Inject
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor @Inject constructor(
    private val tokenHolder: AuthTokenHolder,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenHolder.accessToken
        val request = chain.request()
        return if (token == null) {
            chain.proceed(request)
        } else {
            chain.proceed(request.newBuilder().header("Authorization", "Bearer $token").build())
        }
    }
}
