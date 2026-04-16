package com.payplus.taptopay

import android.Manifest
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.payplus.taptopay.databinding.ActivityMainBinding
import com.stripe.stripeterminal.Terminal
import com.stripe.stripeterminal.external.callable.Callback
import com.stripe.stripeterminal.external.callable.Cancelable
import com.stripe.stripeterminal.external.callable.DiscoveryListener
import com.stripe.stripeterminal.external.callable.PaymentIntentCallback
import com.stripe.stripeterminal.external.callable.ReaderCallback
import com.stripe.stripeterminal.external.callable.TapToPayReaderListener
import com.stripe.stripeterminal.external.callable.TerminalListener
import com.stripe.stripeterminal.external.models.CollectPaymentIntentConfiguration
import com.stripe.stripeterminal.external.models.ConfirmPaymentIntentConfiguration
import com.stripe.stripeterminal.external.models.ConnectionStatus
import com.stripe.stripeterminal.external.models.DisconnectReason
import com.stripe.stripeterminal.external.models.PaymentIntent
import com.stripe.stripeterminal.external.models.PaymentStatus
import com.stripe.stripeterminal.external.models.Reader
import com.stripe.stripeterminal.external.models.TapToPayConnectionConfiguration
import com.stripe.stripeterminal.external.models.TapToPayDiscoveryConfiguration
import com.stripe.stripeterminal.external.models.TerminalException
import com.stripe.stripeterminal.log.LogLevel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity(), TerminalListener, DiscoveryListener, TapToPayReaderListener {
    private lateinit var binding: ActivityMainBinding
    private lateinit var configStore: BackendConfigStore
    private lateinit var tokenProvider: PayPlusConnectionTokenProvider
    private val apiClient = PayPlusApiClient()

    private var discoverCancelable: Cancelable? = null
    private var paymentCancelable: Cancelable? = null
    private var pendingTapToPayConnect = false
    private var isBusy = false

    private val locationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                appendStatus("ACCESS_FINE_LOCATION diberi.")
                initTerminalIfNeeded()
            } else {
                appendStatus("Stripe Terminal perlukan ACCESS_FINE_LOCATION untuk Tap to Pay.")
                refreshReaderState()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        configStore = BackendConfigStore(this)
        tokenProvider = PayPlusConnectionTokenProvider(configStore, apiClient)

        val initialConfig = configStore.current()
        binding.backendUrlInput.setText(initialConfig.baseUrl)
        binding.locationIdInput.setText(initialConfig.locationId)
        binding.amountInput.setText("5.00")
        binding.descriptionInput.setText("PayPlus Tap to Pay Android")
        binding.buildModeText.text = buildModeDescription()

        binding.saveConfigButton.setOnClickListener {
            val config = saveCurrentConfig()
            appendStatus("Konfigurasi disimpan untuk ${config.baseUrl}.")
        }

        binding.connectButton.setOnClickListener {
            discoverAndConnectTapToPay()
        }

        binding.disconnectButton.setOnClickListener {
            disconnectReader()
        }

        binding.takePaymentButton.setOnClickListener {
            takePayment()
        }

        if (ensureLocationPermission()) {
            initTerminalIfNeeded()
        }
        appendStatus("App sedia. Debug build guna discovery simulasi, release build cuba Tap to Pay live.")
        refreshReaderState()
    }

    override fun onStop() {
        super.onStop()

        if (isFinishing && Terminal.isInitialized() && Terminal.getInstance().connectedReader == null) {
            cancelDiscoverySilently()
        }
    }

    override fun onConnectionStatusChange(status: ConnectionStatus) {
        runOnUiThread {
            appendStatus("Connection status: $status")
            refreshReaderState()
        }
    }

    override fun onPaymentStatusChange(status: PaymentStatus) {
        runOnUiThread {
            appendStatus("Payment status: $status")
            refreshReaderState()
        }
    }

    override fun onUpdateDiscoveredReaders(readers: List<Reader>) {
        if (!pendingTapToPayConnect || readers.isEmpty()) {
            return
        }

        pendingTapToPayConnect = false
        val reader = readers.first()

        runOnUiThread {
            appendStatus("Reader ditemui: ${describeReader(reader)}")
            cancelDiscoverySilently()
            connectReader(reader)
        }
    }

    override fun onDisconnect(reason: DisconnectReason) {
        runOnUiThread {
            appendStatus("Reader disconnected: $reason")
            refreshReaderState()
        }
    }

    override fun onReaderReconnectStarted(reader: Reader, cancelReconnect: Cancelable, reason: DisconnectReason) {
        runOnUiThread {
            appendStatus("Auto reconnect bermula untuk ${describeReader(reader)}. Sebab: $reason")
        }
    }

    override fun onReaderReconnectSucceeded(reader: Reader) {
        runOnUiThread {
            appendStatus("Reader reconnect berjaya: ${describeReader(reader)}")
            refreshReaderState()
        }
    }

    override fun onReaderReconnectFailed(reader: Reader) {
        runOnUiThread {
            appendStatus("Reader reconnect gagal: ${describeReader(reader)}")
            refreshReaderState()
        }
    }

    private fun ensureLocationPermission(): Boolean {
        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        if (!granted) {
            locationPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
        }

        return granted
    }

    private fun initTerminalIfNeeded() {
        if (!ensureLocationPermission()) {
            return
        }

        if (Terminal.isInitialized()) {
            refreshReaderState()
            return
        }

        try {
            Terminal.init(applicationContext, LogLevel.VERBOSE, tokenProvider, this, null)
            appendStatus("Stripe Terminal initialized.")
        } catch (error: Exception) {
            appendStatus("Gagal initialize Stripe Terminal: ${error.message}")
        } finally {
            refreshReaderState()
        }
    }

    private fun discoverAndConnectTapToPay() {
        val config = saveCurrentConfig()

        if (config.locationId.isBlank()) {
            appendStatus("Isi Stripe Terminal location id dahulu sebelum connect.")
            return
        }

        if (!ensureLocationPermission()) {
            return
        }

        initTerminalIfNeeded()
        if (!Terminal.isInitialized()) {
            return
        }

        if (Terminal.getInstance().connectedReader != null) {
            appendStatus("Reader sudah connected.")
            refreshReaderState()
            return
        }

        val isSimulated = isDebugBuild()
        cancelDiscoverySilently()
        pendingTapToPayConnect = true
        isBusy = true
        appendStatus(
            if (isSimulated) {
                "Mulakan Tap to Pay discovery simulasi."
            } else {
                "Mulakan Tap to Pay discovery live."
            }
        )

        discoverCancelable = Terminal.getInstance().discoverReaders(
            TapToPayDiscoveryConfiguration(isSimulated = isSimulated),
            this,
            object : Callback {
                override fun onSuccess() {
                    runOnUiThread {
                        appendStatus("Discovery berjalan. Tunggu reader Tap to Pay ditemui.")
                        refreshReaderState()
                    }
                }

                override fun onFailure(e: TerminalException) {
                    runOnUiThread {
                        pendingTapToPayConnect = false
                        isBusy = false
                        appendStatus("discoverReaders gagal: ${e.message}")
                        refreshReaderState()
                    }
                }
            }
        )

        refreshReaderState()
    }

    private fun connectReader(reader: Reader) {
        val locationId = saveCurrentConfig().locationId
        appendStatus("Menyambung reader ke location $locationId ...")

        Terminal.getInstance().connectReader(
            reader,
            TapToPayConnectionConfiguration(locationId, true, this),
            object : ReaderCallback {
                override fun onSuccess(reader: Reader) {
                    runOnUiThread {
                        isBusy = false
                        appendStatus("Reader connected: ${describeReader(reader)}")
                        refreshReaderState()
                    }
                }

                override fun onFailure(e: TerminalException) {
                    runOnUiThread {
                        isBusy = false
                        appendStatus("connectReader gagal: ${e.message}")
                        refreshReaderState()
                    }
                }
            }
        )
    }

    private fun disconnectReader() {
        if (!Terminal.isInitialized()) {
            appendStatus("Stripe Terminal belum initialized.")
            return
        }

        if (Terminal.getInstance().connectedReader == null) {
            appendStatus("Tiada reader untuk disconnect.")
            refreshReaderState()
            return
        }

        Terminal.getInstance().disconnectReader(object : Callback {
            override fun onSuccess() {
                runOnUiThread {
                    appendStatus("Reader disconnected.")
                    refreshReaderState()
                }
            }

            override fun onFailure(e: TerminalException) {
                runOnUiThread {
                    appendStatus("disconnectReader gagal: ${e.message}")
                    refreshReaderState()
                }
            }
        })
    }

    private fun takePayment() {
        if (!Terminal.isInitialized() || Terminal.getInstance().connectedReader == null) {
            appendStatus("Sambungkan reader dahulu sebelum ambil bayaran.")
            refreshReaderState()
            return
        }

        val config = saveCurrentConfig()
        val amount = binding.amountInput.text?.toString().orEmpty().trim()
        val description = binding.descriptionInput.text?.toString().orEmpty().trim()
            .ifBlank { "PayPlus Tap to Pay Android" }

        if (amount.toDoubleOrNull() == null || amount.toDouble() < 1.0) {
            appendStatus("Masukkan jumlah yang sah, minimum 1.00.")
            return
        }

        appendStatus("Minta backend create PaymentIntent ...")
        isBusy = true
        refreshReaderState()

        thread(name = "payplus-create-payment-intent") {
            try {
                val paymentIntent = apiClient.createPaymentIntent(
                    baseUrl = config.baseUrl,
                    amount = amount,
                    description = description
                )

                runOnUiThread {
                    appendStatus("PaymentIntent ${paymentIntent.id} dicipta (${paymentIntent.status}).")
                    retrieveAndProcessPaymentIntent(paymentIntent.clientSecret)
                }
            } catch (error: Exception) {
                runOnUiThread {
                    appendStatus("Gagal create PaymentIntent: ${error.message}")
                    isBusy = false
                    refreshReaderState()
                }
            }
        }
    }

    private fun retrieveAndProcessPaymentIntent(clientSecret: String) {
        Terminal.getInstance().retrievePaymentIntent(clientSecret, object : PaymentIntentCallback {
            override fun onSuccess(paymentIntent: PaymentIntent) {
                runOnUiThread {
                    appendStatus("PaymentIntent dimuat. Minta kad atau wallet disentuhkan pada phone.")
                }

                paymentCancelable = Terminal.getInstance().processPaymentIntent(
                    paymentIntent,
                    CollectPaymentIntentConfiguration.Builder().build(),
                    ConfirmPaymentIntentConfiguration.Builder().build(),
                    object : PaymentIntentCallback {
                        override fun onSuccess(paymentIntent: PaymentIntent) {
                            val paymentIntentId = paymentIntent.id

                            if (paymentIntentId.isNullOrBlank()) {
                                runOnUiThread {
                                    appendStatus("Bayaran diproses tetapi PaymentIntent id tiada.")
                                    isBusy = false
                                    paymentCancelable = null
                                    refreshReaderState()
                                }
                                return
                            }

                            runOnUiThread {
                                appendStatus("Payment authorized. Menangkap bayaran di backend ...")
                            }
                            capturePaymentIntent(paymentIntentId)
                        }

                        override fun onFailure(e: TerminalException) {
                            runOnUiThread {
                                appendStatus("processPaymentIntent gagal: ${e.message}")
                                isBusy = false
                                paymentCancelable = null
                                refreshReaderState()
                            }
                        }
                    }
                )
            }

            override fun onFailure(e: TerminalException) {
                runOnUiThread {
                    appendStatus("retrievePaymentIntent gagal: ${e.message}")
                    isBusy = false
                    refreshReaderState()
                }
            }
        })
    }

    private fun capturePaymentIntent(paymentIntentId: String) {
        thread(name = "payplus-capture-payment-intent") {
            try {
                val result = apiClient.capturePaymentIntent(
                    baseUrl = configStore.current().baseUrl,
                    paymentIntentId = paymentIntentId
                )

                runOnUiThread {
                    appendStatus("Capture berjaya: ${result.id} (${result.status}).")
                    isBusy = false
                    paymentCancelable = null
                    refreshReaderState()
                }
            } catch (error: Exception) {
                runOnUiThread {
                    appendStatus("Capture gagal: ${error.message}")
                    isBusy = false
                    paymentCancelable = null
                    refreshReaderState()
                }
            }
        }
    }

    private fun saveCurrentConfig(): BackendConfig {
        val config = BackendConfig(
            baseUrl = binding.backendUrlInput.text?.toString().orEmpty().trim().trimEnd('/'),
            locationId = binding.locationIdInput.text?.toString().orEmpty().trim()
        ).let {
            it.copy(baseUrl = it.baseUrl.ifBlank { BuildConfig.PAYPLUS_BACKEND_URL.trim().trimEnd('/') })
        }

        configStore.save(config)
        return config
    }

    private fun refreshReaderState() {
        val reader = if (Terminal.isInitialized()) Terminal.getInstance().connectedReader else null
        binding.connectedReaderText.text = reader?.let {
            "Connected: ${describeReader(it)}"
        } ?: "Tiada reader disambungkan."

        binding.disconnectButton.isEnabled = reader != null && !isBusy
        binding.takePaymentButton.isEnabled = reader != null && !isBusy
        binding.connectButton.isEnabled = !isBusy
    }

    private fun cancelDiscoverySilently() {
        val cancelable = discoverCancelable ?: return
        discoverCancelable = null
        cancelable.cancel(object : Callback {
            override fun onSuccess() {
                pendingTapToPayConnect = false
            }

            override fun onFailure(e: TerminalException) {
                pendingTapToPayConnect = false
            }
        })
    }

    private fun appendStatus(message: String) {
        val timestamp = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        val existing = binding.statusText.text?.toString().orEmpty()
        binding.statusText.text = buildString {
            append(timestamp)
            append("  ")
            append(message)
            if (existing.isNotBlank()) {
                append("\n\n")
                append(existing)
            }
        }
    }

    private fun buildModeDescription(): String {
        return if (isDebugBuild()) {
            "Mode: debug build, discovery simulasi sahaja"
        } else {
            "Mode: release build, cuba Tap to Pay live"
        }
    }

    private fun isDebugBuild(): Boolean {
        return (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    }

    private fun describeReader(reader: Reader): String {
        val serial = reader.serialNumber?.takeIf { it.isNotBlank() } ?: "tiada serial"
        return "${reader.deviceType} / $serial"
    }
}
