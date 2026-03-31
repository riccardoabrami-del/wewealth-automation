const { chromium, devices } = require('playwright');
const fs = require('fs');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generaEmailWeWealth() {
  const n1 = Math.floor(Math.random() * 10);
  const n2 = Math.floor(Math.random() * 10);
  const n3 = Math.floor(Math.random() * 10);
  return `riccardo.abrami+${n1}${n2}${n3}@we-wealth.com`;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomFirstName() {
  return randomChoice(['Luca', 'Marco', 'Andrea', 'Paolo', 'Davide', 'Matteo']);
}

function randomLastName() {
  return randomChoice(['Rossi', 'Bianchi', 'Romano', 'Esposito', 'Ricci', 'Conti']);
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

async function sendSuccessEmail(screenshotPath) {
  const { user, pass } = getGmailCreds();

  if (!user || !pass) {
    console.log('[MAIL] Credenziali Gmail non presenti, salto invio email.');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });

  await transporter.sendMail({
    from: user,
    to: 'milanotoonight@gmail.com',
    subject: 'Registrazione confermata',
    text: 'Registrazione confermata',
    attachments: [
      {
        filename: 'registrazione-confermata.png',
        path: screenshotPath
      }
    ]
  });

  console.log('[MAIL] Email inviata con screenshot allegato.');
}

async function waitForEitherRegistrationOrSuccess(page) {
  for (let i = 0; i < 20; i++) {
    const registrationVisible = await page
      .locator('text=Create an account, text=Crea un account')
      .first()
      .isVisible()
      .catch(() => false);

    if (registrationVisible) return 'registration';

    const successVisible =
      await page.locator('text=Thank you').first().isVisible().catch(() => false) ||
      await page.locator('text=For registering').first().isVisible().catch(() => false) ||
      await page.locator('text=Welcome back to the We-Wealth World').first().isVisible().catch(() => false) ||
      await page.locator('button:has-text("COMPLETE"), button:has-text("CLOSE")').first().isVisible().catch(() => false);

    if (successVisible) return 'success';

    await wait(1500);
  }

  return 'unknown';
}

async function fillRegistrationForm(page) {
  console.log('[FORM] Attendo form di registrazione...');

  await page.locator('text=Create an account, text=Crea un account').first()
    .waitFor({ state: 'visible', timeout: 30000 });

  await saveDebug(page, 'debug-ww-07-registration-form');

  const firstName = randomFirstName();
  const lastName = randomLastName();

  const textInputs = page.locator('input[type="text"]:visible, input:not([type]):visible');
  const inputCount = await textInputs.count();

  if (inputCount >= 1) {
    await textInputs.nth(0).fill(firstName).catch(() => {});
  }
  if (inputCount >= 2) {
    await textInputs.nth(1).fill(lastName).catch(() => {});
  }

  console.log(`[FORM] Nome compilato: ${firstName} ${lastName}`);

  const privateBtn = page.getByRole('button', { name: /i am a private|privato/i }).first();
  if (await privateBtn.count()) {
    await privateBtn.click().catch(() => {});
    console.log('[FORM] Selezionato profilo private.');
  }

  const dailyBtn = page.getByRole('button', { name: /daily|giornaliera/i }).first();
  if (await dailyBtn.count()) {
    await dailyBtn.click().catch(() => {});
    console.log('[FORM] Newsletter selezionata.');
  }

  const checkboxes = page.locator('input[type="checkbox"]');
  const cbCount = await checkboxes.count();

  for (let i = 0; i < cbCount; i++) {
    const cb = checkboxes.nth(i);
    const checked = await cb.isChecked().catch(() => false);
    if (!checked) {
      await cb.check().catch(async () => {
        await cb.click({ force: true }).catch(() => {});
      });
    }
  }

  console.log(`[FORM] Checkbox gestite: ${cbCount}`);

  const signUpBtn = page.getByRole('button', { name: /sign up|registrati/i }).first();
  await signUpBtn.waitFor({ state: 'visible', timeout: 20000 });
  await signUpBtn.click();
  console.log('[FORM] Bottone finale SIGN UP / REGISTRATI cliccato.');
}

async function captureSuccessAndEmail(page) {
  console.log('[SUCCESS] Attendo schermata finale di conferma...');

  for (let i = 0; i < 20; i++) {
    const ok =
      await page.locator('text=Thank you').first().isVisible().catch(() => false) ||
      await page.locator('text=For registering').first().isVisible().catch(() => false) ||
      await page.locator('text=Welcome back to the We-Wealth World').first().isVisible().catch(() => false) ||
      await page.locator('button:has-text("COMPLETE"), button:has-text("CLOSE")').first().isVisible().catch(() => false);

    if (ok) break;
    await wait(1500);
  }

  await wait(3000);

  const finalShot = 'registrazione-confermata.png';
  await page.screenshot({ path: finalShot, fullPage: true });
  console.log(`[SCREENSHOT] Screenshot finale salvato: ${finalShot}`);

  await saveDebug(page, 'debug-ww-08-registration-success');
  await sendSuccessEmail(finalShot);
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

      await wait(1000);

      const confermaBtn = page.locator('#otp-check-button');
      await confermaBtn.waitFor({ state: 'visible', timeout: 20000 });
      await confermaBtn.click();
      console.log('Conferma OTP cliccata.');

      await wait(2000);
      await saveDebug(page, 'debug-ww-06-after-otp');

      const nextStep = await waitForEitherRegistrationOrSuccess(page);
      console.log(`[FLOW] Step successivo rilevato: ${nextStep}`);

      if (nextStep === 'registration') {
        await fillRegistrationForm(page);
        await wait(3000);
      }

      await captureSuccessAndEmail(page);
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
