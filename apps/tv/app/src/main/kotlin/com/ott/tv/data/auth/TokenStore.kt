package com.ott.tv.data.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Keystore-backed storage for the refresh token and active profile id.
 *
 * There is no browser cookie jar on a native client, so — unlike the web app, where
 * the refresh token lives only in an httpOnly cookie — this app must hold it itself.
 * EncryptedSharedPreferences keeps it out of a plain-text file on disk.
 *
 * The access token is deliberately NOT persisted here, matching the web app's own
 * choice (apps/web/src/lib/api.ts) to keep it in memory only — it's short-lived
 * (15 min) and cheaply re-minted from the refresh token on process start.
 */
@Singleton
class TokenStore @Inject constructor(@ApplicationContext context: Context) {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            "ott_tv_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    var refreshToken: String?
        get() = prefs.getString(KEY_REFRESH_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_REFRESH_TOKEN, value).apply()

    var activeProfileId: String?
        get() = prefs.getString(KEY_ACTIVE_PROFILE, null)
        set(value) = prefs.edit().putString(KEY_ACTIVE_PROFILE, value).apply()

    fun clear() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val KEY_REFRESH_TOKEN = "refresh_token"
        const val KEY_ACTIVE_PROFILE = "active_profile_id"
    }
}
