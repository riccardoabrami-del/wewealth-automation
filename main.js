const { chromium, devices } = require('playwright');
const fs = require('fs');

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
  } catch (_) {
    fs.writeFileSync(`${name}.html`, '', 'utf8');
  }
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

// Legge la password per le app da variabile d'ambiente
function getAppPassword() {
  const appPassword =
    process.env.EMAIL_APP_PASSWORD ||
    process.env.EMAIL_USER_PASSWORD ||
    '';

  if (!appPassword) {
    throw new Error(
      "Variabile d'ambiente EMAIL_APP_PASSWORD (o EMAIL_USER_PASSWORD) non trovata. " +
      "Configura una App Password Gmail come secret in GitHub e mappala in env."
    );
  }
  return appPassword;
}

// Chiude eventuale tour/benvenuto Gmail o altre schermate intermedie
async function handleGmailIntersticials(page) {
  // A volte Gmail mostra un pulsante "Avanti", "OK", "Capito" o simile
  const possibleButtons = [
    'button:has-text("Avanti")',
    'button:has-text("OK")',
    'button:has-text("Capito")',
    'button:has-text("Inizia")'
  ];

  for (const sel of possibleButtons) {
    const btn = page.locator(sel);
    if (await btn.count()) {
      try {
        await btn.first().click({ timeout: 2000 });
        await wait(2000);
        await saveDebug(page, 'debug-gmail-interstitial-dismissed');
      } catch (_) {}
    }
  }
}

// Trova la prima riga email in inbox in modo più robusto
async function getFirstInboxRow(page) {
  // Layout classico
  let row = page.locator('tr.zA').first();
  if (await row.count()) {
    return row;
  }

  // Layout alternativo / modalità compatta
  row = page.locator('tr[role="row"]:has(td[role="gridcell"])').first();
  if (await row.count()) {
    return row;
  }

  // Fallback generico: qualsiasi riga cliccabile nella tabella principale
  row = page.locator('table[role="grid"] tr[role="row"]').first();
  return row;
}

async function readOtpFromGmail(appPassword) {
  const gmailBrowser = await chromium.launch({ headless: true });
  const gmailContext = await gmailBrowser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'it-IT',
    timezoneId: 'Europe/Rome'
  });
  const gmailPage = await gmailContext.newPage();

  try {
    await gmailPage.goto('https://mail.google.com', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await wait(3000);
    await saveDebug(gmailPage, 'debug-gmail-01-landing');

    // Email
    await gmailPage.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 20000 });
    await gmailPage.locator('input[type="email"]').fill('riccardo.abrami@we-wealth.com');
    await wait(1000);
    await gmailPage.locator('#identifierNext').click();
    console.log('[Gmail] Email inserita, avanzamento...');
    await wait(4000);
    await saveDebug(gmailPage, 'debug-gmail-02-after-email');

    // Password (app password)
    await gmailPage.locator('input[type="password"]').waitFor({ state: 'visible', timeout: 20000 });
    await gmailPage.locator('input[type="password"]').fill(appPassword);
    await wait(1000);
    await gmailPage.locator('#passwordNext').click();
    console.log('[Gmail] App password inserita, accesso in corso...');
    await wait(6000);
    await saveDebug(gmailPage, 'debug-gmail-03-after-password');

    // Attendi inbox o schermata principale
    await gmailPage.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await wait(4000);

    await handleGmailIntersticials(gmailPage);

    // Assicurati di essere in qualche vista di posta
    await gmailPage.waitForTimeout(3000);
    await saveDebug(gmailPage, 'debug-gmail-04-inbox');

    // Trova la prima riga email
    const emailRow = await getFirstInboxRow(gmailPage);
    await emailRow.waitFor({ state: 'visible', timeout: 40000 });
    await emailRow.click();
    console.log('[Gmail] Apertura email più recente...');
    await wait(4000);
    await saveDebug(gmailPage, 'debug-gmail-05-email-open');

    // Corpo email
    const emailBodyLocator = gmailPage.locator('.a3s.aiL, div[data-message-id] .a3s').first();
    const emailBody = await emailBodyLocator.innerText({ timeout: 20000 });

    console.log('[Gmail] Corpo email (primi 300 chars):', emailBody.substring(0, 300));

    const otpMatch = emailBody.match(/\b([A-Z0-9]{6})\b/);
    if (!otpMatch) {
      throw new Error('[Gmail] OTP non trovato nel corpo email');
    }

    const otp = otpMatch[1];
    console.log(`[Gmail] OTP estratto: ${otp}`);
    return otp;
  } finally {
    await saveDebug(gmailPage, 'debug-gmail-06-final');
    await gmailBrowser.close();
  }
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
    // ── STEP 1: WeWealth — invio email OTP ────────────────────────────────
    await page.goto('https://www.we-wealth.com', {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });

    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await wait(8000);
    await saveDebug(page, 'debug-ww-01-home');

    const cookieClicked = await jsClick(page, 'a.ww-cookiebanner__brand');
    if (cookieClicked) {
      console.log('Cookie banner chiuso via JS.');
    } else {
      console.log('Cookie banner non trovato.');
    }
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

    // ── STEP 2: Gmail — leggi OTP e inseriscilo ──────────────────────────
    const appPassword = getAppPassword();

    console.log('Attendo 10 secondi prima di leggere la casella email...');
    await wait(10000);

    const otp = await readOtpFromGmail(appPassword);
    console.log(`OTP letto da Gmail: ${otp}`);

    const otpInput = page.locator('#otp-code').first();
    await otpInput.waitFor({ state: 'visible', timeout: 20000 });
    await otpInput.fill(otp);
    console.log('OTP inserito nel campo.');
    await saveDebug(page, 'debug-ww-06-otp-filled');

    const verificaBtn = page.locator('#otp-check-button').first();
    await verificaBtn.waitFor({ state: 'visible', timeout: 10000 });
    await verificaBtn.click();
    console.log('Bottone "Verifica il codice" cliccato.');

    await wait(5000);
    await saveDebug(page, 'debug-ww-07-after-verify');
    console.log('Step 2 completato — OTP verificato con successo.');

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
