const fetch = require('node-fetch');

// API key yang selamat
const API_KEY = 'iu4sht0f-mzlb-5ddg-iijw-265j9wfonsfo';

// URL ToyyibPay API untuk membuat invois
const url = "https://toyyibpay.com/index.php/api/createBill";

// Fungsi untuk membuat invois menggunakan API
async function createToyyibBill(amount, description) {
  const params = new URLSearchParams();
  params.append("userSecretKey", API_KEY);  // API Key dari ToyyibPay
  params.append("categoryCode", "YOUR_CATEGORY_CODE");  // Kod kategori dari dashboard ToyyibPay
  params.append("billName", description);
  params.append("billDescription", description);
  params.append("billAmount", amount * 100);  // Bayaran dalam sen
  params.append("billReturnUrl", "https://yourwebsite.com/payment-success");  // URL pengesahan pembayaran
  params.append("billCallbackUrl", "https://yourwebsite.com/toyyibpay/callback");  // URL callback pembayaran

  const response = await fetch(url, {
    method: "POST",
    body: params,
  });

  const result = await response.json();
  return result;  // Akan return billCode & payment URL
}

// Contoh penggunaan untuk mencipta bill
createToyyibBill(50.00, "Pembayaran Produk A")
  .then((data) => {
    console.log("Bill Created:", data);
    // Dapatkan payment URL atau QR Code untuk pelanggan
    console.log("Payment URL:", data.paymentUrl);  // URL pembayaran
  })
  .catch((err) => {
    console.error("Error:", err);
  });
