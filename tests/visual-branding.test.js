'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
test('Decks uses the approved Brightdesk shell and its own product accent',()=>{
 const css=fs.readFileSync(path.join(root,'src','design-system.css'),'utf8');
 const html=fs.readFileSync(path.join(root,'src','index.html'),'utf8');
 const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');
 const brief=fs.readFileSync(path.join(root,'docs','BRIGHTDESK_DESIGN.md'),'utf8');
 const icon=fs.readFileSync(path.join(root,'src/branding/icons/decks.svg'),'utf8');
 assert.ok(css.includes('#F3F6FA'));
 assert.ok(css.includes('#14233F')&&css.includes('#0D1930'));
 assert.match(css,/\.sidebar\s*\{[^}]*background:var\(--bd-nav-background\)/s);
 const accents=[...css.matchAll(/--bd-accent\s*:\s*(#[0-9a-fA-F]{6})/g)];
 assert.equal(accents.at(-1)[1].toUpperCase(),'#C47A2D');
 assert.ok(html.includes(path.basename('src/branding/icons/decks.svg')));
 assert.match(icon,/<svg[^>]+role="img"/);
 assert.ok(readme.includes('docs/BRIGHTDESK_DESIGN.md'));
 assert.ok(brief.includes('BRIGHTDESK_VISUAL_STANDARD.md'));
 assert.ok(brief.includes('#C47A2D'));
});

test('final stylesheet tokens match the exact approved Decks palette', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'design-system.css'), 'utf8');
  const lastHex = (token) => {
    const values = [...css.matchAll(new RegExp(token + String.raw`\s*:\s*(#[0-9a-f]{6})`, 'gi'))];
    return values.at(-1)?.[1].toUpperCase();
  };

  assert.equal(lastHex('--bd-accent'), '#C47A2D');
  assert.equal(lastHex('--bd-accent-strong'), '#9A5E20');
  assert.equal(lastHex('--bd-accent-soft'), '#FCF3E9');
  assert.equal(lastHex('--bd-product-tint'), '#FCF3E9');
  assert.equal(lastHex('--bd-canvas'), '#F3F6FA');
  assert.equal(lastHex('--bd-ink'), '#202B3C');
});
