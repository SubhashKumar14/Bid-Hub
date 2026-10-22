import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
const here=path.resolve("frontend/tests/generated"),source=process.cwd(); fs.mkdirSync(here,{recursive:true});
const req=createRequire(path.join(source,'package.json'));const {build}=req('esbuild');
const results=[];const record=(name,safe,detail)=>results.push({name,status:safe?'PASS':'FAIL',detail});
async function compile(file,name){await build({entryPoints:[path.join(source,file)],outfile:path.join(here,name+'.mjs'),bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react/jsx-runtime'],plugins:[{name:'isolate-ui-dependencies',setup(b){b.onResolve({filter:/.*/},a=>{if(a.kind==='entry-point'||a.path==='react'||a.path.startsWith('react/'))return;if(a.path.includes('messageApi'))return {path:a.path,namespace:'api'};return {path:a.path,namespace:'stub'}});b.onLoad({filter:/.*/,namespace:'api'},()=>({contents:'export const getMessages=(...a)=>globalThis.messageAPI(...a); export const sendMessage=(...a)=>globalThis.sendAPI(...a);'}));b.onLoad({filter:/.*/,namespace:'stub'},a=>{const componentNames=['Sheet','SheetContent','SheetHeader','SheetTitle','SheetDescription','Button','Separator','Send','MessageSquare','Loader2','ArrowUp','Nav','EscrowDrawer','Landing','Browse','ProjectDetail','PostProject','StudentDashboard','ClientDashboard','Profile','Auth','Toaster','ErrorBoundary','BrandLogo'];return {contents:"import React from 'react'; export const toast={error(){},info(){},success(){}};"+componentNames.map(n=>`export const ${n}=p=>React.createElement('${n}',p,p.children);`).join('')}})}}]});return import(pathToFileURL(path.join(here,name+'.mjs')))}
let intervals=[],events={},history=[];const storage=new Map();
globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.document={documentElement:{classList:{toggle(){}}}};
globalThis.window={location:{pathname:'/browse',search:''},history:{pushState:(a,b,p)=>{history.push(p);window.location.pathname=p.split('?')[0]}},addEventListener:(n,f)=>events[n]=f,removeEventListener:n=>delete events[n]};
const realInterval=globalThis.setInterval,realClear=globalThis.clearInterval,realTimeout=globalThis.setTimeout;
globalThis.setInterval=f=>{intervals.push(f);return intervals.length};globalThis.clearInterval=()=>{};globalThis.setTimeout=()=>0;
const {default:App}=await compile('frontend/app/App.jsx','app-isolated');
let app;await act(async()=>{app=Renderer.create(React.createElement(App))});
record('F01 direct browse navigation avoids spurious history entries',history.length===0,JSON.stringify(history));await act(async()=>app.unmount());
storage.set('token','fixture');window.location.pathname='/student';globalThis.fetch=async()=>({ok:false,status:503});
await act(async()=>{app=Renderer.create(React.createElement(App))});
record('F02 auth service outage renders a retry/error state',!JSON.stringify(app.toJSON()).includes('Initializing secure marketplace session'),JSON.stringify(app.toJSON()));await act(async()=>app.unmount());
storage.clear();intervals=[];
const {ChatDrawer}=await compile('frontend/app/components/ChatDrawer.jsx','chat-isolated');
globalThis.messageAPI=async(project,token,page,limit)=>({messages:Array.from({length:Math.min(limit,60-(page-1)*limit)},(_,i)=>({_id:String((page-1)*limit+i),content:'fixture',senderId:{_id:'student',name:'Student'},createdAt:'2026-01-01'})),pagination:{page,limit,total:60,pages:Math.ceil(60/limit)}});
let chat;await act(async()=>{chat=Renderer.create(React.createElement(ChatDrawer,{open:true,onClose(){},projectId:'project',token:'fixture',currentUser:{_id:'student'}}))});
let more=chat.root.findAll(n=>n.type==='Button'&&n.findAll(x=>x.children.some(c=>typeof c==='string'&&c.includes('Load'))).length>0);
if(!more.length){record('F03 chat pagination remains available after polling',false,'Load button not found by test harness')}else{
 await act(async()=>more[0].props.onClick());await act(async()=>intervals.at(-1)());
 more=chat.root.findAll(n=>n.type==='Button'&&n.findAll(x=>x.children.some(c=>typeof c==='string'&&c.includes('Load'))).length>0);
 record('F03 chat pagination remains available after polling',more.length>0,'60 total messages; loaded40; poll recalculates pages=2 and page=2; load button count='+more.length);
}
await act(async()=>chat.unmount());
globalThis.setInterval=realInterval;globalThis.clearInterval=realClear;globalThis.setTimeout=realTimeout;
fs.writeFileSync(path.join(here,'frontend-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));

if(results.some(r=>r.status!=="PASS")) process.exitCode=1;
