package com.ott.tv.data.api

import java.io.IOException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.HttpException

/**
 * Runs a Retrofit call and converts a non-2xx response into [ApiException] with the
 * API's own message — mirrors `messageOf()` in apps/web/src/lib/api.ts, which reads
 * NestJS's `{message: string | string[], error, statusCode}` (or the zodPipe
 * validation shape `{message, errors: [{message}]}`) error body.
 */
suspend fun <T> safeCall(json: Json, block: suspend () -> T): T {
    try {
        return block()
    } catch (e: HttpException) {
        val body = e.response()?.errorBody()?.string()
        throw ApiException(e.code(), parseErrorMessage(json, body) ?: e.message())
    } catch (e: IOException) {
        throw ApiException(0, "Network error. Check your connection and try again.")
    }
}

private fun parseErrorMessage(json: Json, body: String?): String? {
    if (body.isNullOrBlank()) return null
    return try {
        val root = json.parseToJsonElement(body).jsonObject
        val message = root["message"]
        when {
            message is JsonArray -> message.jsonArray.firstOrNull()?.jsonPrimitive?.content
            message is JsonPrimitive -> message.content
            else -> root["errors"]?.jsonArray?.firstOrNull()?.jsonObject?.get("message")?.jsonPrimitive?.content
        }
    } catch (_: Exception) {
        null
    }
}
