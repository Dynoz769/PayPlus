package com.payplus.taptopay

import android.content.Context

data class BackendConfig(
    val baseUrl: String,
    val locationId: String
)

class BackendConfigStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun current(): BackendConfig {
        val configuredBaseUrl = preferences.getString(KEY_BACKEND_URL, null)
            ?.trim()
            ?.trimEnd('/')
            .orEmpty()

        val configuredLocationId = preferences.getString(KEY_LOCATION_ID, null)
            ?.trim()
            .orEmpty()

        val baseUrl = configuredBaseUrl.ifBlank {
            BuildConfig.PAYPLUS_BACKEND_URL.trim().trimEnd('/')
        }

        val locationId = configuredLocationId.ifBlank {
            BuildConfig.PAYPLUS_TERMINAL_LOCATION_ID.trim()
        }

        return BackendConfig(baseUrl = baseUrl, locationId = locationId)
    }

    fun save(config: BackendConfig) {
        preferences.edit()
            .putString(KEY_BACKEND_URL, config.baseUrl.trim().trimEnd('/'))
            .putString(KEY_LOCATION_ID, config.locationId.trim())
            .apply()
    }

    companion object {
        private const val PREFS_NAME = "payplus_terminal"
        private const val KEY_BACKEND_URL = "backend_url"
        private const val KEY_LOCATION_ID = "location_id"
    }
}
