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
  await page.screenshot({ path: `${name}.png`, fullPage: true }).catch(() => {});
  const html = await page.content().catch(() => '');
  fs.writeFileSync(`${name}.html`, html || '', 'utf8');
  console.log(`Debug salvato: ${name}.png / ${name}.html`);
}

async function jsClick(page, selector) {
  const clicked = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) { el.click(); return true; }
    return false;
  }, selector);
  return clicked;
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
    await saveDebug(page, 'debug-home');

    // Accetta cookie banner via JS click
    const cookieClicked = await jsClick(page, 'a.ww-cookiebanner__brand');
    if (cookieClicked) {
      console.log('Cookie banner chiuso via JS.');
    } else {
      console.log('Cookie banner non trovato.');
    }
    await wait(2000);
    await saveDebug(page, 'debug-after-cookie');

    // Clicca su Accedi via JS (bypassa visibility)
    const accediClicked = await jsClick(page, 'a.btn-accedi.otp-popup-button');
    if (!accediClicked) {
      throw new Error('Non trovato a.btn-accedi.otp-popup-button nel DOM');
    }
    console.log('Link Accedi cliccato via JS.');

    await wait(3000);
    await saveDebug(page, 'debug-after-accedi');

    // Clicca su #otp-submit-button
    const preEmailClicked = await jsClick(page, '#otp-submit-button');
    if (preEmailClicked) {
      console.log('Bottone otp-submit-button cliccato.');
    } else {
      // Aspetta che appaia e riprova
      try {
        await page.locator('#otp-submit-button').waitFor({ state: 'visible', timeout: 10000 });
        await jsClick(page, '#otp-submit-button');
        console.log('Bottone otp-submit-button cliccato (dopo attesa).');
      } catch (_) {
        console.log('otp-submit-button non trovato, procedo.');
      }
    }

    await wait(3000);
    await saveDebug(page, 'debug-before-email');

    // Inserisci email
    const emailInput = page.locator('#otp-email').first();
    await emailInput.waitFor({ state: 'visible', timeout: 20000 });

    const email = generaEmailWeWealth();
    console.log(`Email generata: ${email}`);
    await emailInput.fill(email);
    console.log(`Email inserita: ${email}`);

    // Clicca su #otp-start-process
    const inviaCodiceBtn = page.locator('#otp-start-process').first();
    await inviaCodiceBtn.waitFor({ state: 'visible', timeout: 15000 });
    await inviaCodiceBtn.click();
    console.log('Bottone Invia codice via email cliccato.');

    await wait(5000);
    await saveDebug(page, 'debug-final');
    console.log('Script completato con successo.');
  } catch (error) {
    console.error('Errore durante esecuzione:', error);
    await saveDebug(page, 'debug-error');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }

const { ImapFlow } = require('imapflow');

async function main() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_USER_PASSWORD,
    },
    logger: false
  });

  try {
    await client.connect();
    console.log('Accesso IMAP riuscito.');

    const lock = await client.getMailboxLock('INBOX');
    try {
      console.log('INBOX aperta correttamente.');
    } finally {
      lock.release();
    }

    await client.logout();
    console.log('Disconnessione completata.');
  } catch (error) {
    console.error('Errore durante accesso email:', error);
    process.exitCode = 1;
  }
}

main();





}

main();
