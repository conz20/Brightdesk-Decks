import test from "node:test";
import assert from "node:assert/strict";
import printingIpc from "../src/printing-ipc.cjs";
const {registerPrintingIpcHandlers}=printingIpc;
function setup(authorized=true){
 const handlers=new Map();let calls=0;
 const adapter={listPrinters:async()=>[],discoverNetworkPrinters:async()=>[],pairNetworkPrinter:async x=>x,getPrinterCapabilities:async x=>x,openPrinterSettings:async()=>({status:"opened"}),print:async x=>x};
 registerPrintingIpcHandlers({handle:(name,fn)=>handlers.set(name,fn)},{isAuthorizedSender:()=>authorized,getAdapter:async()=>{calls++;return adapter;}});
 return {handlers,get calls(){return calls;}};
}
test("registers six print operations",()=>{const {handlers}=setup();assert.equal(handlers.size,6);});
test("rejects untrusted renderer senders",async()=>{const h=setup(false);await assert.rejects(h.handlers.get("printing:list-printers")({sender:{}}),/Invalid sender/);assert.equal(h.calls,0);});
test("forwards trusted printing requests",async()=>{const h=setup();const event={sender:{}};const req={copies:2};assert.deepEqual(await h.handlers.get("printing:print")(event,req),req);assert.equal(h.calls,1);});
