require("dotenv").config();

const express = require("express");
const os = require("os");
const path = require("path");
const Stripe = require("stripe");

const app = express();

const PORT = parsePort(process.env.PORT, 3000);
const APP_BASE_URL = (process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const APP_ALLOWED_ORIGINS = parseAllowedOrigins(process.env.APP_ALLOWED_ORIGINS);
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const STRIPE_CURRENCY = (process.env.STRIPE_CURRENCY || "myr").toLowerCase();
const STRIPE_TERMINAL_LOCATION_ID = process.env.STRIPE_TERMINAL_LOCATION_ID || "";
const STRIPE_TERMINAL_CAPTURE_METHOD = normalizeCaptureMethod(process.env.STRIPE_TERMINAL_CAPTURE_METHOD);

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const recentEvents = [];

app.set("trust proxy", true);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigin = resolveAllowedOrigin(origin);

  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Stripe-Signature");

  if (req.headers["access-control-request-private-network"] === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

app.post("/webhooks/stripe", express.raw({ type: "application/json" }), (req, res) => {
  if (!stripe) {
    res.status(500).send("STRIPE_SECRET_KEY belum diisi.");
    return;
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    res.status(500).send("STRIPE_WEBHOOK_SECRET belum diisi.");
    return;
  }

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      STRIPE_WEBHOOK_SECRET
    );

    rememberEvent(event);
    logEvent(event);
    res.json({ received: true });
  } catch (error) {
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
  res.json(getHealthPayload(req));
});

app.get("/api/config", (req, res) => {
  res.json(getHealthPayload(req));
});

app.post("/api/checkout/session", async (req, res) => {
  if (!requireStripe(res)) {
    return;
  }

  const amount = parseAmountToMinor(req.body.amount);

  if (amount < 100) {
    res.status(400).json({ error: "Jumlah bayaran mesti sekurang-kurangnya RM1.00." });
    return;
  }

  try {
    const baseUrl = getRequestBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${baseUrl}/?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?status=cancelled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: STRIPE_CURRENCY,
            unit_amount: amount,
            product_data: {
              name: "PayPlus Stripe Checkout",
              description: "Hosted checkout untuk web dan QR"
            }
          }
        }
      ],
      metadata: {
        integration: "payplus_web_checkout"
      }
    });

    res.json({
      id: session.id,
      url: session.url,
      amount,
      currency: STRIPE_CURRENCY
    });
  } catch (error) {
    handleStripeError(res, error);
  }
});

app.get("/api/checkout/session/:sessionId", async (req, res) => {
  if (!requireStripe(res)) {
    return;
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId, {
      expand: ["payment_intent"]
    });

    res.json({
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
      paymentIntentId: session.payment_intent && session.payment_intent.id
    });
  } catch (error) {
    handleStripeError(res, error);
  }
});

app.post("/api/terminal/connection-token", async (req, res) => {
  if (!requireStripe(res)) {
    return;
  }

  try {
    const location = sanitizeText(req.body.location || STRIPE_TERMINAL_LOCATION_ID, 120);
    const token = await stripe.terminal.connectionTokens.create(location ? { location } : {});
    res.json({
      secret: token.secret,
      location: location || null
    });
  } catch (error) {
    handleStripeError(res, error);
  }
});

app.post("/api/terminal/payment-intents", async (req, res) => {
  if (!requireStripe(res)) {
    return;
  }

  const amount = parseAmountToMinor(req.body.amount);
  const captureMethod = normalizeCaptureMethod(req.body.captureMethod) || STRIPE_TERMINAL_CAPTURE_METHOD;
  const description = sanitizeText(req.body.description || "PayPlus Tap to Pay Android", 200);

  if (amount < 100) {
    res.status(400).json({ error: "Jumlah bayaran mesti sekurang-kurangnya RM1.00." });
    return;
  }

  try {
    const intent = await stripe.paymentIntents.create({
      amount,
      currency: STRIPE_CURRENCY,
      capture_method: captureMethod,
      payment_method_types: ["card_present"],
      description,
      metadata: {
        integration: "payplus_tap_to_pay_android"
      }
    });

    res.json({
      id: intent.id,
      clientSecret: intent.client_secret,
      status: intent.status,
      amount: intent.amount,
      currency: intent.currency,
      captureMethod: intent.capture_method
    });
  } catch (error) {
    handleStripeError(res, error);
  }
});

