/**
 * Gmail SMTP Email Sender
 *
 * Sends emails via Gmail SMTP using native Node.js tls module.
 * No npm dependencies required.
 *
 * Requires environment variables:
 *   GMAIL_USER     - Gmail address (e.g., reachtovijendra@gmail.com)
 *   GMAIL_APP_PASS - Gmail App Password (16-char, from Google Account > Security > App Passwords)
 */

import * as tls from 'tls';

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

interface SmtpResponse {
  success: boolean;
  message: string;
}

function smtpCommand(socket: tls.TLSSocket, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`SMTP timeout for: ${command}`)), 10000);

    const onData = (data: Buffer) => {
      clearTimeout(timeout);
      socket.removeListener('data', onData);
      resolve(data.toString());
    };

    socket.on('data', onData);
    socket.write(command + '\r\n');
  });
}

function waitForGreeting(socket: tls.TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('SMTP greeting timeout')), 10000);

    const onData = (data: Buffer) => {
      clearTimeout(timeout);
      socket.removeListener('data', onData);
      resolve(data.toString());
    };

    socket.on('data', onData);
  });
}

/**
 * Send an email via Gmail SMTP (TLS on port 465).
 */
export async function sendEmail(options: SendEmailOptions): Promise<SmtpResponse> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASS;

  if (!user || !pass) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASS environment variables are required');
  }

  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  const fromAddr = options.from || `StockScreen <${user}>`;

  // Build MIME message
  const boundary = '----=_Part_' + Date.now().toString(36);
  const message = [
    `From: ${fromAddr}`,
    `To: ${recipients.join(', ')}`,
    `Subject: ${options.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    `Date: ${new Date().toUTCString()}`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    options.html,
    '',
    `--${boundary}--`,
    '',
    '.',
  ].join('\r\n');

  return new Promise((resolve, reject) => {
    const socket = tls.connect(465, 'smtp.gmail.com', { rejectUnauthorized: true }, async () => {
      try {
        // Wait for server greeting
        const greeting = await waitForGreeting(socket);
        if (!greeting.startsWith('220')) {
          throw new Error(`Unexpected greeting: ${greeting.trim()}`);
        }

        // EHLO
        const ehlo = await smtpCommand(socket, `EHLO stockscreen`);
        if (!ehlo.startsWith('250')) {
          throw new Error(`EHLO failed: ${ehlo.trim()}`);
        }

        // AUTH LOGIN
        const authStart = await smtpCommand(socket, 'AUTH LOGIN');
        if (!authStart.startsWith('334')) {
          throw new Error(`AUTH LOGIN failed: ${authStart.trim()}`);
        }

        // Send username (base64)
        const userResp = await smtpCommand(socket, Buffer.from(user).toString('base64'));
        if (!userResp.startsWith('334')) {
          throw new Error(`Username rejected: ${userResp.trim()}`);
        }

        // Send password (base64)
        const passResp = await smtpCommand(socket, Buffer.from(pass).toString('base64'));
        if (!passResp.startsWith('235')) {
          throw new Error(`Authentication failed: ${passResp.trim()}`);
        }

        // MAIL FROM
        const mailFrom = await smtpCommand(socket, `MAIL FROM:<${user}>`);
        if (!mailFrom.startsWith('250')) {
          throw new Error(`MAIL FROM failed: ${mailFrom.trim()}`);
        }

        // RCPT TO (for each recipient)
        for (const rcpt of recipients) {
          const rcptTo = await smtpCommand(socket, `RCPT TO:<${rcpt}>`);
          if (!rcptTo.startsWith('250')) {
            throw new Error(`RCPT TO failed for ${rcpt}: ${rcptTo.trim()}`);
          }
        }

        // DATA
        const dataResp = await smtpCommand(socket, 'DATA');
        if (!dataResp.startsWith('354')) {
          throw new Error(`DATA failed: ${dataResp.trim()}`);
        }

        // Send message body (ending with \r\n.\r\n)
        const sendResp = await smtpCommand(socket, message);
        if (!sendResp.startsWith('250')) {
          throw new Error(`Message send failed: ${sendResp.trim()}`);
        }

        // QUIT
        socket.write('QUIT\r\n');
        socket.end();

        resolve({ success: true, message: sendResp.trim() });
      } catch (err: any) {
        socket.destroy();
        reject(err);
      }
    });

    socket.on('error', (err) => {
      reject(new Error(`SMTP connection error: ${err.message}`));
    });

    socket.setTimeout(30000, () => {
      socket.destroy();
      reject(new Error('SMTP connection timeout'));
    });
  });
}
