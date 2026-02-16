/**
 * Brevo (formerly Sendinblue) Email Sender
 *
 * Sends transactional emails via the Brevo REST API using native https.
 * No npm dependencies required.
 *
 * Requires environment variable:
 *   BREVO_API_KEY - Brevo API key (xkeysib-...)
 */

import https from 'https';

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  fromName?: string;
}

interface BrevoResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  statusCode?: number;
}

/**
 * Send an email via the Brevo transactional email API.
 */
export async function sendEmail(options: SendEmailOptions): Promise<BrevoResponse> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY environment variable is not set');
  }

  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  const toList = recipients.map((email) => ({ email }));

  const payload = JSON.stringify({
    sender: {
      name: options.fromName || 'StockScreen',
      email: options.from || 'reachtovijendra@gmail.com',
    },
    to: toList,
    subject: options.subject,
    htmlContent: options.html,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.brevo.com',
        port: 443,
        path: '/v3/smtp/email',
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Accept': 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({
                success: true,
                messageId: parsed.messageId,
                statusCode: res.statusCode,
              });
            } else {
              resolve({
                success: false,
                error: parsed.message || parsed.code || 'unknown_error',
                statusCode: res.statusCode || 500,
              });
            }
          } catch {
            resolve({
              success: false,
              error: data,
              statusCode: res.statusCode || 500,
            });
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Brevo API request timeout'));
    });

    req.write(payload);
    req.end();
  });
}
