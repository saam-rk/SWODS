// Standalone engine probe: no Next.js, Supabase or application code.
import { createServer } from 'node:http';
import { webkit } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
const server=createServer((req,res)=>{
  if(req.url==='/sw.js') {res.setHeader('Content-Type','application/javascript');res.end("self.addEventListener('install',e=>e.waitUntil(caches.open('probe').then(c=>c.add('/')).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>e.respondWith(caches.match('/')));");}
  else {res.setHeader('Content-Type','text/html');res.end('<h1>Offline probe</h1><script>navigator.serviceWorker.register("/sw.js")</script>');}
});
await new Promise(resolve=>server.listen(3102,'127.0.0.1',resolve));
const browser=await webkit.launch();const context=await browser.newContext();const page=await context.newPage();
const evidence={platform:process.platform,browser:browser.version(),appCode:false};
try {
  await page.goto('http://127.0.0.1:3102');await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await page.reload();
  evidence.controlled=await page.evaluate(()=>Boolean(navigator.serviceWorker.controller));
  evidence.cached=await page.evaluate(async()=>Boolean(await caches.match('/')));
  await context.setOffline(true);await page.reload();evidence.offlineReload='passed';
} catch(error) {evidence.error=error.message;}
finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
await mkdir('audit-artifacts/after',{recursive:true});await writeFile('audit-artifacts/after/webkit-offline-probe.json',JSON.stringify(evidence,null,2));console.log(evidence);
