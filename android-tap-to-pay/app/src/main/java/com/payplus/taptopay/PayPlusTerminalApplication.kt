package com.payplus.taptopay

import android.app.Application
import com.stripe.stripeterminal.TerminalApplicationDelegate
import com.stripe.stripeterminal.taptopay.TapToPay

class PayPlusTerminalApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        if (TapToPay.isInTapToPayProcess()) {
            return
        }

        TerminalApplicationDelegate.onCreate(this)
    }
}
