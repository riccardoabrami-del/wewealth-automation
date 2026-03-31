const { chromium, devices } = require('playwright');
const fs = require('fs');
const Imap = require('imap');
const { simpleParser } = require('mailparser');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generaEmailWeWealth() {
  const n1 = Math.floor(Math.random() * 10);
  const n2 = Math.floor(Math.random() * 10);
  const n3 = Math.floor(Math.random() * 10);
  return `riccardo.abrami+${n1}${n2}${n3}@we-wealth.com`;
}

async function saveDebug(page, name) {
  try {
    await page.screenshot({ path: `${name}.png`, fullPage: true });
  } catch (_) {}
  try {
    const html = await page.content();
    fs.writeFileSync(`${name}.html`, html || '', 'utf8');
  } catch (_) {}
  console.log(`Debug salvato: ${name}.png / ${name}.html`);
}

async function jsClick(page, selector) {
  const clicked = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      el.click();
      return true;
    }
    return false;
  }, selector);
  return clicked;
}

function getGmailCreds() {
  const user =
    process.env.EMAIL_USER ||
    process.env.email_user ||
    process.env.GMAIL_USER ||
    '';
  const pass =
    process.env.EMAIL_APP_PASSWORD ||
    process.env.EMAIL_USER_PASSWORD ||
    process.env.gmail_app_password ||
    '';
  return { user, pass };
}

function extractOtp(text) {
  if (!text) return null;

  const patterns = [
    /\b(\d{6})\b/,
    /codice[^0-9]{0,20}(\d{6})/i,
    /otp[^0-9]{0,20}(\d{6})/i,
    /verification code[^0-9]{0,20}(\d{6})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }

  return null;
}

async function readLatestOtpFromGmailIMAP(expectedEmail) {
  const { user, pass } = getGmailCreds();

  if (!user || !pass) {
    console.log('[IMAP] Credenziali Gmail non presenti.');
    return null;
  }

  return new Promise((resolve) => {
    const imap = new Imap({
      user,
      password: pass,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      connTimeout: 30000,
      authTimeout: 30000,
      tlsOptions: { rejectUnauthorized: false }
    });

    let resolved = false;

    const done = (value) => {
      if (!resolved) {
        resolved = true;
        try { imap.end(); } catch (_) {}
        resolve(value);
      }
    };

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err) => {
        if (err) {
          console.error('[IMAP] Errore openBox:', err);
          return done(null);
        }

        imap.search(['ALL'], (err, results) => {
          if (err) {
            console.error('[IMAP] Errore search:', err);
            return done(null);
          }

          if (!results || !results.length) {
            console.log('[IMAP] Nessuna email trovata.');
            return done(null);
          }

          const latestIds = results.slice(-10);
          const fetch = imap.fetch(latestIds, { bodies: '' });
          const emails = [];

          fetch.on('message', (msg, seqno) => {
            let rawBuffer = '';

            msg.on('body', (stream) => {
              stream.on('data', (chunk) => {
                rawBuffer += chunk.toString('utf8');
              });
            });

            msg.once('attributes', (attrs) => {
              emails.push({
                seqno,
                raw: () => rawBuffer,
                date: attrs.date || new Date(0)
              });
            });
          });

          fetch.once('error', (err) => {
            console.error('[IMAP] Errore fetch:', err);
            done(null);
          });

          fetch.once('end', async () => {
            try {
              emails.sort((a, b) => new Date(b.date) - new Date(a.date));

              for (const item of emails) {
                const mail = await simpleParser(item.raw());
                const subject = mail.subject || '';
                const text = mail.text || '';
                const html = typeof mail.html === 'string' ? mail.html : '';
                const combined = `${subject}\n${text}\n${html}`;

                const isRelevant =
                  combined.toLowerCase().includes('we-wealth') ||
                  combined.toLowerCase().includes('wewealth') ||
                  combined.toLowerCase().includes('otp') ||
                  combined.toLowerCase().includes('codice') ||
                  combined.toLowerCase().includes(expectedEmail.toLowerCase());

                if (!isRelevant) continue;

                const otp = extractOtp(combined);
                if (otp) {
                  console.log(`[IMAP] OTP trovata: ${otp}`);
                  return done(otp);
                }
              }

              console.log('[IMAP] Nessuna OTP trovata nelle ultime email.');
              done(null);
            } catch (e) {
              console.error('[IMAP] Errore parsing email:', e);
              done(null);
            }
          });
        });
      });
    });

    imap.once('error', (err) => {
      console.error('[IMAP] Errore connessione IMAP:', err);
      done(null);
    });

    imap.once('end', () => {
      if (!resolved) done(null);
    });

    imap.connect();
  });
}

