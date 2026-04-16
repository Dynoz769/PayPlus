# PayPlus Stripe

Projek ini kini menyokong dua flow Stripe dalam satu codebase:

1. Hosted Checkout untuk web + QR
2. Endpoint backend untuk Tap to Pay Android

## Jalankan

1. Isi `.env`
2. Jalankan `npm install`
3. Jalankan `npm start`
4. Buka `http://localhost:3000`

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
