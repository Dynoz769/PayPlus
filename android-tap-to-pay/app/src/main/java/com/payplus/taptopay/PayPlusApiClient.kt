package com.payplus.taptopay

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

data class BackendPaymentIntent(
    val id: String,
    val clientSecret: String,
    val status: String
)

data class BackendCaptureResult(
    val id: String,
    val status: String
)

class PayPlusApiClient {
    fun createConnectionToken(baseUrl: String, locationId: String?): String {
        val payload = JSONObject()
        if (!locationId.isNullOrBlank()) {
            payload.put("location", locationId)
        }

        val response = request(
            method = "POST",
            urlString = "${normalizeBaseUrl(baseUrl)}/api/terminal/connection-token",
            body = payload
        )

        return response.optString("secret")
            .takeIf { it.isNotBlank() }
            ?: throw IOException("Backend tidak memulangkan connection token secret.")
    }

    fun createPaymentIntent(baseUrl: String, amount: String, description: String): BackendPaymentIntent {
        val response = request(
            method = "POST",
            urlString = "${normalizeBaseUrl(baseUrl)}/api/terminal/payment-intents",
            body = JSONObject()
                .put("amount", amount)
                .put("description", description)
                .put("captureMethod", "manual")
        )

        val id = response.optString("id")
        val clientSecret = response.optString("clientSecret")
        val status = response.optString("status")

        if (id.isBlank() || clientSecret.isBlank()) {
            throw IOException("Respons PaymentIntent backend tidak lengkap.")
        }

        return BackendPaymentIntent(id = id, clientSecret = clientSecret, status = status)
    }

    fun capturePaymentIntent(baseUrl: String, paymentIntentId: String): BackendCaptureResult {
        val response = request(
            method = "POST",
            urlString = "${normalizeBaseUrl(baseUrl)}/api/terminal/payment-intents/$paymentIntentId/capture",
            body = JSONObject()
        )

        val id = response.optString("id")
        val status = response.optString("status")

        if (id.isBlank()) {
            throw IOException("Respons capture backend tidak lengkap.")
        }

        return BackendCaptureResult(id = id, status = status)
    }

    private fun request(method: String, urlString: String, body: JSONObject?): JSONObject {
        val connection = (URL(urlString).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 20_000
            readTimeout = 20_000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
            doInput = true
            if (body != null) {
                doOutput = true
            }
        }

        try {
            if (body != null) {
                connection.outputStream.bufferedWriter(Charsets.UTF_8).use { writer ->
                    writer.write(body.toString())
                }
            }

            val statusCode = connection.responseCode
            val responseText = (if (statusCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream
            })?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()

            if (statusCode !in 200..299) {
                throw IOException(parseErrorMessage(responseText).ifBlank { "HTTP $statusCode" })
            }

            return if (responseText.isBlank()) {
                JSONObject()
            } else {
                JSONObject(responseText)
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun parseErrorMessage(responseText: String): String {
        return try {
            val json = JSONObject(responseText)
            json.optString("error").ifBlank { responseText }
        } catch (_: Exception) {
            responseText
        }
    }

    private fun normalizeBaseUrl(baseUrl: String): String {
        return baseUrl.trim().trimEnd('/')
    }
}