async function pollOtpFromGmail(expectedEmail, attempts = 12, delayMs = 10000) {
  for (let i = 0; i < attempts; i++) {
    console.log(`[IMAP] Tentativo lettura OTP ${i + 1}/${attempts}...`);
    const otp = await readLatestOtpFromGmailIMAP(expectedEmail);
    if (otp) return otp;
    await wait(delayMs);
  }
  return null;
}

async function main() {
  const desktop = devices['Desktop Chrome'];
  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    ...desktop,
    viewport: { width: 1440, height: 900 },
    locale: 'it-IT',
    timezoneId: 'Europe/Rome'
  });

  const page = await context.newPage();

  try {
    await page.goto('https://www.we-wealth.com', {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });

    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await wait(8000);
    await saveDebug(page, 'debug-ww-01-home');

    const cookieClicked = await jsClick(page, 'a.ww-cookiebanner__brand');
    console.log(cookieClicked ? 'Cookie banner chiuso via JS.' : 'Cookie banner non trovato.');
    await wait(2000);
    await saveDebug(page, 'debug-ww-02-after-cookie');

    const accediClicked = await jsClick(page, 'a.btn-accedi.otp-popup-button');
    if (!accediClicked) {
      throw new Error('Non trovato a.btn-accedi.otp-popup-button nel DOM');
    }
    console.log('Link Accedi cliccato via JS.');

    await wait(3000);
    await saveDebug(page, 'debug-ww-03-after-accedi');

    const preEmailClicked = await jsClick(page, '#otp-submit-button');
    if (preEmailClicked) {
      console.log('Bottone otp-submit-button cliccato.');
    } else {
      try {
        await page.locator('#otp-submit-button').waitFor({ state: 'visible', timeout: 10000 });
        await jsClick(page, '#otp-submit-button');
        console.log('Bottone otp-submit-button cliccato (dopo attesa).');
      } catch (_) {
        console.log('otp-submit-button non trovato, procedo.');
      }
    }

    await wait(3000);
    await saveDebug(page, 'debug-ww-04-before-email');

    const emailInput = page.locator('#otp-email').first();
    await emailInput.waitFor({ state: 'visible', timeout: 20000 });

    const email = generaEmailWeWealth();
    console.log(`Email generata: ${email}`);
    await emailInput.fill(email);
    console.log(`Email inserita: ${email}`);

    const inviaCodiceBtn = page.locator('#otp-start-process').first();
    await inviaCodiceBtn.waitFor({ state: 'visible', timeout: 15000 });
    await inviaCodiceBtn.click();
    console.log('Bottone "Invia codice via email" cliccato.');

    await wait(5000);
    await saveDebug(page, 'debug-ww-05-after-send-otp');
    console.log('Step 1 completato — email OTP inviata.');

    console.log('Attendo OTP via IMAP...');
    const otp = await pollOtpFromGmail(email, 12, 10000);

    if (!otp) {
      console.log('OTP non letta via IMAP.');
    } else {
      console.log(`OTP letta da Gmail via IMAP: ${otp}`);

      await page.bringToFront();

      const otpInput = page.locator('#otp-code, input[name="otp"], input[type="tel"]').first();
      await otpInput.waitFor({ state: 'visible', timeout: 20000 });
      await otpInput.fill(otp);
      console.log('OTP inserita nel campo.');

      // Prima prova con Enter
      await otpInput.press('Enter').catch(() => {});
      await wait(3000);

      // Poi cerca un bottone davvero visibile e con testo coerente
      const buttonCandidates = page.locator('button:visible, input[type="submit"]:visible, a[role="button"]:visible');
      const count = await buttonCandidates.count();
      let clicked = false;

      for (let i = 0; i < count; i++) {
        const btn = buttonCandidates.nth(i);
        const text = ((await btn.innerText().catch(() => '')) || '').trim();

        if (/conferma|verifica|accedi|continua|invia/i.test(text)) {
          await btn.click().catch(() => {});
          console.log(`Conferma OTP cliccata su bottone: "${text}"`);
          clicked = true;
          break;
        }
      }

      if (!clicked) {
        console.log('Nessun bottone conferma OTP visibile trovato, proseguo dopo Enter.');
      }

      await wait(5000);
      await saveDebug(page, 'debug-ww-06-after-otp');
    }

    console.log('Script completato con successo.');
  } catch (error) {
    console.error('Errore durante esecuzione:', error);
    await saveDebug(page, 'debug-error');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
