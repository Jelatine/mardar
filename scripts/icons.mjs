import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage(); const svg=readFileSync('build/icon.svg','utf8'); const chunks=[];
for(const size of [16,32,48,64,128,256,512]) { await page.setViewportSize({width:size,height:size}); await page.setContent(`<style>body{margin:0}svg{width:100%;height:100%}</style>${svg}`); const png=await page.screenshot({omitBackground:true}); if(size===512)writeFileSync('build/icon.png',png);else chunks.push({size,png}); }
let offset=6+16*chunks.length;const header=Buffer.alloc(offset);header.writeUInt16LE(1,2);header.writeUInt16LE(chunks.length,4);chunks.forEach(({size,png},i)=>{let p=6+i*16;header[p]=size%256;header[p+1]=size%256;header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(png.length,p+8);header.writeUInt32LE(offset,p+12);offset+=png.length});writeFileSync('build/icon.ico',Buffer.concat([header,...chunks.map(x=>x.png)])); await browser.close();
