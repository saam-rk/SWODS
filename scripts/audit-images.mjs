import { chromium, firefox, webkit } from '@playwright/test';
import ts from 'typescript';
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const dir = 'audit-artifacts/after';
const source = ts.transpile(await readFile('lib/image-processing.ts','utf8'), {target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext});
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><path fill="#f00" d="M0 0h60v40H0z"/><path fill="#0f0" d="M60 0h60v40H60z"/><path fill="#00f" d="M0 40h60v40H0z"/><path fill="#ff0" d="M60 40h60v40H60z"/></svg>');
const results=[];
for (const [name,engine] of Object.entries({chromium,firefox,webkit})) {
  const browser=await engine.launch();
  try {
  // Isolated pixel test injects the transpiled processor as a blob module.
  // Bypass CSP only here; normal app/browser acceptance retains the real headers.
  const page=await browser.newPage({bypassCSP:true});
  await page.goto(process.env.SWODS_AUDIT_ORIGIN ?? 'http://127.0.0.1:3100');
  for (let orientation=1;orientation<=8;orientation++) {
    const input=await sharp(svg).jpeg().withMetadata({orientation,exif:{IFD0:{Artist:'AUDIT-PRIVATE'}}}).toBuffer();
    const expected=await sharp(input).autoOrient().raw().toBuffer({resolveWithObject:true});
    for(const fallback of [false,true]) {
      const result=await page.evaluate(async ({source,base64,fallback})=>{
        const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
        const {processImage}=await import(url);
        const file=new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],'rotated.jpg',{type:'image/jpeg'});
        const original=window.createImageBitmap;
        if(fallback) window.createImageBitmap=undefined;
        try {
          const r=await processImage(file);
          const bytes=new Uint8Array(await r.image.arrayBuffer());
          return {width:r.width,height:r.height,mime:r.mimeType,actualMime:r.image.type,output:btoa(String.fromCharCode(...bytes))};
        } catch(e) {return {error:e.message};}
        finally {window.createImageBitmap=original;URL.revokeObjectURL(url);}
      },{source,base64:input.toString('base64'),fallback});
      if(result.output) {
        const output=Buffer.from(result.output,'base64');delete result.output;
        const metadata=await sharp(output).metadata();
        const decoded=await sharp(output).raw().toBuffer({resolveWithObject:true});
        let pixelsCorrect=decoded.info.width===expected.info.width && decoded.info.height===expected.info.height;
        if(pixelsCorrect) for(const [x,y] of [[10,10],[expected.info.width-10,10],[10,expected.info.height-10],[expected.info.width-10,expected.info.height-10]]) {
          for(let channel=0;channel<3;channel++) {
            const actual=decoded.data[(y*decoded.info.width+x)*decoded.info.channels+channel];
            const reference=expected.data[(y*expected.info.width+x)*expected.info.channels+channel];
            if(Math.abs(actual-reference)>25) pixelsCorrect=false;
          }
        }
        Object.assign(result,{pixelsCorrect,metadataStripped:!metadata.exif,pass:pixelsCorrect && !metadata.exif && result.mime===result.actualMime});
      }
      results.push({name,orientation,fallback,...result});
    }
  }
  } finally {
    await browser.close();
  }
}
await mkdir(dir,{recursive:true});await writeFile(`${dir}/images.json`,JSON.stringify(results,null,2));
console.log(`${results.filter(r=>r.pass).length}/${results.length} orientation, pixel, metadata and MIME cases passed (public edition).`);
if(results.some(r=>!r.pass)) process.exitCode=1;
