# Stripe Tap to Pay Android

Backend tempatan ini sudah sediakan endpoint untuk digunakan oleh Stripe Terminal Android SDK.

## Flow ringkas

1. App Android minta `connection token` dari `POST /api/terminal/connection-token`
2. App connect ke Tap to Pay reader pada telefon Android
3. App minta backend create `PaymentIntent` melalui `POST /api/terminal/payment-intents`
4. Backend pulangkan `clientSecret`
5. App Android retrieve dan proses payment menggunakan Stripe Terminal SDK
6. Jika `capture_method=manual`, backend panggil endpoint capture selepas semakan dalaman selesai

## Rujukan rasmi

- Stripe Terminal Android: https://docs.stripe.com/terminal/sdk/android
- Stripe Tap to Pay on Android: https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=android
- Stripe collect card payments: https://docs.stripe.com/terminal/payments/collect-card-payment?terminal-sdk-platform=android
- Stripe connection token API: https://docs.stripe.com/api/terminal/connection_tokens/create
