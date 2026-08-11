package com.ott.tv.data.api

/** Mirrors apps/web/src/lib/api.ts's ApiError — a non-2xx response with the API's own message. */
class ApiException(
    val status: Int,
    message: String,
) : Exception(message)
