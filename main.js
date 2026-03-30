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
    await wait(10000);
    await saveDebug(page, 'debug-home');

    // Accetta cookie banner (classe specifica ww-cookiebanner)
    const cookieSelectors = [
      'a.ww-cookiebanner__brand--details',
      '.ww-cookiebanner a[href="#"]',
      '#onetrust-accept-btn-handler',
      'button:has-text("Accetta")',
      'button:has-text("Accept")'
    ];
    for (const sel of cookieSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          await el.click({ force: true });
          console.log(`Cookie accettati con: ${sel}`);
          break;
        }
      } catch (_) {}
    }
    await wait(2000);
    await saveDebug(page, 'debug-after-cookie');

    // Clicca su Accedi - usa force:true perché l'elemento potrebbe essere nascosto nel menu collassato
    const accediLink = page.locator('a.btn-accedi.otp-popup-button').first();
    await accediLink.waitFor({ state: 'attached', timeout: 30000 });
    await accediLink.click({ force: true });
    console.log('Link Accedi cliccato (force).');

    await wait(3000);
    await saveDebug(page, 'debug-after-accedi');

    // Clicca su #otp-submit-button
    const preEmailBtn = page.locator('#otp-submit-button').first();
    try {
      await preEmailBtn.waitFor({ state: 'visible', timeout: 15000 });
      await preEmailBtn.click();
      console.log('Bottone otp-submit-button cliccato.');
    } catch (_) {
      console.log('otp-submit-button non trovato, procedo.');
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
}

main();
