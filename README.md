# PayPlus Stripe

Projek ini menyokong dua flow Stripe dalam satu codebase:

1. Hosted Checkout untuk web + QR
2. Endpoint backend untuk Tap to Pay Android
3. Scaffold app Android minimum dalam `android-tap-to-pay/`

## Jalankan lokal

1. Isi `.env`
2. Jalankan `npm install`
3. Jalankan `npm start`
4. Buka `http://localhost:3000`

## Online penuh dengan Render

Fail [render.yaml](./render.yaml) sudah disediakan untuk deploy paling cepat.

Jangan deploy repo ini ke GitHub Pages sebagai static site. App ini perlukan backend Node yang sentiasa hidup.

### Langkah ringkas

1. Push repo ini ke GitHub
2. Log masuk ke Render
3. Pilih **New +** → **Blueprint**
4. Sambungkan repo GitHub anda
5. Render akan baca `render.yaml`
6. Isi environment variables berikut di Render:
   - `APP_BASE_URL`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_WEBHOOK_SECRET` (jika mahu webhook verification)
   - `APP_ALLOWED_ORIGINS` jika frontend anda dibuka dari domain lain
7. Deploy

### Nilai yang disyorkan

- `APP_BASE_URL=https://<nama-service>.onrender.com`
- `APP_ALLOWED_ORIGINS=https://<nama-service>.onrender.com`
- Jika anda masih mahu frontend GitHub Pages memanggil backend Render:
  - `APP_ALLOWED_ORIGINS=https://dynoz769.github.io,https://<nama-service>.onrender.com`

### Webhook Stripe

Selepas app online, daftarkan webhook Stripe ke:

`https://<nama-service>.onrender.com/webhooks/stripe`

Event minimum yang berguna:

- `checkout.session.completed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

## Endpoint utama

- `GET /health`
- `POST /api/checkout/session`
- `GET /api/checkout/session/:sessionId`
- `POST /webhooks/stripe`
- `POST /api/terminal/connection-token`
- `POST /api/terminal/payment-intents`
- `GET /api/terminal/payment-intents/:paymentIntentId`
- `POST /api/terminal/payment-intents/:paymentIntentId/capture`
- `POST /api/terminal/payment-intents/:paymentIntentId/cancel`

## Android Tap to Pay

Panduan penuh ada di [docs/stripe-terminal-android.md](./docs/stripe-terminal-android.md).

Scaffold Android ada di [android-tap-to-pay](./android-tap-to-pay/README.md).

Ringkasnya:

1. Cipta `Stripe Terminal location` dalam dashboard
2. Isi `STRIPE_TERMINAL_LOCATION_ID` pada backend
3. Isi `PAYPLUS_BACKEND_URL` dan `PAYPLUS_TERMINAL_LOCATION_ID` dalam `android-tap-to-pay/gradle.properties`
4. Buka folder `android-tap-to-pay` dalam Android Studio
5. Uji `debug` untuk simulasi, `release` untuk live Tap to Pay
