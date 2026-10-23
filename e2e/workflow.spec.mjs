import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mongoose from "../backend/node_modules/mongoose/index.js";
const children = [];
const api = "http://127.0.0.1:5019/api";
const run = (exe, args, env = {}) => { const child = spawn(exe, args, { env: { ...process.env, ...env }, windowsHide: true, stdio: "ignore" }); children.push(child); return child; };
test.beforeAll(async () => {
  if (!process.env.TEST_MONGODB_URI) {
  const binary = process.env.MONGOD_BINARY || "C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe";
  if (!fs.existsSync(binary)) throw new Error("Required E2E replica-set binary missing; set MONGOD_BINARY.");
  run(binary, ["--dbpath", fs.mkdtempSync(path.join(os.tmpdir(), "bidhub-e2e-")), "--port", "27129", "--bind_ip", "127.0.0.1", "--replSet", "journey", "--oplogSize", "32", "--wiredTigerCacheSizeGB", "0.25"]);
  let client;
  for (let i=0; i<40; i++) { try { client = await new mongoose.mongo.MongoClient("mongodb://127.0.0.1:27129/?directConnection=true", { serverSelectionTimeoutMS: 500 }).connect(); break; } catch { await new Promise(r=>setTimeout(r,200)); } }
  if (!client) throw new Error("Isolated E2E MongoDB failed to start.");
  await client.db("admin").command({ replSetInitiate: { _id: "journey", members: [{ _id: 0, host: "127.0.0.1:27129" }] } }); await client.close();
  }
  run(process.execPath, ["backend/index.js"], { PORT: "5019", NODE_ENV: "production", PRODUCT_MODE: "demo", PAYMENT_PROVIDER: "mock", JWT_SECRET: "synthetic-browser-test-secret-at-least-32-characters", MONGODB_URI: process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27129/journey?replicaSet=journey", PRIVATE_STORAGE: "mongodb", CLOUDINARY_CLOUD_NAME: "fixture", CLOUDINARY_API_KEY: "fixture", CLOUDINARY_API_SECRET: "fixture", CLIENT_URL: "http://127.0.0.1:5189" });
  run(process.execPath, ["node_modules/vite/bin/vite.js", "--port", "5189", "--host", "127.0.0.1", "--strictPort"], { BIDHUB_API_TARGET: "http://127.0.0.1:5019" });
  for (let i=0;i<80;i++) { try { if ((await fetch(api+"/ready")).ok && (await fetch("http://127.0.0.1:5189")).ok) return; } catch {} await new Promise(r=>setTimeout(r,500)); }
  throw new Error("E2E services did not become ready.");
});
test.afterAll(async () => { for (const child of children.reverse()) child.kill(); });
async function json(request, method, endpoint, token, data) {
  const response = await request[method](api + endpoint, { headers: token ? { Authorization: "Bearer " + token } : {}, data });
  expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
}
async function assertLayout(page, width, label = "") {
  const report = await page.evaluate(width => ({ width: document.documentElement.scrollWidth, offenders: [...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right > width + 1).slice(-6).map(e=>({tag:e.tagName,classes:e.className,text:e.textContent?.slice(0,70)})) }), width);
  expect(report.width, `${label} ${JSON.stringify(report.offenders)}`).toBeLessThanOrEqual(width);
}
test("two-role production demo: different offer, two milestones, revision, approvals and reviews", async ({ browser, request }) => {
  const suffix = Date.now();
  const client = await json(request, "post", "/auth/register", null, { name: "Client Fixture", email: `client${suffix}@example.com`, password: "Synthetic123!", role: "client" });
  const student = await json(request, "post", "/auth/register", null, { name: "Student Fixture", email: `student${suffix}@example.com`, password: "Synthetic123!", role: "student" });
  const ownerContext = await browser.newContext(); await ownerContext.addInitScript(token => localStorage.setItem("token", token), client.token);
  const owner = await ownerContext.newPage(); await owner.goto("/post");
  await owner.locator("#project-title").fill("Writing journey fixture");
  await owner.locator("#project-description").fill("Prepare two independently reviewed writing deliverables.");
  await owner.locator("#project-category").click(); await owner.getByRole("option", {name:"Writing & Content",exact:true}).click();
  await owner.locator("#project-budget").fill("50000"); await owner.locator("#project-deadline").fill("2027-12-31");
  await owner.locator("#milestone-title-0").fill("Outline"); await owner.locator("#milestone-amount-0").fill("25000");
  await owner.locator("#milestone-title-1").fill("Final article"); await owner.locator("#milestone-amount-1").fill("25000");
  const published = owner.waitForResponse(r=>r.url().endsWith("/api/projects") && r.request().method()==="POST");
  await owner.getByRole("button", {name:"Publish Project Brief",exact:true}).click(); const publishedResponse=await published;
  expect(publishedResponse.ok(),await publishedResponse.text()).toBeTruthy(); const project=await publishedResponse.json();
  const context = await browser.newContext();
  await context.addInitScript(token => localStorage.setItem("token", token), student.token);
  const page = await context.newPage(); await page.goto(`/project/${project._id}`);
  await expect(page.getByText("Writing journey fixture", { exact: true }).first()).toBeVisible();
  await page.locator("#bid-price").fill("25000"); await page.locator("#bid-timeline").fill("2 weeks"); await page.locator("#bid-proposal").fill("Two deliverables with a revision round.");
  const proposed=page.waitForResponse(r=>r.url().endsWith(`/projects/${project._id}/bids`) && r.request().method()==="POST");
  await page.getByRole("button",{name:"Submit Proposal",exact:true}).click(); expect((await proposed).ok()).toBeTruthy();
  await owner.goto("/client");
  await owner.getByRole("button", { name: /accept/i }).first().click();
  await expect(owner.getByRole("dialog")).toContainText("12,500");
  await owner.getByRole("button", { name: "Continue to Checkout" }).click();
  await owner.getByRole("button", {name:"Go to Project Workspace"}).click();
  await expect.poll(async () => (await json(request,"get",`/projects/${project._id}`)).project.status).toBe("ASSIGNED");
  const detail = await json(request,"get",`/projects/${project._id}`);
  expect(detail.project.budget).toBe(50000); expect(detail.project.contractTotalPaise).toBe(2500000);
  expect(detail.milestones).toHaveLength(2); expect(detail.milestones.reduce((n,m)=>n+m.amount,0)).toBe(25000);
  owner.on("dialog", dialog=>dialog.accept());
  const deliver=async notes=>{
    await page.goto("/student"); await page.getByRole("button", { name: /^(Submit Deliverable|Resubmit Deliverable)$/ }).first().click();
    await page.locator("#milestone-notes").fill(notes);
    await page.getByRole("dialog").getByRole("button", {name:"Submit Deliverable",exact:true}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  };
  const openReview=async()=>{ await owner.goto(`/project/${project._id}`); await owner.getByRole("button", {name:"Review Work",exact:true}).first().click(); await expect(owner.getByRole("button",{name:"Approve Work",exact:true})).toBeEnabled(); };
  for (const [index, milestone] of detail.milestones.entries()) {
    await deliver("Writing deliverable evidence and acceptance notes.");
    let submission = await json(request,"get",`/milestones/${milestone._id}/submission`,client.token);
    if(index===0) {
      await openReview(); await owner.getByRole("button",{name:"Request Revisions"}).click(); await owner.locator("#revision-feedback").fill("Please clarify the introduction.");
      await owner.getByRole("button",{name:"Send Revision Request"}).click(); await expect(owner.getByRole("dialog")).toHaveCount(0);
      await deliver("Revised introduction with all requested clarifications.");
      const stale=await request.patch(api+`/milestones/${milestone._id}/release`,{headers:{Authorization:"Bearer "+client.token},data:{status:"APPROVED",submissionId:submission._id}}); expect(stale.status()).toBe(409);
      submission=await json(request,"get",`/milestones/${milestone._id}/submission`,client.token); expect(submission.version).toBe(2);
    }
    await openReview(); await owner.getByRole("button",{name:"Approve Work",exact:true}).click(); await expect(owner.getByRole("dialog")).toHaveCount(0);
  }
  expect((await json(request,"get",`/projects/${project._id}`)).project.status).toBe("COMPLETED");
  const clientDash = await json(request, "get", "/projects/client/dashboard", client.token);
  expect(clientDash.activeGigsCount).toBe(0); expect(clientDash.completedProjects.some(p=>p._id===project._id)).toBeTruthy();
  for(const [actor,comment] of [[owner,"Clear writing and responsive revisions."],[page,"Useful scope and specific feedback."]]) {
    await actor.goto(`/project/${project._id}`); await actor.locator("#review-comment").fill(comment); await actor.getByRole("button",{name:"Submit Review",exact:true}).click();
    await expect(actor.getByText(comment,{exact:false}).first()).toBeVisible();
    await expect(actor.locator("#review-comment")).toHaveCount(0);
  }
  for (const route of ["/browse","/student","/client","/post","/profile",`/project/${project._id}`]) { await owner.goto(route); await owner.reload(); await expect(owner.locator("main").first()).toBeVisible(); }
  await owner.setViewportSize({width:390,height:844}); await owner.goto("/browse"); await owner.screenshot({path:"e2e-results/mobile-directory.png",fullPage:true});
  await context.close(); await ownerContext.close();
});

test("detail checkout, proposal versions, private GridFS files, capabilities and recovery negatives", async ({ browser, request }) => {
  const suffix=Date.now();
  const register=async(role,label)=>json(request,"post","/auth/register",null,{name:label,email:`${label}${suffix}@example.com`,password:"Synthetic123!",role});
  const client=await register("client","Owner"), student=await register("student","Designer"), stranger=await register("client","Stranger"), other=await register("student","Prospect");
  const headers=token=>({Authorization:`Bearer ${token}`});
  const pdf=Buffer.from("%PDF-1.4\nSynthetic private test document\n%%EOF");
  const upload=async token=>{
    const response=await request.post(api+"/uploads/files",{headers:headers(token),multipart:{files:{name:"brief.pdf",mimeType:"application/pdf",buffer:pdf}}});
    expect(response.ok(),await response.text()).toBeTruthy(); return (await response.json())[0];
  };
  const brief=await upload(client.token), unlinked=await upload(client.token);
  expect((await request.get("http://127.0.0.1:5019"+brief.url)).status()).toBe(401);
  expect((await request.get("http://127.0.0.1:5019"+unlinked.url,{headers:headers(student.token)})).status()).toBe(404);
  const payload={title:"Design contract fixture",description:"Deliver two poster concepts and documented revisions.",category:"Product Design",budget:1000,deadline:"2027-10-31",remote:true,location:"Remote",level:"advanced",duration:"4 weeks",skillsRequired:["Figma"],files:[brief],clientRequestId:crypto.randomUUID(),milestones:[{title:"First concept",amount:100},{title:"Final poster",amount:900}]};
  const project=await json(request,"post","/projects",client.token,payload);
  expect((await json(request,"post","/projects",client.token,payload))._id).toBe(project._id);
  expect((await request.post(api+"/projects",{headers:headers(stranger.token),data:{...payload,clientRequestId:crypto.randomUUID()}})).status()).toBe(403);
  const persisted=(await json(request,"get",`/projects/${project._id}`)).project;
  for(const field of ["remote","location","level","duration"]) expect(persisted[field]).toBe(payload[field]);
  const directory=await request.get(api+"/projects?location=remote&sort=budget-asc&limit=1"); expect(directory.ok()).toBeTruthy(); expect(directory.headers()["x-total-count"]).toBeTruthy();
  expect((await request.get("http://127.0.0.1:5019"+brief.url,{headers:headers(student.token)})).ok()).toBeTruthy();
  expect((await request.get("http://127.0.0.1:5019"+brief.url,{headers:headers(stranger.token)})).status()).toBe(404);
  await json(request,"post",`/projects/${project._id}/clarifications`,student.token,{content:"Does the final poster need print-ready PDF?"});
  await json(request,"post",`/projects/${project._id}/clarifications`,client.token,{content:"Yes; provide a PDF with notes and the source link if available."});
  expect((await json(request,"get",`/projects/${project._id}/clarifications`,student.token))).toHaveLength(2);
  const bid=await json(request,"post",`/projects/${project._id}/bids`,student.token,{amount:1000,timeline:"4 weeks",proposal:"Two design concepts with PDF and notes."});
  const revised=await json(request,"patch",`/bids/${bid._id}`,student.token,{action:"REVISE",amount:800,timeline:"3 weeks",proposal:"Two design checkpoints with a documented revision."});
  expect(revised.version).toBe(2); expect(revised.history).toHaveLength(1);
  expect((await request.post(api+"/payments/checkout-session",{headers:headers(client.token),data:{bidId:bid._id,proposalVersion:1}})).status()).toBe(409);
  expect((await request.post(api+"/payments/checkout-session",{headers:headers(stranger.token),data:{bidId:bid._id,proposalVersion:2}})).ok()).toBeFalsy();
  const ownerContext=await browser.newContext(); await ownerContext.addInitScript(token=>localStorage.setItem("token",token),client.token);
  const owner=await ownerContext.newPage(); await owner.goto(`/project/${project._id}`);
  await expect(owner.getByText("Experience: advanced",{exact:true})).toBeVisible();
  await expect(owner.getByText("Estimated duration: 4 weeks",{exact:true})).toBeVisible();
  await owner.getByRole("button",{name:"Accept Proposal",exact:true}).click(); await expect(owner.getByRole("dialog")).toContainText("version 2");
  await owner.getByRole("button",{name:"Continue to Checkout"}).click(); await expect(owner.getByRole("button",{name:"Go to Project Workspace"})).toBeVisible();
  await owner.getByRole("button",{name:"Go to Project Workspace"}).click();
  const contract=await json(request,"get",`/projects/${project._id}/contract`,client.token); expect(contract.totalPaise).toBe(80000); expect(contract.schedule.map(m=>m.amountPaise)).toEqual([8000,72000]);
  expect((await request.get(api+`/projects/${project._id}/contract`,{headers:headers(other.token)})).status()).toBe(404);
  expect((await request.patch(api+`/bids/${bid._id}`,{headers:headers(student.token),data:{action:"WITHDRAW"}})).status()).toBe(409);
  const repeat=await json(request,"post","/payments/checkout-session",client.token,{bidId:bid._id,proposalVersion:2}); expect(repeat.settled).toBe(true);
  const cancel=await json(request,"post","/payments/cancel",client.token,{projectId:project._id}); expect(cancel.message).toContain("retained");
  const detail=await json(request,"get",`/projects/${project._id}`); expect(detail.project.status).toBe("ASSIGNED");
  const evidence=await upload(student.token);
  await json(request,"patch",`/milestones/${detail.milestones[0]._id}/submit`,student.token,{description:"Design poster with acceptance notes, no software URLs.",attachments:[evidence]});
  const privateDownload=await request.get("http://127.0.0.1:5019"+evidence.url,{headers:headers(client.token)}); expect(privateDownload.ok()).toBeTruthy(); expect(await privateDownload.body()).toEqual(pdf); expect(privateDownload.headers()["content-disposition"]).toContain("attachment");
  expect((await request.get("http://127.0.0.1:5019"+evidence.url,{headers:headers(other.token)})).status()).toBe(404);
  const submission=await json(request,"get",`/milestones/${detail.milestones[0]._id}/submission`,client.token);
  await owner.route("**/api/milestones/*/submission",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"synthetic submission outage"})}));
  await owner.goto(`/project/${project._id}`); await owner.getByRole("button",{name:"Review Work",exact:true}).click();
  await expect(owner.getByRole("alert")).toContainText("synthetic submission outage");
  await expect(owner.getByRole("button",{name:"Approve Work",exact:true})).toBeDisabled();
  await owner.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click(); await owner.unroute("**/api/milestones/*/submission");
  expect((await request.patch(api+`/milestones/${detail.milestones[0]._id}/release`,{headers:headers(stranger.token),data:{status:"APPROVED",submissionId:submission._id}})).status()).toBe(409);
  await json(request,"patch",`/milestones/${detail.milestones[0]._id}/release`,client.token,{status:"APPROVED",submissionId:submission._id});
  const dashboard=await json(request,"get","/projects/student/dashboard",student.token); expect(dashboard.contracts.find(c=>c.id===project._id).progress).toBe(10);
  const ledger=await json(request,"get","/payments?limit=1",client.token); expect(ledger.transactions).toHaveLength(1); expect(ledger.pagination.total).toBe(3); expect(ledger.stats.releasedAmount).toBe(80);
  const msg={projectId:project._id,content:"Please confirm the remaining poster format.",requestId:crypto.randomUUID()};
  const sent=await json(request,"post","/messages",student.token,msg); expect((await json(request,"post","/messages",student.token,msg))._id).toBe(sent._id);
  const forbidden=await request.get(api+`/messages/${project._id}`,{headers:headers(other.token)}); expect(forbidden.status()).toBe(403);
  await owner.goto(`/project/${project._id}`); await owner.locator("#project-question").fill("Please review this contract before further work."); await owner.getByRole("button",{name:"Request operator review"}).click();
  await expect(owner.getByText("Recovery is pending operator review.",{exact:false})).toBeVisible();
  expect((await request.patch(api+`/milestones/${detail.milestones[1]._id}/submit`,{headers:headers(student.token),data:{description:"Work must not advance during recovery."}})).status()).toBe(409);
  // An API outage must remain visible; it must not look like a zero balance.
  await owner.route("**/api/payments",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"synthetic outage"})}));
  await owner.goto("/client"); await expect(owner.getByText("Workspace data unavailable")).toBeVisible(); await expect(owner.getByRole("button",{name:"Retry",exact:true})).toBeVisible();
  await owner.route("**/api/projects?*",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"synthetic directory outage"})}));
  await owner.goto("/browse"); await expect(owner.getByRole("alert")).toContainText("synthetic directory outage"); await expect(owner.getByText("No matching project briefs",{exact:true})).toHaveCount(0);
  await owner.goto("/profile"); await owner.getByRole("button",{name:"Edit profile",exact:true}).click(); await owner.locator("#profile-bio").fill("Profile edits retained through a failed save.");
  await owner.route(`**/api/users/${client._id}`,route=>route.request().method()==="PATCH" ? route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"synthetic profile outage"})}) : route.continue());
  await owner.getByRole("button",{name:"Save Changes",exact:true}).click(); await expect(owner.getByRole("alert")).toContainText("synthetic profile outage"); await expect(owner.locator("#profile-bio")).toHaveValue("Profile edits retained through a failed save.");
  await ownerContext.close();
});

