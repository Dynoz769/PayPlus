const fetch = require('node-fetch');
const express = require('express');
const app = express();

// Middleware untuk memparse body dalam format URL-encoded (seperti yang digunakan ToyyibPay)
app.use(express.urlencoded({ extended: true }));

// API key yang disediakan oleh ToyyibPay
const API_KEY = 'iu4sht0f-mzlb-5ddg-iijw-265j9wfonsfo';

// URL ToyyibPay API untuk membuat invois
const url = "https://toyyibpay.com/index.php/api/createBill";

// Fungsi untuk membuat invois menggunakan API
async function createToyyibBill(amount, description) {
  const params = new URLSearchParams();
  params.append("userSecretKey", API_KEY);
  params.append("categoryCode", "YOUR_CATEGORY_CODE");  // Gantikan dengan kategori kod anda
  params.append("billName", description);
  params.append("billDescription", description);
  params.append("billAmount", amount * 100);  // Bayaran dalam sen
  params.append("billReturnUrl", "https://yourwebsite.com/payment-success");
  params.append("billCallbackUrl", "https://yourwebsite.com/toyyibpay/callback");

  const response = await fetch(url, {
    method: "POST",
    body: params,
  });

  const result = await response.json();
  return result;  // Akan return billCode & payment URL
}

// Endpoint untuk mencipta invois dan mendapatkan QR Code
app.post('/create-bill', async (req, res) => {
  const { amount, description } = req.body;

  if (!amount || !description) {
    return res.status(400).send('Sila masukkan jumlah dan deskripsi bayaran.');
  }

  try {
    const data = await createToyyibBill(amount, description);
    res.json({
      message: 'Bill created successfully!',
      paymentUrl: data.paymentUrl,  // Payment URL yang boleh digunakan untuk QR Code
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${data.paymentUrl}` // QR Code URL
    });
  } catch (error) {
    res.status(500).send('Error creating bill');
  }
});

// Endpoint untuk menerima callback dari ToyyibPay
app.post('/toyyibpay/callback', (req, res) => {
  console.log('Callback Data:', req.body);

  // Semak status pembayaran (contoh: success)
  if (req.body.status === 'Success') {
    // Lakukan tindakan seperti mengemaskini status pesanan di database
    console.log('Pembayaran berjaya!');
  } else {
    console.log('Pembayaran gagal!');
  }

  // Hantar response 200 OK untuk ToyyibPay
  res.status(200).send('Callback diterima');
});

// Jalankan server pada port 3000
app.listen(3000, () => {
  console.log('Server berjalan pada http://localhost:3000');
});
