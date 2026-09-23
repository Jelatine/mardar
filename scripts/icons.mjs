import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage(); const svg=readFileSync('build/icon.svg','utf8'); const chunks=[], pngs={};
// The arrow overlaps the M at Dock/menu sizes. Keep only the mark in small icons.
const smallSvg = svg.replace(/<path d="M328 376[^>]+\/>/, '');
for(const size of [16,32,48,64,128,256,512,1024]) { await page.setViewportSize({width:size,height:size}); await page.setContent(`<style>html,body{width:100%;height:100%;margin:0}svg{display:block;width:100%;height:100%}</style>${size<=64?smallSvg:svg}`); const png=await page.screenshot({omitBackground:true}); pngs[size]=png; if(size===512)writeFileSync('build/icon.png',png);else if(size<512)chunks.push({size,png}); }
const icns=[['icp4',16],['icp5',32],['ic07',128],['ic08',256],['ic09',512],['ic10',1024],['ic11',32],['ic12',64],['ic13',512],['ic14',1024]].map(([type,size])=>{const h=Buffer.alloc(8);h.write(type,0,'ascii');h.writeUInt32BE(pngs[size].length+8,4);return Buffer.concat([h,pngs[size]]);});
const icnsHeader=Buffer.alloc(8);icnsHeader.write('icns',0,'ascii');icnsHeader.writeUInt32BE(8+icns.reduce((n,b)=>n+b.length,0),4);writeFileSync('build/icon.icns',Buffer.concat([icnsHeader,...icns]));
let offset=6+16*chunks.length;const header=Buffer.alloc(offset);header.writeUInt16LE(1,2);header.writeUInt16LE(chunks.length,4);chunks.forEach(({size,png},i)=>{let p=6+i*16;header[p]=size%256;header[p+1]=size%256;header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(png.length,p+8);header.writeUInt32LE(offset,p+12);offset+=png.length});writeFileSync('build/icon.ico',Buffer.concat([header,...chunks.map(x=>x.png)])); await browser.close();
