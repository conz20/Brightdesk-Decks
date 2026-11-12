import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const read=file=>fs.readFileSync(path.join(process.cwd(),file),"utf8");
test("Decks includes its dependency-free canonical Printing snapshot",()=>{
 const pkg=JSON.parse(read("src/printing-package/package.json"));const upstream=JSON.parse(read("src/printing-package/UPSTREAM.json"));
 assert.equal(pkg.name,"@brightdesk/printing");assert.deepEqual(pkg.dependencies||{},{});
 assert.equal(upstream.sourceCommit,"70d41095616c6d1cd3473c0ad73a6ecb5a596c05");
 assert.ok(fs.statSync(path.join(process.cwd(),"src/printing-package/src/electron-print-adapter.mjs")).isFile());
});
test("Decks exposes print actions through the shared renderer",()=>{
 const html=read("src/index.html"),app=read("src/app.js");
 assert.match(html,/id="print-button"/);assert.match(html,/id="printer-settings-button"/);
 assert.match(app,/window\.brightdesk\.printing\.print\(\{ printBackground: true \}\)/);
 assert.match(app,/window\.brightdesk\.printing\.openPrinterSettings\(\)/);
});
test("built-in locales include printing labels",()=>{
 for(const locale of ["en-AU","de-DE","es-ES","fr-FR"]){const pack=JSON.parse(read(`src/languages/${locale}.json`));assert.ok(pack.translations["top.print"]);assert.ok(pack.translations["top.printerSettings"]);}
});