test("software checkpoints: duplicate checkout, late demo funding, stale modal responses and cross-tab account change", async ({ browser, request }) => {
  const suffix=Date.now();
  const register=async role=>json(request,"post","/auth/register",null,{name:`Software ${role}`,email:`software${role}${suffix}@example.com`,password:"Synthetic123!",role});
  const client=await register("client"), student=await register("student");
  const project=await json(request,"post","/projects",client.token,{title:"Software checkpoint fixture",description:"Discovery and implementation with notes matching each checkpoint.",category:"Web Development",budget:1000,deadline:"2027-12-31",milestones:[{title:"Discovery",amount:100},{title:"Implementation",amount:900}]});
  const bid=await json(request,"post",`/projects/${project._id}/bids`,student.token,{amount:1000,timeline:"2 weeks",proposal:"Document discovery before delivering implementation."});
  const options={headers:{Authorization:`Bearer ${client.token}`},data:{bidId:bid._id,proposalVersion:1}};
  const attempts=await Promise.all([request.post(api+"/payments/checkout-session",options),request.post(api+"/payments/checkout-session",options)]);
  const successful=attempts.filter(r=>r.ok()); expect(successful.length).toBeGreaterThan(0);
  const first=await successful[0].json();
  const retry=await json(request,"post","/payments/checkout-session",client.token,{bidId:bid._id,proposalVersion:1}); expect(retry.sessionId).toBe(first.sessionId);
  await json(request,"post","/payments/cancel",client.token,{sessionId:first.sessionId});
  const confirmations=await Promise.all([json(request,"post","/payments/simulate-payment",client.token,{sessionId:first.sessionId}),json(request,"post","/payments/simulate-payment",client.token,{sessionId:first.sessionId})]); expect(confirmations).toHaveLength(2);
  const ledger=await json(request,"get","/payments",client.token); expect(ledger.transactions).toHaveLength(3);
  const context=await browser.newContext(); await context.addInitScript(token=>{if(!localStorage.getItem("token"))localStorage.setItem("token",token);},student.token);
  const page=await context.newPage(); await page.goto("/student");
  await page.setViewportSize({width:360,height:844}); await expect(page.getByRole("heading",{name:"Workspace: Software student",exact:true})).toBeVisible();
  await assertLayout(page,360,"student");
  // Delay A, switch to B, type B's draft, then complete A's old request.
  let release, delayedUrl; const gate=new Promise(resolve=>release=resolve);
  let intercepted=false;
  await page.route("**/api/milestones/*/submission",async route=>{
    if(intercepted) return route.continue();
    intercepted=true; delayedUrl=route.request().url(); const response=await route.fetch(); await gate; await route.fulfill({response});
  });
  await page.getByRole("button",{name:"Submit Deliverable",exact:true}).first().click();
  await expect.poll(()=>intercepted).toBe(true);
  await page.getByRole("dialog").getByRole("button",{name:"Cancel",exact:true}).click();
  await page.getByRole("button",{name:"Submit Deliverable",exact:true}).nth(1).click();
  await page.locator("#milestone-notes").fill("Draft belonging only to the second checkpoint.");
  const completed=page.waitForResponse(r=>r.url()===delayedUrl); release(); await completed;
  await expect(page.locator("#milestone-notes")).toHaveValue("Draft belonging only to the second checkpoint.");
  await page.getByRole("dialog").getByRole("button",{name:"Cancel",exact:true}).click(); await page.unroute("**/api/milestones/*/submission");
  await expect(page.getByRole("button",{name:"Submit Deliverable",exact:true}).nth(1)).toBeFocused();
  await page.getByRole("button",{name:"Submit Deliverable",exact:true}).first().click(); await page.locator("#milestone-notes").fill("Discovery notes; a deployed application is not required at this checkpoint.");
  await page.getByRole("dialog").getByRole("button",{name:"Submit Deliverable",exact:true}).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  const secondTab=await context.newPage(); await secondTab.goto("/browse"); await secondTab.evaluate(token=>localStorage.setItem("token",token),client.token);
  await expect(page.getByRole("heading",{name:"Client Dashboard",exact:true})).toBeVisible();
  await page.goto("/post"); await page.locator("#project-title").fill("Account-scoped draft"); await page.locator("#milestone-title-0").fill("Preserved custom checkpoint"); await page.reload();
  await expect(page.locator("#milestone-title-0")).toHaveValue("Preserved custom checkpoint");
  const drafts=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith("bidhub_post_draft:"))); expect(drafts).toEqual([`bidhub_post_draft:${client._id}`]);
  await json(request,"post","/projects",client.token,{title:"A long project brief title to check responsive comparison with large budgets and clear deliverable requirements",description:"Long-content directory fixture for responsive verification.",category:"Writing & Content",budget:"9999999.99",deadline:"2027-12-31",milestones:[{title:"Research and final deliverable",amount:"9999999.99"}]});
  for(const theme of ["light","dark"]) {
    if(await page.evaluate(()=>document.documentElement.classList.contains("dark")) !== (theme==="dark")) await page.getByRole("button",{name:"Toggle theme appearance"}).click();
    for(const width of [360,390,768,1024,1440]) {
      await page.setViewportSize({width,height:900});
      for(const route of ["/browse","/post","/profile","/client",`/project/${project._id}`]) {
        await page.goto(route); await expect(page.locator("main h1").first()).toBeVisible();
        await assertLayout(page,width,`${theme} ${route}`);
      }
    }
    await page.setViewportSize({width:390,height:844}); await page.goto("/browse"); await expect(page.getByText("A long project brief title",{exact:false}).first()).toBeVisible();
    await page.screenshot({path:`e2e-results/mobile-directory-${theme}.png`,fullPage:true}); await page.reload();
    expect(await page.evaluate(()=>document.documentElement.classList.contains("dark"))).toBe(theme==="dark");
  }
  const asset=await request.get("http://127.0.0.1:5189/brand/bidhub/fonts/ibm-plex-sans-variable.woff2"); expect(asset.ok()).toBeTruthy(); expect(asset.headers()["content-type"]).toContain("font");
  const anonymous=await browser.newContext(); const login=await anonymous.newPage(); await login.goto(`/project/${project._id}`);
  await login.getByRole("button",{name:"Sign in to Bid",exact:true}).click();
  await login.locator("#login-email").fill(`softwarestudent${suffix}@example.com`); await login.locator("#login-password").fill("Synthetic123!");
  await login.getByRole("button",{name:"Sign In",exact:true}).click();
  await expect(login).toHaveURL(new RegExp(`/project/${project._id}$`)); await expect(login.getByText("Software checkpoint fixture",{exact:true}).first()).toBeVisible(); await anonymous.close();
  await context.close();
});

test("existing payment, security/chat and runtime integration commands on the isolated database", async () => {
  for (const script of ["payment_flow.test.js","security_chat.test.js","runtime_verification.js"]) {
    await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[`tests/${script}`],{cwd:"backend",windowsHide:true,env:{...process.env,TEST_MONGODB_URI:process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27129/journey?replicaSet=journey",JWT_SECRET:"synthetic-legacy-tests-at-least-32-characters",PRODUCT_MODE:"demo",PRIVATE_STORAGE:"mongodb"},stdio:["ignore","pipe","pipe"]});
      let output=""; const timer=setTimeout(()=>{child.kill();reject(new Error(`${script} exceeded 60 seconds`));},60000);
      child.stdout.on("data",data=>output+=data.toString()); child.stderr.on("data",data=>output+=data.toString());
      child.on("error",reject); child.on("exit",code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`${script} failed:\n${output.slice(-6000)}`));});
    });
  }
});
