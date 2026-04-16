package com.payplus.taptopay

import com.stripe.stripeterminal.external.callable.ConnectionTokenCallback
import com.stripe.stripeterminal.external.callable.ConnectionTokenProvider
import com.stripe.stripeterminal.external.models.ConnectionTokenException
import kotlin.concurrent.thread

class PayPlusConnectionTokenProvider(
    private val configStore: BackendConfigStore,
    private val apiClient: PayPlusApiClient
) : ConnectionTokenProvider {
    override fun fetchConnectionToken(callback: ConnectionTokenCallback) {
        thread(name = "payplus-connection-token") {
            try {
                val config = configStore.current()
                val secret = apiClient.createConnectionToken(
                    baseUrl = config.baseUrl,
                    locationId = config.locationId.takeIf { it.isNotBlank() }
                )
                callback.onSuccess(secret)
            } catch (error: Exception) {
                callback.onFailure(ConnectionTokenException("Failed to fetch connection token", error))
            }
        }
    }
}
