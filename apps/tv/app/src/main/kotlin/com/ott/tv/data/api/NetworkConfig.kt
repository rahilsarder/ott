package com.ott.tv.data.api

/**
 * 10.0.2.2 is the Android emulator's alias for the host machine's localhost — the
 * right default for local development against the API running on this repo's dev
 * server. This needs to become a real, build-variant-driven URL (a release
 * buildConfigField, mirroring how apps/web reads NEXT_PUBLIC_API_URL) before this
 * app targets anything beyond a local dev backend.
 */
object NetworkConfig {
    const val BASE_URL = "http://10.0.2.2:4000/api/"
}