app.get("/api/terminal/payment-intents/:paymentIntentId", async (req, res) => {
  if (!requireStripe(res)) {
    return;
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(req.params.paymentIntentId);
    res.json({
      id: intent.id,
      clientSecret: intent.client_secret,
      status: intent.status,
      amount: intent.amount,
      currency: intent.currency,
      captureMethod: intent.capture_method
    });
  } catch (error) {
    handleStripeError(res, error);
  }
});

app.post("/api/terminal/payment-intents/:paymentIntentId/capture", async (req, res) => {
  if (!requireStripe(res)) {
    return;
  }

  try {
    const amountToCapture = parseOptionalAmountToMinor(req.body.amount);
    const intent = await stripe.paymentIntents.capture(
      req.params.paymentIntentId,
      amountToCapture ? { amount_to_capture: amountToCapture } : {}
    );

    res.json({
      id: intent.id,
      status: intent.status,
      amountReceived: intent.amount_received
    });
  } catch (error) {
    handleStripeError(res, error);
  }
});

app.post("/api/terminal/payment-intents/:paymentIntentId/cancel", async (req, res) => {
  if (!requireStripe(res)) {
    return;
  }

  try {
    const intent = await stripe.paymentIntents.cancel(req.params.paymentIntentId);
    res.json({
      id: intent.id,
      status: intent.status
    });
  } catch (error) {
    handleStripeError(res, error);
  }
});

app.get("/api/webhooks/recent", (req, res) => {
  res.json({ events: recentEvents });
});

app.use(express.static(__dirname));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log("PayPlus Stripe server berjalan pada:");
  for (const url of getServerUrls(PORT)) {
    console.log(`- ${url}`);
  }
});

function parsePort(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseAllowedOrigins(value) {
  const defaults = [
    APP_BASE_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://dynoz769.github.io"
  ];

  const configured = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return [...new Set([...defaults, ...configured])];
}

function resolveAllowedOrigin(origin) {
  if (!origin) {
    return null;
  }

  return APP_ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

function parseAmountToMinor(value) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function parseOptionalAmountToMinor(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const amount = parseAmountToMinor(value);
  return amount > 0 ? amount : null;
}

function sanitizeText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function getRequestBaseUrl(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const protocol = forwardedProto || req.protocol || "http";
  const host = forwardedHost || req.get("host");

  if (host) {
    return `${protocol}://${host}`;
  }

  return APP_BASE_URL;
}

function normalizeCaptureMethod(value) {
  if (String(value).toLowerCase() === "automatic") {
    return "automatic";
  }

  return "manual";
}

function getHealthPayload(req) {
  const missing = [];

  if (!STRIPE_SECRET_KEY) {
    missing.push("STRIPE_SECRET_KEY");
  }

  return {
    ready: {
      checkout: Boolean(STRIPE_SECRET_KEY),
      terminal: Boolean(STRIPE_SECRET_KEY),
      webhook: Boolean(STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET)
    },
    missing,
    mode: getStripeMode(STRIPE_SECRET_KEY),
    appBaseUrl: APP_BASE_URL,
    requestBaseUrl: req ? getRequestBaseUrl(req) : APP_BASE_URL,
    currency: STRIPE_CURRENCY,
    terminal: {
      locationId: STRIPE_TERMINAL_LOCATION_ID || null,
      captureMethod: STRIPE_TERMINAL_CAPTURE_METHOD
    }
  };
}

function getServerUrls(port) {
  const urls = new Set([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`
  ]);

  const interfaces = os.networkInterfaces();

  for (const group of Object.values(interfaces)) {
    for (const network of group || []) {
      if (network.family !== "IPv4" || network.internal) {
        continue;
      }

      urls.add(`http://${network.address}:${port}`);
    }
  }

  return [...urls];
}

function getStripeMode(secretKey) {
  if (secretKey.startsWith("sk_live_")) {
    return "live";
  }

  if (secretKey.startsWith("sk_test_")) {
    return "test";
  }

  return "unknown";
}

function rememberEvent(event) {
  recentEvents.unshift({ id: event.id, type: event.type, created: event.created });

  if (recentEvents.length > 20) {
    recentEvents.length = 20;
  }
}

function logEvent(event) {
  console.log(`Stripe webhook ${event.type}`);
}

function requireStripe(res) {
  if (!stripe) {
    res.status(500).json({ error: "STRIPE_SECRET_KEY belum diisi." });
    return false;
  }

  return true;
}

function handleStripeError(res, error) {
  console.error("Stripe error:", error);
  res.status(error.statusCode || 500).json({ error: error.message || "Ralat Stripe backend." });
}
