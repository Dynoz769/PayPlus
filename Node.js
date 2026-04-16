const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = parsePort(process.env.PORT, 3000);
const HOST = process.env.HOST || "0.0.0.0";
const APP_BASE_URL = (process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const TOYYIBPAY_BASE_URL = (process.env.TOYYIBPAY_BASE_URL || "https://toyyibpay.com").replace(/\/+$/, "");
const TOYYIBPAY_USER_SECRET_KEY = process.env.TOYYIBPAY_USER_SECRET_KEY || "";
const TOYYIBPAY_CATEGORY_CODE = process.env.TOYYIBPAY_CATEGORY_CODE || "";
const CREATE_BILL_URL = `${TOYYIBPAY_BASE_URL}/index.php/api/createBill`;
const INDEX_PATH = path.join(__dirname, "index.html");

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, APP_BASE_URL);
    const route = requestUrl.pathname;

    if (req.method === "GET" && (route === "/" || route === "/payment-status")) {
      await sendFile(res, INDEX_PATH, "text/html; charset=utf-8");
      return;
    }

    if (req.method === "GET" && route === "/health") {
      sendJson(res, 200, getHealthPayload());
      return;
    }

    if (req.method === "POST" && route === "/api/create-bill") {
      const body = await parseRequestBody(req);
      const bill = await createToyyibBill(body);
      sendJson(res, 200, bill);
      return;
    }

    if (req.method === "POST" && route === "/toyyibpay/callback") {
      const callback = await parseRequestBody(req);
      handleToyyibPayCallback(callback);
      sendText(res, 200, "Callback diterima");
      return;
    }

    if (req.method === "GET" && route === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }

    sendJson(res, 404, { error: "Route tidak dijumpai." });
  } catch (error) {
    handleServerError(res, error);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`PayPlus server berjalan pada ${APP_BASE_URL}`);
});

