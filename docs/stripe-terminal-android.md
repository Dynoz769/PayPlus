# Stripe Tap to Pay Android

Backend PayPlus ini sudah sediakan endpoint untuk digunakan oleh Stripe Terminal Android SDK.

## 1. Cipta Stripe Terminal location dulu

`Tap to Pay` perlu location id Stripe yang sah. ID ini biasanya bermula dengan `tml_`.

### Langkah di Stripe Dashboard

1. Buka `Stripe Dashboard`
2. Pergi ke `Terminal` → `Locations`
3. Pada halaman locations, klik `Create location`
4. Isi nama lokasi dan alamat yang sah
5. Simpan
6. Buka lokasi itu dan copy `location id` yang bermula dengan `tml_`

### Masukkan ke backend PayPlus

Isi di Render atau `.env`:

```env
STRIPE_TERMINAL_LOCATION_ID=tml_xxxxxxxxxxxxx
```

Lepas itu redeploy backend dan semak:

```text
https://payplus-rweb.onrender.com/health
```

Bahagian `terminal.locationId` patut memaparkan `tml_...` itu.

## 2. Flow backend yang app Android akan guna

1. App Android minta `connection token` dari `POST /api/terminal/connection-token`
2. App connect ke Tap to Pay reader pada telefon Android
3. App minta backend create `PaymentIntent` melalui `POST /api/terminal/payment-intents`
4. Backend pulangkan `clientSecret`
5. App Android retrieve dan proses payment menggunakan Stripe Terminal SDK
6. Oleh sebab backend ini guna `capture_method=manual`, app panggil backend untuk capture selepas authorization berjaya

## 3. Scaffold Android dalam repo ini

Scaffold disediakan di:

`android-tap-to-pay/`

Fail penting:

- `android-tap-to-pay/app/build.gradle.kts`
- `android-tap-to-pay/app/src/main/java/com/payplus/taptopay/MainActivity.kt`
- `android-tap-to-pay/app/src/main/java/com/payplus/taptopay/PayPlusConnectionTokenProvider.kt`
- `android-tap-to-pay/app/src/main/java/com/payplus/taptopay/PayPlusApiClient.kt`

## 4. Cara configure scaffold Android

Edit `android-tap-to-pay/gradle.properties`:

```properties
PAYPLUS_BACKEND_URL=https://payplus-rweb.onrender.com
PAYPLUS_TERMINAL_LOCATION_ID=tml_xxxxxxxxxxxxx
```

Anda juga boleh ubah kedua-dua nilai itu terus dalam UI app sebelum tekan `Save config`.

## 5. Cara run app Android

1. Buka folder `android-tap-to-pay` dalam Android Studio
2. Sync Gradle
3. Guna telefon Android fizikal
4. Beri kebenaran `ACCESS_FINE_LOCATION`
5. Tekan `Discover dan connect`
6. Masukkan amaun
7. Tekan `Ambil bayaran`

## 6. Perbezaan debug dan release

- `debug build`
  - discovery ditetapkan sebagai simulasi
  - sesuai untuk wiring dan semakan awal
- `release build`
  - cuba Tap to Pay live sebenar
  - mesti build yang ditandatangani dan tidak debuggable

## 7. Syarat device untuk Tap to Pay live

Untuk live `payWave/contactless` sebenar, device Android mesti memenuhi syarat Stripe:

- Android 13 atau lebih baru
- NFC terbina dalam
- ARM processor
- Google Mobile Services dan Play Store
- security update dalam 12 bulan terakhir
- internet stabil
- bootloader tidak diubah / device tidak rooted
- `Developer options` dimatikan

Emulator Android tidak disokong untuk Tap to Pay.

## Rujukan rasmi

- Stripe Manage locations: https://docs.stripe.com/terminal/fleet/locations
- Stripe setup integration for Android: https://docs.stripe.com/terminal/payments/setup-integration?terminal-sdk-platform=android
- Stripe Tap to Pay on Android: https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=android
- Stripe connect reader for Android: https://docs.stripe.com/terminal/payments/connect-reader?reader-type=tap-to-pay&terminal-sdk-platform=android
- Stripe collect card payments for Android: https://docs.stripe.com/terminal/payments/collect-card-payment?terminal-sdk-platform=android
- Stripe connection token API: https://docs.stripe.com/api/terminal/connection_tokens/create
