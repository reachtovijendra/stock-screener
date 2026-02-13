/**
 * Resend Email Client
 * Sends emails via the Resend REST API using native https (no npm dependency).
 */

import https from 'https';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

interface ResendResponse {
  id?: string;
  error?: string;
  message?: string;
  statusCode?: number;
}

/**
 * Send an email via the Resend API.
 * Requires RESEND_API_KEY environment variable.
 */
export async function sendEmail(options: SendEmailOptions): Promise<ResendResponse> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }

  const payload = JSON.stringify({
    from: options.from || 'StockScreen <onboarding@resend.dev>',
    to: [options.to],
    subject: options.subject,
    html: options.html,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.resend.com',
        port: 443,
        path: '/emails',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ id: parsed.id, statusCode: res.statusCode });
            } else {
              resolve({
                error: parsed.name || 'unknown_error',
                message: parsed.message || data,
                statusCode: res.statusCode || 500,
              });
            }
          } catch {
            resolve({ error: 'parse_error', message: data, statusCode: res.statusCode || 500 });
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Resend API request timeout'));
    });

    req.write(payload);
    req.end();
  });
}
