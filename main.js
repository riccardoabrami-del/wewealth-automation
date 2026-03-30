const { chromium } = require('playwright');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generaEmailWeWealth() {
  const n1 = Math.floor(Math.random() * 10);
  const n2 = Math.floor(Math.random() * 10);
  const n3 = Math.floor(Math.random() * 10);
  return `riccardo.abrami+${n1}${n2}${n3}@we-wealth.com`;
}

async function clickIfVisible(page, selectors, timeout = 5000) {
  for (const selector of selectors) {
    try {
      const el = page.locator(selector).first();
      await el.waitFor({ state: 'visible', timeout });
      await el.click({ timeout });
      console.log(`Click eseguito su: ${selector}`);
      return true;
    } catch (_) {}
  }
  return false;
}

async function main() {
  const headless = process.env.HEADLESS !== 'false';
  const targetUrl = process.env.TARGET_URL || 'https://www.we-wealth.com';

  const browser = await chromium.launch({
    headless
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  try {
    console.log(`Apro: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });

    await wait(10000);

    const cookieSelectors = [
      'button[aria-label*="Accetta"]',
      'button[aria-label*="accept"]',
      '.cookie-accept',
      'button.accept',
      'button:has-text("Accetta")',
      'button:has-text("Accept")',
      '#onetrust-accept-btn-handler'
    ];

    const cookieAccepted = await clickIfVisible(page, cookieSelectors, 4000);
    console.log(cookieAccepted ? 'Cookie accettati.' : 'Nessun pulsante cookie trovato.');

    const accediLink = page.locator('a.btn-accedi.otp-popup-button').first();
    await accediLink.waitFor({ state: 'visible', timeout: 60000 });
    await accediLink.click();
    console.log('Link .btn-accedi.otp-popup-button cliccato.');

    const accediRegBtn = page.locator('#otp-submit-button').first();
    await accediRegBtn.waitFor({ state: 'visible', timeout: 60000 });
    await accediRegBtn.click();
    console.log('Bottone "Accedi o registrati" cliccato (fase pre-email).');

    const email = generaEmailWeWealth();
    console.log(`Email generata: ${email}`);

    const emailInput = page.locator('#otp-email').first();
    await emailInput.waitFor({ state: 'visible', timeout: 60000 });
    await emailInput.fill(email);
    await page.waitForTimeout(500);
    const insertedValue = await emailInput.inputValue();

    if (insertedValue !== email) {
      throw new Error(`Valore email non inserito correttamente. Atteso=${email} Letto=${insertedValue}`);
    }

    console.log(`Email inserita in #otp-email: ${insertedValue}`);

    const inviaCodiceBtn = page.locator('#otp-start-process').first();
    await inviaCodiceBtn.waitFor({ state: 'visible', timeout: 60000 });
    await inviaCodiceBtn.click();
    console.log('Bottone "Invia codice via email" cliccato.');

    await page.waitForTimeout(3000);
    console.log('Script completato con successo.');
  } catch (error) {
    console.error('Errore durante esecuzione:', error);
    await page.screenshot({ path: 'error-screenshot.png', fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
