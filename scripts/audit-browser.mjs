import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

// Historical, observational script for the original build; not the regression suite.
const dir = process.env.AUDIT_DIR;
if (!dir) throw new Error('Set AUDIT_DIR to an explicit evidence folder for the original build. Use npm run test:e2e for the current app.');
await mkdir(dir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'en-US' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = { errors, screens: [], flows: {} };
async function visit(path, name) {
  await page.goto(`http://127.0.0.1:3100${path}`);
  await page.waitForLoadState('networkidle');
  await snapshot(name);
}
async function snapshot(name) {
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  results.screens.push({ name, url: page.url(), overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), violations: axe.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target:n.target, summary:n.failureSummary })) })) });
}
try {
  await visit('/gallery', 'guest-gallery');
  results.flows.guestPhotos = await page.locator('.photo-tile').count();
  await visit('/', 'join');
  await page.getByRole('button', {name:'Enter the experience'}).click();
  results.flows.emptyName = await page.locator('.form-message[role=alert]').innerText();
  await page.getByLabel('First name').fill('Audit');
  await page.getByLabel('Join code').fill('INVALID');
  await page.getByRole('button', {name:'Enter the experience'}).click();
  results.flows.invalidCode = await page.locator('.form-message[role=alert]').innerText();
  await page.getByLabel('Join code').fill('HERVAS');
  await page.getByRole('button', {name:'Enter the experience'}).click();
  await page.waitForURL('**/onboarding');
  await snapshot('onboarding');
  await page.getByRole('button', {name:'Keep going'}).click();
  await page.getByRole('button', {name:'Keep going'}).click();
  await page.getByRole('button', {name:'Enter the field'}).click();
  await page.waitForURL('**/explore');
  await snapshot('explore');
  await visit('/challenges', 'challenges');
  await page.locator('.challenge-row:not([disabled])').first().click();
  await page.getByRole('button',{name:'Make a photograph'}).click();
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width=2400;c.height=1200; const ctx=c.getContext('2d');ctx.fillStyle='#efca55';ctx.fillRect(0,0,1200,1200);ctx.fillStyle='#305948';ctx.fillRect(1200,0,1200,1200);return c.toDataURL('image/png').split(',')[1]; });
  await page.locator('input[type=file]').last().setInputFiles({name:'audit.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.getByRole('button',{name:'I understand'}).click();
  await page.locator('textarea').fill('Audit perspective');
  await snapshot('capture');
  await page.getByRole('button',{name:'Add this perspective'}).click();
  await page.getByRole('heading',{name:'Your perspective is in the field.'}).waitFor();
  results.flows.photoSaved = true;
  await visit('/gallery', 'gallery');
  results.flows.galleryCount = await page.locator('.photo-tile').count();
  await page.locator('.photo-tile').first().click();
  await snapshot('detail');
  results.flows.deleteAfterNavigation = await page.getByRole('button',{name:'Delete this photograph'}).count();
  await page.getByRole('button',{name:'I want to tell this story',exact:true}).click();
  if (await page.getByRole('button',{name:'Add to our story'}).count()) await page.getByRole('button',{name:'Add to our story'}).click();
  await page.keyboard.press('Escape');
  results.flows.focusRestored = await page.locator('.photo-tile').first().evaluate(el=>el===document.activeElement);
  await visit('/admin','admin-gate');
  await page.getByLabel('Administrator code').fill('HERVAS-ADMIN');
  await page.getByRole('button',{name:'Open administration'}).click();
  await page.getByRole('heading',{name:'The field desk'}).waitFor();
  await snapshot('admin-event');
  await page.getByLabel('Current phase').selectOption('presentation');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByRole('button',{name:'Photographs',exact:false}).first().click();
  await page.getByRole('button',{name:'Hide',exact:true}).first().click();
  await visit('/gallery','moderated-gallery');
  results.flows.hiddenPhotoStillVisible = await page.locator('.photo-tile').count();
  await visit('/present','presentation');
  await visit('/admin','admin-after-return');
  await page.getByRole('button',{name:'Final',exact:false}).first().click();
  await page.getByRole('button',{name:'Generate mosaic',exact:true}).click();
  await page.getByRole('button',{name:'Download JPEG',exact:true}).waitFor({timeout:30000});
  results.flows.mosaicGenerated = true;
  await snapshot('mosaic');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download JPEG',exact:true}).click();
  results.flows.download = (await downloadPromise).suggestedFilename();
  await page.getByLabel('Enable reveal').check();
  await page.getByRole('button',{name:'Event',exact:false}).first().click();
  await page.getByLabel('Current phase').selectOption('reveal');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await visit('/reveal','reveal');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.reload();
  await page.getByRole('button',{name:'Begin the reveal'}).click();
  await snapshot('reveal-static');
  await visit('/memory/hervas-2025','memory');
  await page.emulateMedia({media:'print'});await snapshot('memory-print');
  await page.emulateMedia({media:'screen'});
  for (const width of [320,768,1440]) {await page.setViewportSize({width,height:900});await visit('/gallery',`gallery-${width}`);await visit('/',`join-${width}`);}
  await context.setOffline(true);await page.reload();await snapshot('offline');await context.setOffline(false);
} catch(e) {results.failure=e.stack;}
finally { await writeFile(`${dir}/results.json`,JSON.stringify(results,null,2));await browser.close(); }
console.log(JSON.stringify(results.flows));if(results.failure){console.error(results.failure);process.exitCode=1;}