function parsePort(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getHealthPayload() {
  const missing = [];

  if (!TOYYIBPAY_USER_SECRET_KEY) {
    missing.push("TOYYIBPAY_USER_SECRET_KEY");
  }

  if (!TOYYIBPAY_CATEGORY_CODE) {
    missing.push("TOYYIBPAY_CATEGORY_CODE");
  }

  return {
    configured: missing.length === 0,
    missing,
    appBaseUrl: APP_BASE_URL,
    toyyibpayBaseUrl: TOYYIBPAY_BASE_URL
  };
}

async function createToyyibBill(payload) {
  const health = getHealthPayload();

  if (!health.configured) {
    throw new HttpError(500, `Konfigurasi belum lengkap: ${health.missing.join(", ")}`);
  }

  const amount = Number.parseFloat(payload.amount);
  const description = sanitizeBillField(payload.description, 100);
  const reference = sanitizeText(payload.reference, 80);
  const billTo = sanitizeBillField(payload.billTo, 60);
  const billEmail = sanitizeEmail(payload.billEmail);
  const billPhone = sanitizePhone(payload.billPhone);

  if (!Number.isFinite(amount) || amount < 1) {
    throw new HttpError(400, "Jumlah bayaran mesti sekurang-kurangnya RM1.00.");
  }

  if (!description) {
    throw new HttpError(400, "Deskripsi bayaran diperlukan.");
  }

  if (!billTo) {
    throw new HttpError(400, "Nama pembayar diperlukan.");
  }

  if (!billEmail) {
    throw new HttpError(400, "Email pembayar diperlukan.");
  }

  if (!billPhone) {
    throw new HttpError(400, "Telefon pembayar diperlukan.");
  }

  const cents = Math.round(amount * 100);
  const externalReference = reference || `PAYPLUS-${Date.now()}`;
  const params = new URLSearchParams({
    userSecretKey: TOYYIBPAY_USER_SECRET_KEY,
    categoryCode: TOYYIBPAY_CATEGORY_CODE,
    billName: truncate(description, 30),
    billDescription: description,
    billPriceSetting: "1",
    billPayorInfo: "1",
    billAmount: String(cents),
    billReturnUrl: `${APP_BASE_URL}/payment-status`,
    billCallbackUrl: `${APP_BASE_URL}/toyyibpay/callback`,
    billExternalReferenceNo: externalReference,
    billPaymentChannel: "0"
  });

  params.append("billTo", billTo);
  params.append("billEmail", billEmail);
  params.append("billPhone", billPhone);

  const response = await fetch(CREATE_BILL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const raw = await response.text();
  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new HttpError(502, `Respons ToyyibPay tidak sah: ${raw}`);
  }

  if (!response.ok) {
    throw new HttpError(502, `ToyyibPay memulangkan ralat HTTP ${response.status}.`);
  }

  const bill = Array.isArray(parsed) ? parsed[0] : parsed;
  const billCode = bill && (bill.BillCode || bill.billCode);

  if (!billCode) {
    throw new HttpError(502, `BillCode tidak ditemui dalam respons ToyyibPay: ${raw}`);
  }

  const paymentUrl = `${TOYYIBPAY_BASE_URL}/${billCode}`;

  return {
    amount,
    billCode,
    paymentUrl,
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(paymentUrl)}`
  };
}

function handleToyyibPayCallback(payload) {
  const receivedHash = String(payload.hash || "").toLowerCase();
  const status = String(payload.status || "");
  const orderId = String(payload.order_id || "");
  const refNo = String(payload.refno || "");

  if (!receivedHash) {
    throw new HttpError(400, "Hash callback tidak diterima.");
  }

  const expectedHash = crypto
    .createHash("md5")
    .update(`${TOYYIBPAY_USER_SECRET_KEY}${status}${orderId}${refNo}ok`)
    .digest("hex");

  if (expectedHash !== receivedHash) {
    throw new HttpError(400, "Hash callback ToyyibPay tidak sah.");
  }

  const paymentState = getToyyibPayStatusLabel(status);
  console.log("Callback ToyyibPay diterima:", {
    billCode: payload.billcode,
    orderId,
    refNo,
    amount: payload.amount,
    status,
    paymentState,
    reason: payload.reason || "",
    transactionTime: payload.transaction_time || "",
    raw: payload
  });
}

function getToyyibPayStatusLabel(status) {
  switch (String(status)) {
    case "1":
      return "success";
    case "2":
      return "pending";
    case "3":
      return "failed";
    default:
      return "unknown";
  }
}

async function parseRequestBody(req) {
  const raw = await readRequest(req);
  const contentType = req.headers["content-type"] || "";

  if (!raw) {
    return {};
  }

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new HttpError(400, "Body JSON tidak sah.");
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    return Object.fromEntries(params.entries());
  }

  return {};
}

function readRequest(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1_000_000) {
        reject(new HttpError(413, "Body terlalu besar."));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sanitizeText(value, maxLength) {
  return truncate(String(value || "").replace(/\s+/g, " ").trim(), maxLength);
}

function sanitizeBillField(value, maxLength) {
  const cleaned = String(value || "")
    .replace(/[^\p{L}\p{N}_ ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return truncate(cleaned, maxLength);
}

function sanitizeEmail(value) {
  return truncate(String(value || "").trim(), 120);
}

function sanitizePhone(value) {
  return truncate(String(value || "").replace(/[^\d+]/g, "").trim(), 20);
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength);
}

async function sendFile(res, filePath, contentType) {
  const data = await fs.promises.readFile(filePath);
  res.writeHead(200, { "Content-Type": contentType });
  res.end(data);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function handleServerError(res, error) {
  if (error instanceof HttpError) {
    sendJson(res, error.statusCode, { error: error.message });
    return;
  }

  console.error("Ralat server:", error);
  sendJson(res, 500, { error: "Ralat dalaman server." });
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
