# PayPlus Tap to Pay Android

Scaffold ini sambung terus ke backend PayPlus yang sudah sediakan endpoint Stripe Terminal:

- `POST /api/terminal/connection-token`
- `POST /api/terminal/payment-intents`
- `POST /api/terminal/payment-intents/:paymentIntentId/capture`
- `POST /api/terminal/payment-intents/:paymentIntentId/cancel`

## Sebelum buka Android Studio

1. Pastikan backend PayPlus online
2. Pastikan `STRIPE_TERMINAL_LOCATION_ID` sudah wujud di Stripe Dashboard
3. Kemaskini `android-tap-to-pay/gradle.properties`

Contoh:

```properties
PAYPLUS_BACKEND_URL=https://payplus-rweb.onrender.com
PAYPLUS_TERMINAL_LOCATION_ID=tml_xxxxxxxxxxxxx
```

## Cara run

1. Buka folder `android-tap-to-pay` dalam Android Studio
2. Sync Gradle
3. Guna telefon Android fizikal, bukan emulator
4. Jalankan `debug` untuk discovery simulasi
5. Jalankan `release` yang ditandatangani untuk Tap to Pay live sebenar

## Nota penting

- Debug build hanya sesuai untuk discovery simulasi
- Tap to Pay live perlukan Android 13+, NFC terbina dalam, Google Play Store, internet stabil, dan `Developer options` dimatikan
- Untuk live payWave sebenar, uji pada device fizikal yang layak dan build release yang tidak debuggable
