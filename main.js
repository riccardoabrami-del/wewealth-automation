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

/**
 * Legge la OTP da Gmail in modo robusto:
 * - gestisce possibili schermate intermedie
 * - aspetta più a lungo l’arrivo dell’email
 * - non va in errore duro se non trova tr.zA
 */
async function readOtpFromGmail(browser) {
  const { user, pass } = getGmailCreds();
  if (!user || !pass) {
    console.log('[Gmail] Credenziali non presenti, salto lettura OTP.');
    return null;
  }

  const ctx = await browser.newContext({
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    locale: 'it-IT',
    timezoneId: 'Europe/Rome'
  });
  const page = await ctx.newPage();

  try {
    await page.goto('https://mail.google.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });
    await wait(5000);
    await saveDebug(page, 'debug-gmail-01-landing');

    // Campo email
    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ state: 'visible', timeout: 30000 });
    await emailInput.fill(user);
    console.log('[Gmail] Email inserita, avanzamento...');
    await page.locator('#identifierNext button, #identifierNext').click();
    await wait(4000);
    await saveDebug(page, 'debug-gmail-02-after-email');

    // Campo password (App Password)
    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.waitFor({ state: 'visible', timeout: 60000 });
    await passwordInput.fill(pass);
    console.log('[Gmail] App password inserita, accesso in corso...');
    await page.locator('#passwordNext button, #passwordNext').click();

    await wait(8000);
    await saveDebug(page, 'debug-gmail-03-after-password');

    // Prova a chiudere eventuali popup o tour
    await jsClick(page, 'button[aria-label="Chiudi"], button[aria-label="Close"]')
      .catch(() => {});
    await wait(3000);

    // Aspetta che l’URL contenga "inbox" o che il titolo indichi Gmail
    await Promise.race([
      page.waitForURL(/mail\.google\.com\/mail\/u\/\d+\/#inbox/i, { timeout: 30000 }).catch(() => {}),
      page.waitForFunction(
        () => document.title && document.title.toLowerCase().includes('gmail'),
        null,
        { timeout: 30000 }
      ).catch(() => {})
    ]);

    await saveDebug(page, 'debug-gmail-04-inbox');

    // Aspetta fino a 90s che arrivi almeno una riga email
    const rowLocator = page.locator('tr.zA');
    const maxAttempts = 9;
    let found = false;

    for (let i = 0; i < maxAttempts; i++) {
      const count = await rowLocator.count();
      if (count > 0) {
        try {
          await rowLocator.first().waitFor({ state: 'visible', timeout: 10000 });
          found = true;
          break;
        } catch (_) {
          // retry
        }
      }
      console.log(`[Gmail] Nessuna riga inbox visibile, retry ${i + 1}/${maxAttempts}...`);
      await wait(10000);
    }

    if (!found) {
      console.log('[Gmail] Nessuna email visibile in inbox dopo 90s, salto lettura OTP.');
      await saveDebug(page, 'debug-gmail-05-no-rows');
      return null;
    }

    // Clicca la prima email (più recente)
    await rowLocator.first().click();
    await wait(5000);
    await saveDebug(page, 'debug-gmail-06-open-mail');

    // Qui dovresti estrarre il codice OTP dal contenuto
    // (placeholder: ritorna null per ora, così non rompe il flusso)
    console.log('[Gmail] Email aperta, estrazione OTP da implementare.');
    return null;
  } catch (err) {
    console.error('[Gmail] Errore durante la lettura OTP:', err);
    await saveDebug(page, 'debug-gmail-error');
    return null;
  } finally {
    await ctx.close();
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
    // STEP 1: We‑Wealth
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

    // STEP 2: Gmail
    console.log('Attendo 10 secondi prima di leggere la casella email...');
    await wait(10000);

    const otp = await readOtpFromGmail(browser);
    if (!otp) {
      console.log('OTP non letta (o lettura non ancora implementata), script terminato senza errore.');
    } else {
      console.log(`OTP letta da Gmail: ${otp}`);
      // qui potresti tornare su We‑Wealth e inserirla se ti serve
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
