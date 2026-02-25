/**
 * Test Brevo email sending.
 * Usage: $env:BREVO_API_KEY="xkeysib-..."; node test-email.js
 */

const https = require('https');

const API_KEY = process.env.BREVO_API_KEY;
if (!API_KEY) {
  console.error('ERROR: Set BREVO_API_KEY environment variable.');
  console.error('Usage: $env:BREVO_API_KEY="xkeysib-..."; node test-email.js');
  process.exit(1);
}

const payload = JSON.stringify({
  sender: { name: 'StockScreen', email: 'reachtovijendra@gmail.com' },
  to: [
    { email: 'reachtovijendra@gmail.com' },
    { email: 'vijendra.tadavarthy@acacceptance.com' },
  ],
  subject: 'StockScreen Test Email - ' + new Date().toISOString(),
  htmlContent: '<h1>Test Email from StockScreen</h1><p>If you see this, Brevo email delivery is working correctly.</p><p>Sent at: ' + new Date().toISOString() + '</p>',
});

console.log('Sending test email via Brevo...');
console.log('API Key (first 15 chars):', API_KEY.substring(0, 15) + '...');
console.log('To: reachtovijendra@gmail.com, vijendra.tadavarthy@acacceptance.com');
console.log('');

const req = https.request(
  {
    hostname: 'api.brevo.com',
    port: 443,
    path: '/v3/smtp/email',
    method: 'POST',
    headers: {
      'api-key': API_KEY,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Accept': 'application/json',
    },
  },
  (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      console.log('HTTP Status:', res.statusCode);
      console.log('Response:', data);
      console.log('');

      try {
        const parsed = JSON.parse(data);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('SUCCESS! Message ID:', parsed.messageId);
          console.log('Check your inbox at both email addresses.');
        } else {
          console.log('FAILED!');
          console.log('Error:', parsed.message || parsed.code || data);
        }
      } catch {
        console.log('Raw response:', data);
      }
    });
  }
);

req.on('error', (err) => {
  console.error('Request error:', err.message);
});

req.write(payload);
req.end();
