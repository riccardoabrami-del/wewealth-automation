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

async function logCandidates(page) {
  const links = await page.locator('a').evaluateAll(els =>
    els.slice(0, 200).map(el => ({
      text: (el.innerText || '').trim(),
      cls: el.className || '',
      href: el.getAttribute('href') || ''
    }))
  ).catch(() => []);
  console.log('Primi link trovati in pagina:');
  for (const item of links) {
    console.log(JSON.stringify(item));
  }
}

async function tryClick(page, selectors, timeout = 5000) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout });
      await locator.click({ timeout });
      console.log(`Click riuscito con selector: ${selector}`);
      return true;
    } catch (e) {
      console.log(`Selector non riuscito: ${selector}`);
    }
  }
  return false;
}

async function tryClickInFrames(page, selectors, timeout = 5000) {
  for (const frame of page.frames()) {
    for (const selector of selectors) {
      try {
        const locator = frame.locator(selector).first();
        await locator.waitFor({ state: 'visible', timeout });
        await locator.click({ timeout });
        console.log(`Click riuscito nel frame ${frame.url()} con selector: ${selector}`);
        return true;
      } catch (_) {}
    }
  }
  return false;
}

async function main() {
  const desktop = devices['Desktop Chrome'];

  const browser = await chromium.launch({
    headless: true
  });

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
    await logCandidates(page);

    const cookieSelectors = [
      '#onetrust-accept-btn-handler',
      'button:has-text("Accetta")',
      'button:has-text("Accept")',
      'button[aria-label*="Accetta"]',
      'button[aria-label*="accept"]',
      '.cookie-accept',
      'button.accept'
    ];

    const accediSelectors = [
      'a.btn-accedi.otp-popup-button',
      'a.otp-popup-button',
      'a.btn-accedi',
      'a:has-text("Accedi")',
      'button:has-text("Accedi")',
      'text=Accedi'
    ];

    const preEmailSelectors = [
      '#otp-submit-button',
      'button:has-text("Accedi o registrati")',
      'text="Accedi o registrati"'
    ];

    const inviaCodiceSelectors = [
      '#otp-start-process',
      'button:has-text("Invia codice via email")',
      'text="Invia codice via email"'
    ];

    await tryClick(page, cookieSelectors, 4000);
    await wait(2000);
    await saveDebug(page, 'debug-after-cookie');

    let clickedAccedi = await tryClick(page, accediSelectors, 10000);
    if (!clickedAccedi) {
      clickedAccedi = await tryClickInFrames(page, accediSelectors, 10000);
    }

    if (!clickedAccedi) {
      throw new Error('Non sono riuscito a trovare/cliccare il pulsante Accedi');
    }

    await wait(3000);
    await saveDebug(page, 'debug-after-accedi');

    let clickedPreEmail = await tryClick(page, preEmailSelectors, 15000);
    if (!clickedPreEmail) {
      clickedPreEmail = await tryClickInFrames(page, preEmailSelectors, 15000);
    }
    if (!clickedPreEmail) {
      console.log('Bottone pre-email non trovato, provo comunque il campo email.');
    }

    await wait(3000);
    await saveDebug(page, 'debug-before-email');

    let emailInput = page.locator('#otp-email').first();
    let foundInFrame = false;

    try {
      await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    } catch (_) {
      for (const frame of page.frames()) {
        const candidate = frame.locator('#otp-email').first();
        if (await candidate.isVisible().catch(() => false)) {
          emailInput = candidate;
          foundInFrame = true;
          break;
        }
      }
    }

    const email = generaEmailWeWealth();
    console.log(`Email generata: ${email}`);

    await emailInput.fill(email);
    console.log(`Email inserita${foundInFrame ? ' nel frame' : ''}: ${email}`);

    if (!foundInFrame) {
      const clickedInvia = await tryClick(page, inviaCodiceSelectors, 15000);
      if (!clickedInvia) {
        await tryClickInFrames(page, inviaCodiceSelectors, 15000);
      }
    } else {
      await tryClickInFrames(page, inviaCodiceSelectors, 15000);
    }

    await wait(5000);
    await saveDebug(page, 'debug-final');
    console.log('Script completato.');
  } catch (error) {
    console.error('Errore durante esecuzione:', error);
    await saveDebug(page, 'debug-error');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
