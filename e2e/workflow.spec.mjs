import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mongoose from "../backend/node_modules/mongoose/index.js";
import AdmZip from "adm-zip";
import jwt from "jsonwebtoken";
import net from "node:net";
import http from "node:http";
import zlib from "node:zlib";
const children = [];
const api = "http://127.0.0.1:5019/api";
const sandbox = process.env.BIDHUB_SANDBOX_E2E === "1";
const serverEnv = { PORT: "5019", NODE_ENV: sandbox ? "production" : "test", PRODUCT_MODE: "test", BIDHUB_ISOLATED_TEST: sandbox ? "" : "1", PAYMENT_PROVIDER: sandbox ? "razorpay" : "mock", JWT_SECRET: "synthetic-browser-test-secret-at-least-32-characters", MONGODB_URI: process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27129/journey?replicaSet=journey", PRIVATE_STORAGE: "mongodb", CLOUDINARY_CLOUD_NAME: "fixture", CLOUDINARY_API_KEY: "fixture", CLOUDINARY_API_SECRET: "fixture", CLIENT_URL: "http://127.0.0.1:5189", AUTH_RATE_LIMIT: "1000" };
let apiProcess;
const run = (exe, args, env = {}) => { const child = spawn(exe, args, { env: { ...process.env, ...env }, windowsHide: true, stdio: "ignore" }); children.push(child); return child; };
test.beforeAll(async () => {
  // Never attach to an unrelated process just because it owns a fixture port.
  for (const port of [...(process.env.TEST_MONGODB_URI ? [] : [27129]), 5019, 5189, 5190]) {
    await new Promise((resolve, reject) => {
      const probe=net.createServer();
      probe.once("error", error=>reject(new Error(`Isolated E2E port ${port} is unavailable; do not run these suites concurrently. ${error.message}`)));
      probe.listen(port,"127.0.0.1",()=>probe.close(resolve));
    });
  }
  if (!process.env.TEST_MONGODB_URI) {
  const binary = process.env.MONGOD_BINARY || "C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe";
  if (!fs.existsSync(binary)) throw new Error("Required E2E replica-set binary missing; set MONGOD_BINARY.");
  run(binary, ["--dbpath", fs.mkdtempSync(path.join(os.tmpdir(), "bidhub-e2e-")), "--port", "27129", "--bind_ip", "127.0.0.1", "--replSet", "journey", "--oplogSize", "32", "--wiredTigerCacheSizeGB", "0.25"]);
  let client;
  for (let i=0; i<40; i++) { try { client = await new mongoose.mongo.MongoClient("mongodb://127.0.0.1:27129/?directConnection=true", { serverSelectionTimeoutMS: 500 }).connect(); break; } catch { await new Promise(r=>setTimeout(r,200)); } }
  if (!client) throw new Error("Isolated E2E MongoDB failed to start.");
  await client.db("admin").command({ replSetInitiate: { _id: "journey", members: [{ _id: 0, host: "127.0.0.1:27129" }] } }); await client.close();
  }
  apiProcess = run(process.execPath, ["backend/index.js"], serverEnv);
  run(process.execPath, ["node_modules/vite/bin/vite.js", "--port", "5189", "--host", "127.0.0.1", "--strictPort"], { BIDHUB_API_TARGET: "http://127.0.0.1:5019" });
  for (let i=0;i<80;i++) { try { if ((await fetch(api+"/ready")).ok && (await fetch("http://127.0.0.1:5189")).ok) return; } catch {} await new Promise(r=>setTimeout(r,500)); }
  throw new Error("E2E services did not become ready.");
});
test.afterAll(async () => {
  for (const child of children.reverse()) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) continue;
    await new Promise((resolve, reject) => {
      const timeout=setTimeout(()=>reject(new Error(`Isolated fixture process ${child.pid} did not stop.`)),5000);
      child.once("exit",()=>{clearTimeout(timeout);resolve();}); child.kill();
    });
  }
});
async function json(request, method, endpoint, token, data) {
  if(method==="post" && endpoint==="/projects") data={skillsRequired:["Test fixture skill"],...data};
  const response = await request[method](api + endpoint, { headers: token ? { Authorization: "Bearer " + token } : {}, data });
  expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
}
async function assertLayout(page, width, label = "") {
  const report = await page.evaluate(width => ({ width: document.documentElement.scrollWidth, offenders: [...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right > width + 1).sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width).slice(0,18).map(e=>({tag:e.tagName,classes:e.className,left:Math.round(e.getBoundingClientRect().left),right:Math.round(e.getBoundingClientRect().right),width:Math.round(e.getBoundingClientRect().width),text:e.textContent?.slice(0,70)})) }), width);
  expect(report.width, `${label} ${JSON.stringify(report.offenders)}`).toBeLessThanOrEqual(width);
}
async function completeSandboxCheckout(page) {
  const frame=page.frameLocator("iframe.razorpay-checkout-frame");
  await expect(page.locator("iframe.razorpay-checkout-frame")).toBeVisible({timeout:30000});
  const phone=frame.getByPlaceholder("Mobile number",{exact:true});
  await phone.waitFor({state:"visible",timeout:45000}); await phone.fill("9000090000");
  await frame.getByRole("button",{name:"Continue",exact:true}).last().click();
  await frame.getByText("Cards",{exact:true}).click();
  await frame.getByText("Add a new card",{exact:true}).click();
  const card=frame.getByPlaceholder(/Card number/i);
  await card.waitFor({state:"visible",timeout:15000});
  await card.fill("4100280000001007");
  await frame.getByPlaceholder(/MM\s*\/\s*YY/i).fill("12/30");
  await frame.getByPlaceholder(/CVV/i).fill("111");
  await page.screenshot({path:"e2e-results/sandbox-card-ready.png",fullPage:true});
  const popupPromise=page.context().waitForEvent("page",{timeout:15000}).catch(()=>null);
  await frame.getByRole("button",{name:"Continue",exact:true}).last().click();
  const popup=await popupPromise;
  if(popup) {
    await popup.waitForLoadState("domcontentloaded").catch(()=>{});
    await expect(popup.locator("body")).toContainText(/success|failure/i,{timeout:30000});
    await popup.getByRole("button",{name:/success/i}).click();
  } else {
    const otp=frame.getByPlaceholder(/OTP|one.time password/i);
    await expect(otp).toBeVisible({timeout:45000}); await otp.fill("123456");
    await frame.getByRole("button",{name:/submit|verify/i}).click();
  }
  await expect(page.getByRole("button",{name:"Go to Project Workspace"})).toBeVisible({timeout:90000});
}

test(`${sandbox ? "two-role production Razorpay sandbox" : "two-role isolated test provider"}: different offer, two milestones, revision, approvals and reviews`, async ({ browser, request }) => {
  const suffix = Date.now();
  const client = await json(request, "post", "/auth/register", null, { name: "Client Fixture", email: `client${suffix}@example.com`, password: "Synthetic123!", role: "client" });
  const student = await json(request, "post", "/auth/register", null, { name: "Student Fixture", email: `student${suffix}@example.com`, password: "Synthetic123!", role: "student" });
  const ownerContext = await browser.newContext(); await ownerContext.addInitScript(token => localStorage.setItem("token", token), client.token);
  const owner = await ownerContext.newPage(); await owner.goto("/post");
  await owner.locator("#project-title").fill("Writing journey fixture");
  await owner.locator("#project-description").fill("Prepare two independently reviewed writing deliverables.");
  await owner.locator("#project-category").click(); await owner.getByRole("option", {name:"Writing & Content",exact:true}).click();
  await owner.getByPlaceholder("Add a required skill (e.g. React, Figma, Python)…").fill("Editorial"); await owner.getByPlaceholder("Add a required skill (e.g. React, Figma, Python)…").press("Enter");
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
  if(process.env.BIDHUB_SANDBOX_ENTRY==="detail") { await owner.goto(`/project/${project._id}`); await owner.getByRole("button",{name:"Accept Proposal",exact:true}).click(); }
  else { await owner.goto("/client"); await owner.getByRole("button", { name: /accept/i }).first().click(); }
  await expect(owner.getByRole("dialog")).toContainText("12,500");
  await owner.getByRole("button", { name: "Continue to Checkout" }).click();
  if(sandbox) await completeSandboxCheckout(owner);
  await owner.getByRole("button", {name:"Go to Project Workspace"}).click();
  await expect.poll(async () => (await json(request,"get",`/projects/${project._id}`)).project.status).toBe("ASSIGNED");
  const detail = await json(request,"get",`/projects/${project._id}`);
  expect(detail.project.budget).toBe(50000); expect(detail.project.contractTotalPaise).toBe(2500000);
  expect(detail.milestones).toHaveLength(2); expect(detail.milestones.reduce((n,m)=>n+m.amount,0)).toBe(25000);
  owner.on("dialog", dialog=>dialog.accept());
  const deliver=async (notes, url = "")=>{
    await page.goto("/student"); await page.getByRole("button", { name: /^(Submit Deliverable|Resubmit Deliverable)$/ }).first().click();
    await page.locator("#milestone-notes").fill(notes);
    await page.locator("#milestone-demo-url").fill(url);
    await page.getByRole("dialog").getByRole("button", {name:"Submit Deliverable",exact:true}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  };
  const openReview=async()=>{ await owner.goto(`/project/${project._id}`); await owner.getByRole("button", {name:"Review Work",exact:true}).first().click(); await expect(owner.getByRole("button",{name:"Approve Work",exact:true})).toBeEnabled(); };
  for (const [index, milestone] of detail.milestones.entries()) {
    await deliver("Writing deliverable evidence and acceptance notes.", "https://example.com/original-writing");
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
  const outsider=await json(request,"post","/auth/register",null,{name:"Unrelated reviewer",email:`outside-${suffix}@example.com`,password:"Synthetic123!",role:"student"});
  const reviewRequest=(token,revieweeId)=>request.post(api+"/reviews",{headers:{Authorization:`Bearer ${token}`},data:{projectId:project._id,revieweeId,rating:5,comment:"A review requires completed-project participation."}});
  expect((await reviewRequest(client.token,client._id)).status()).toBe(400);
  expect((await reviewRequest(client.token,outsider._id)).status()).toBe(400);
  expect((await reviewRequest(outsider.token,student._id)).status()).toBe(403);
  expect((await request.get(api+`/milestones/${detail.milestones[0]._id}/submission?history=true`,{headers:{Authorization:`Bearer ${outsider.token}`}})).status()).toBe(403);
  expect((await json(request,"get","/projects/student/dashboard",student.token)).contracts.find(c=>c.id===project._id).status).toBe("completed");
  expect((await json(request,"get",`/users/${client._id}`,client.token)).user.completedProjects).toBe(1);
  for (const actor of [owner,page]) {
    await actor.goto(`/project/${project._id}`);
    await actor.locator("summary").filter({hasText:"Submission history"}).first().click();
    await expect(actor.getByText("Version 1 · CHANGES_REQUESTED",{exact:true})).toBeVisible();
    await expect(actor.getByText("Version 2 · APPROVED",{exact:true})).toBeVisible();
    await expect(actor.getByRole("link",{name:"Deliverable: https://example.com/original-writing",exact:true}).first()).toBeVisible();
  }
  for(const [actor,comment] of [[owner,"Clear writing and responsive revisions."],[page,"Useful scope and specific feedback."]]) {
    await actor.goto(`/project/${project._id}`); await actor.locator("#review-comment").fill(comment); await actor.getByRole("button",{name:"Submit Review",exact:true}).click();
    await expect(actor.getByText(comment,{exact:false}).first()).toBeVisible();
    await expect(actor.locator("#review-comment")).toHaveCount(0);
  }
  const reviews=await json(request,"get",`/reviews/users/${student._id}/reviews`);
  const repeated=await reviewRequest(client.token,student._id); expect(repeated.ok()).toBeTruthy(); expect((await repeated.json())._id).toBe(reviews[0]._id);
  expect(await json(request,"get",`/reviews/users/${student._id}/reviews`)).toHaveLength(1);
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
  expect(await json(request,"get",`/projects/${project._id}/clarifications`,student.token)).toHaveLength(2);
  expect((await request.post(api+`/projects/${project._id}/clarifications`,{headers:headers(student.token),data:{content:"Cannot change agreed terms here."}})).status()).toBe(409);
  expect((await request.get(api+`/projects/${project._id}/clarifications`,{headers:headers(other.token)})).status()).toBe(403);
  await owner.locator("summary").filter({hasText:"Retained brief clarifications"}).click();
  await expect(owner.getByText("Does the final poster need print-ready PDF?",{exact:false})).toBeVisible();
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
  const ledger=await json(request,"get","/payments?limit=1",client.token); expect(ledger.transactions).toHaveLength(1); expect(ledger.pagination.total).toBe(3); expect(ledger.stats.releasedAmount).toBe(0);
  const msg={projectId:project._id,content:"Please confirm the remaining poster format.",requestId:crypto.randomUUID()};
  const sent=await json(request,"post","/messages",student.token,msg); expect((await json(request,"post","/messages",student.token,msg))._id).toBe(sent._id);
  const forbidden=await request.get(api+`/messages/${project._id}`,{headers:headers(other.token)}); expect(forbidden.status()).toBe(403);
  await owner.goto(`/project/${project._id}`); await owner.locator("#project-question").fill("Please review this contract before further work."); await owner.getByRole("button",{name:"Request operator review"}).click();
  await expect(owner.getByText("Recovery is pending operator review.",{exact:false})).toBeVisible();
  expect((await request.patch(api+`/milestones/${detail.milestones[1]._id}/submit`,{headers:headers(student.token),data:{description:"Work must not advance during recovery."}})).status()).toBe(409);
  // An API outage must remain visible; it must not look like a zero balance.
  await owner.route("**/api/payments",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"synthetic outage"})}));
  await owner.goto("/client"); await expect(owner.locator("main h1").first()).toContainText("Client Dashboard"); await expect(owner.getByRole("alert")).toContainText("Financial data unavailable. Work data remains available"); await expect(owner.getByRole("button",{name:"Retry unavailable data"})).toBeVisible();
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
      const child=spawn(process.execPath,[`tests/${script}`],{cwd:"backend",windowsHide:true,env:{...process.env,TEST_MONGODB_URI:process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27129/journey?replicaSet=journey",JWT_SECRET:"synthetic-legacy-tests-at-least-32-characters",PRODUCT_MODE:"test",BIDHUB_ISOLATED_TEST:"1",PRIVATE_STORAGE:"mongodb"},stdio:["ignore","pipe","pipe"]});
      let output=""; const timer=setTimeout(()=>{child.kill();reject(new Error(`${script} exceeded 60 seconds`));},60000);
      child.stdout.on("data",data=>output+=data.toString()); child.stderr.on("data",data=>output+=data.toString());
      child.on("error",reject); child.on("exit",code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`${script} failed:\n${output.slice(-6000)}`));});
    });
  }
});

test("final independent review: restart recovery, remaining category journeys, cancellation and built routes", async ({ browser, request }) => {
  const suffix=Date.now(), headers=token=>({Authorization:`Bearer ${token}`});
  const client=await json(request,"post","/auth/register",null,{name:"Review client",email:`review-client-${suffix}@example.com`,password:"Synthetic123!",role:"client"});
  const student=await json(request,"post","/auth/register",null,{name:"Review student",email:`review-student-${suffix}@example.com`,password:"Synthetic123!",role:"student"});
  const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
  for(const [i,account] of [client,student].entries()) await contexts[i].addInitScript(token=>localStorage.setItem("token",token),account.token);
  const owner=await contexts[0].newPage(), worker=await contexts[1].newPage(); owner.on("dialog",dialog=>dialog.accept());
  const publish=category=>json(request,"post","/projects",client.token,{title:`Review ${category} ${suffix}`,description:"Discovery followed by a final deliverable with a documented review round.",category,budget:1000,deadline:"2027-12-31",remote:true,location:"Remote",duration:"2 weeks",level:"intermediate",skillsRequired:[category],milestones:[{title:"Discovery",amount:100},{title:"Final delivery",amount:900}]});
  const design=await publish("Product Design");
  const pdf=Buffer.from("%PDF-1.4\nRetained design specification\n%%EOF");
  const uploaded=await request.post(api+"/uploads/files",{headers:headers(client.token),multipart:{files:{name:"design.pdf",mimeType:"application/pdf",buffer:pdf}}}); expect(uploaded.ok()).toBeTruthy();
  // A separate brief publishes the real owned file; leave the first one for cancellation.
  const file=(await uploaded.json())[0];
  const project=await json(request,"post","/projects",client.token,{title:`Design evidence ${suffix}`,description:"Poster discovery and final design.",category:"Product Design",budget:1000,deadline:"2027-12-31",files:[file],milestones:[{title:"Discovery",amount:100},{title:"Final poster",amount:900}]});
  const sharedBrief=await json(request,"post","/projects",client.token,{title:`Shared brief material ${suffix}`,description:"The same owned specification is intentionally published again.",category:"Product Design",budget:100,deadline:"2027-12-31",files:[file],milestones:[{title:"Delivery",amount:100}]});
  const bid=await json(request,"post",`/projects/${project._id}/bids`,student.token,{amount:700,timeline:"one week",proposal:"Poster PDF with two reviewed checkpoints."});
  const checkout=await json(request,"post","/payments/checkout-session",client.token,{bidId:bid._id,proposalVersion:1});
  expect((await request.get("http://127.0.0.1:5019"+file.url,{headers:headers(student.token)})).ok()).toBeTruthy();
  await json(request,"post","/payments/cancel",client.token,{sessionId:checkout.sessionId});
  // Restart the actual API process, preserving the replica-set data and pending order.
  const exited=new Promise(resolve=>apiProcess.once("exit",resolve)); apiProcess.kill(); await exited;
  apiProcess=run(process.execPath,["backend/index.js"],serverEnv);
  await expect.poll(async()=>{try{return (await request.get(api+"/ready")).ok();}catch{return false;}},{timeout:20000}).toBe(true);
  expect((await json(request,"post","/payments/checkout-session",client.token,{bidId:bid._id,proposalVersion:1})).sessionId).toBe(checkout.sessionId);
  await json(request,"post","/payments/simulate-payment",client.token,{sessionId:checkout.sessionId});
  await json(request,"post","/payments/simulate-payment",client.token,{sessionId:checkout.sessionId});
  expect((await json(request,"get","/payments",client.token)).pagination.total).toBe(3);
  const prospect=await json(request,"post","/auth/register",null,{name:"Other prospect",email:`prospect-${suffix}@example.com`,password:"Synthetic123!",role:"student"});
  expect((await request.get("http://127.0.0.1:5019"+file.url,{headers:headers(prospect.token)})).ok()).toBeTruthy();
  expect((await request.get(api+`/projects/${project._id}/bids`,{headers:headers(prospect.token)})).ok()).toBeTruthy();
  expect(await json(request,"get",`/projects/${project._id}/bids`,prospect.token)).toHaveLength(0);
  const caps=await json(request,"get","/capabilities"); expect(caps).toMatchObject({mode:"test",isolatedTest:true,simulatedFunding:true,livePayments:false,payouts:false});
  for(const current of [project,await publish("Web Development")]) {
    if(current._id!==project._id) {
      await worker.goto(`/project/${current._id}`); await worker.locator("#bid-price").fill("900"); await worker.locator("#bid-timeline").fill("two weeks"); await worker.locator("#bid-proposal").fill("Discovery notes and software implementation evidence."); await worker.getByRole("button",{name:"Submit Proposal",exact:true}).click();
      await expect(worker.getByRole("button",{name:"Revise proposal",exact:true})).toBeVisible();
      await worker.getByRole("button",{name:"Revise proposal",exact:true}).click(); await worker.locator("#bid-price").fill("600"); await worker.getByRole("button",{name:"Save Proposal Revision",exact:true}).click();
      await owner.goto(`/project/${current._id}`); await owner.getByRole("button",{name:"Accept Proposal",exact:true}).click(); await expect(owner.getByRole("dialog")).toContainText("version 2"); await owner.getByRole("button",{name:"Continue to Checkout"}).click(); await owner.getByRole("button",{name:"Go to Project Workspace"}).click();
    }
    for(let i=0;i<2;i++) {
      await worker.goto("/student"); await worker.getByRole("button",{name:"Submit Deliverable",exact:true}).first().click();
      await worker.locator("#milestone-notes").fill(`${current.category}: checkpoint ${i+1} acceptance evidence and rationale.`);
      if(current.category==="Web Development" && i===1) await worker.locator("#milestone-github-url").fill("https://github.com/example/software");
      if(current.category==="Product Design") await worker.locator("#milestone-demo-url").fill("https://example.com/poster.pdf");
      await worker.getByRole("dialog").getByRole("button",{name:"Submit Deliverable",exact:true}).click(); await expect(worker.getByRole("dialog")).toHaveCount(0);
      await owner.goto(`/project/${current._id}`); await owner.getByRole("button",{name:"Review Work",exact:true}).first().click(); await expect(owner.getByRole("button",{name:"Approve Work",exact:true})).toBeEnabled(); await owner.getByRole("button",{name:"Approve Work",exact:true}).click(); await expect(owner.getByRole("dialog")).toHaveCount(0);
    }
    expect((await json(request,"get",`/projects/${current._id}`)).project.status).toBe("COMPLETED");
    for(const actor of [owner,worker]) {
      await actor.goto(`/project/${current._id}`); await actor.locator("#review-comment").fill(`Factual ${current.category} collaboration review.`); await actor.getByRole("button",{name:"Submit Review",exact:true}).click(); await expect(actor.locator("#review-comment")).toHaveCount(0);
      await actor.locator("summary").filter({hasText:"Submission history"}).first().click(); await expect(actor.getByText("Version 1 · APPROVED",{exact:true}).first()).toBeVisible();
    }
  }
  // Real message commit followed by a dropped browser response must retry the original ID.
  await owner.goto("/client"); await owner.getByRole("button",{name:`${project.title} · Open workspace`,exact:true}).click();
  // Use the student dashboard's retained discussion control after completion.
  await worker.goto("/student"); await worker.getByRole("heading",{name:`Review client · ${project.title}`,exact:true}).locator("..").locator("..").getByRole("button",{name:"Discussion",exact:true}).click();
  let dropped=false, sentId;
  await worker.route("**/api/messages",async route=>{
    if(route.request().method()!=="POST" || dropped) return route.continue();
    dropped=true; const response=await route.fetch(); expect(response.ok()).toBeTruthy(); sentId=(await response.json())._id; await route.abort("failed");
  });
  await worker.getByRole("textbox",{name:"Type a message"}).fill("Retained chat after completion and a lost response.");
  await worker.getByRole("textbox",{name:"Type a message"}).press("Enter");
  await expect(worker.getByRole("alert")).toBeVisible(); await expect(worker.getByRole("textbox",{name:"Type a message"})).toHaveValue("Retained chat after completion and a lost response.");
  await worker.getByRole("textbox",{name:"Type a message"}).press("Enter"); await expect(worker.getByRole("textbox",{name:"Type a message"})).toHaveValue("");
  const messages=await json(request,"get",`/messages/${project._id}`,student.token); expect(messages.messages.filter(m=>m._id===sentId)).toHaveLength(1);
  await worker.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click();
  await owner.getByRole("button",{name:"Notifications",exact:true}).click(); await owner.getByRole("button",{name:"Mark all read",exact:true}).click();
  await expect.poll(async()=>(await json(request,"get","/notifications",client.token)).unreadCount).toBe(0); await owner.keyboard.press("Escape");
  const archive=new AdmZip(); archive.addFile("README.md",Buffer.from("Manifest fixture, not hosted source."));
  const imported=await request.post(api+"/import/local",{headers:headers(client.token),multipart:{file:{name:"source.zip",mimeType:"application/zip",buffer:archive.toBuffer()}}}); expect(imported.ok(),await imported.text()).toBeTruthy(); expect((await imported.json()).manifest[0].path).toBe("README.md");
  const tooMany=new AdmZip(); for(let i=0;i<21;i++) tooMany.addFile(`file-${i}.md`,Buffer.from("Fixture"));
  expect((await request.post(api+"/import/local",{headers:headers(client.token),multipart:{file:{name:"over-limit.zip",mimeType:"application/zip",buffer:tooMany.toBuffer()}}})).status()).toBe(400);
  // Open briefs without bids remain discoverable and cancellable from the client's dashboard.
  await owner.goto("/client"); await owner.getByRole("button",{name:`${design.title} · Open workspace`,exact:true}).click(); await owner.getByRole("button",{name:"Cancel open brief",exact:true}).click(); await expect.poll(async()=>(await json(request,"get",`/projects/${design._id}`)).project.status).toBe("CANCELLED");
  await owner.goto("/client"); await expect(owner.getByRole("heading",{name:"Cancelled history (1)",exact:true})).toBeVisible();
  await owner.getByRole("button",{name:`${design.title} · Open workspace`,exact:true}).click(); await expect(owner.getByRole("button",{name:"Cancel open brief",exact:true})).toHaveCount(0);
  // Exercise actual compiled assets and local SPA serving. This is not the Vercel routing engine.
  expect(fs.existsSync("dist/index.html"),"Build first: npm run build").toBe(true);
  run(process.execPath,["node_modules/vite/bin/vite.js","preview","--port","5190","--host","127.0.0.1","--strictPort"],{BIDHUB_API_TARGET:"http://127.0.0.1:5019"});
  await expect.poll(async()=>{try{return (await request.get("http://127.0.0.1:5190")).ok();}catch{return false;}}).toBe(true);
  for(const route of ["/browse","/student","/client","/post","/profile",`/project/${project._id}`]) { await owner.goto("http://127.0.0.1:5190"+route); await owner.reload(); await expect(owner.locator("main").first()).toBeVisible(); }
  const html=await (await request.get("http://127.0.0.1:5190")).text();
  for(const extension of ["js","css"]) { const asset=html.match(new RegExp(`/assets/[^" ]+\\.${extension}`))[0]; const response=await request.get("http://127.0.0.1:5190"+asset); expect(response.ok()).toBeTruthy(); expect(response.headers()["content-type"]).toMatch(extension==="js"?/javascript/:/css/); }
  const apiResponse=await request.get("http://127.0.0.1:5190/api/capabilities"); expect(apiResponse.headers()["content-type"]).toContain("application/json");
  for(const file of ["vercel.json","frontend/vercel.json"]) { const config=JSON.parse(fs.readFileSync(file,"utf8")); expect(config.rewrites[0].source).toBe("/api/:path*"); expect(config.rewrites.at(-1).destination).toBe("/"); }
  await Promise.all(contexts.map(context=>context.close()));
});

test("retained history pages beyond one hundred records with participant-only evidence", async ({ browser, request }) => {
  const suffix=Date.now();
  const register=role=>json(request,"post","/auth/register",null,{name:`History ${role}`,email:`history-${role}-${suffix}@example.com`,password:"Synthetic123!",role});
  const client=await register("client"), student=await register("student");
  const project=await json(request,"post","/projects",client.token,{title:`History pagination ${suffix}`,description:"A brief with retained historical discussions and submission evidence.",category:"Writing & Content",budget:100,deadline:"2027-12-31",milestones:[{title:"Delivery",amount:100}]});
  const bid=await json(request,"post",`/projects/${project._id}/bids`,student.token,{amount:80,timeline:"one week",proposal:"A reviewed writing deliverable."});
  const order=await json(request,"post","/payments/checkout-session",client.token,{bidId:bid._id,proposalVersion:1});
  await json(request,"post","/payments/simulate-payment",client.token,{sessionId:order.sessionId});
  const milestone=(await json(request,"get",`/projects/${project._id}`)).milestones[0];
  await json(request,"patch",`/milestones/${milestone._id}/submit`,student.token,{description:"The latest writing evidence version."});
  // Seed a historical volume fixture in this isolated DB. The operation under
  // test is real authorized retrieval/pagination, not 102 human review rounds.
  const connection=await new mongoose.mongo.MongoClient(serverEnv.MONGODB_URI).connect();
  try {
    const db=connection.db(), milestoneId=new mongoose.Types.ObjectId(milestone._id), projectId=new mongoose.Types.ObjectId(project._id), studentId=new mongoose.Types.ObjectId(student._id);
    await db.collection("milestonesubmissions").updateOne({milestoneId},{$set:{version:102}});
    await db.collection("milestonesubmissions").insertMany(Array.from({length:101},(_,i)=>({milestoneId,submittedBy:studentId,version:i+1,status:"CHANGES_REQUESTED",description:`Retained evidence version ${i+1}.`,demoUrl:`https://example.com/evidence/${i+1}`,githubUrl:"",videoUrl:"",attachments:[],reviewComment:"Historical revision feedback."})));
    await db.collection("clarifications").insertMany(Array.from({length:102},(_,i)=>({projectId,authorId:studentId,content:`Historical clarification ${i+1}.`,createdAt:new Date()})));
  } finally { await connection.close(); }
  const headers={Authorization:`Bearer ${client.token}`};
  const initial=await request.get(api+`/milestones/${milestone._id}/submission?history=true`,{headers}); expect((await initial.json())).toHaveLength(25); expect(initial.headers()["x-next-cursor"]).toBe("78");
  expect((await request.get(api+`/milestones/${milestone._id}/submission?history=true&before=invalid`,{headers})).status()).toBe(400);
  expect((await request.get(api+`/milestones/${milestone._id}/submission?history=true`)).status()).toBe(401);
  expect((await request.get(api+`/projects/${project._id}/clarifications?before=invalid`,{headers})).status()).toBe(400);
  const context=await browser.newContext(); await context.addInitScript(token=>localStorage.setItem("token",token),client.token);
  const page=await context.newPage(); await page.goto(`/project/${project._id}`);
  await page.locator("summary").filter({hasText:"Submission history"}).click();
  for(let i=0;i<4;i++) { await page.getByRole("button",{name:"Load earlier submissions",exact:true}).click(); await expect(page.locator("summary").filter({hasText:"Submission history"})).toContainText(String(Math.min(102,(i+2)*25))); }
  await expect(page.getByRole("link",{name:"Deliverable: https://example.com/evidence/1",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Load earlier submissions",exact:true})).toHaveCount(0);
  await page.locator("summary").filter({hasText:"Retained brief clarifications"}).click();
  for(let i=0;i<4;i++) { await page.getByRole("button",{name:"Load earlier clarifications",exact:true}).click(); await expect(page.locator("summary").filter({hasText:"Retained brief clarifications"})).toContainText(String(Math.min(102,(i+2)*25))); }
  await expect(page.getByText("Historical clarification 1.",{exact:false})).toBeVisible();
  await expect(page.getByRole("button",{name:"Load earlier clarifications",exact:true})).toHaveCount(0);
  await context.close();
});

test("dashboard pages bound growing lists while counts and money remain account-wide", async ({ browser, request }) => {
  const suffix=Date.now();
  const register=role=>json(request,"post","/auth/register",null,{name:`Volume ${role}`,email:`volume-${role}-${suffix}@example.com`,password:"Synthetic123!",role});
  const client=await register("client"), student=await register("student");
  const connection=await new mongoose.mongo.MongoClient(serverEnv.MONGODB_URI).connect();
  try {
    const db=connection.db(), clientId=new mongoose.Types.ObjectId(client._id), studentId=new mongoose.Types.ObjectId(student._id), projects=[], bids=[], milestones=[], ledgers=[];
    // Historical volume fixture only. Normal publication/funding is exercised
    // by the other browser journeys; no operation being paginated is replaced.
    for(let i=0;i<52;i++) {
      const projectId=new mongoose.Types.ObjectId(), bidId=new mongoose.Types.ObjectId(), active=i<26;
      projects.push({_id:projectId,clientId,title:`Volume ${active?"active":"open"} ${i}`,description:"Synthetic retained workspace for pagination.",category:"Writing & Content",budget:20,deadline:"2027-12-31",status:active?"ASSIGNED":"OPEN",acceptedBidId:active?bidId:null,contractTotalPaise:active?1000:undefined,bidsCount:1,files:[],skillsRequired:[],createdAt:new Date()});
      bids.push({_id:bidId,projectId,studentId,amount:10,timeline:"one week",proposal:"Synthetic offer for historical pagination.",status:active?"ACCEPTED":"PENDING",version:1,schedule:[],createdAt:new Date()});
      const milestoneId=new mongoose.Types.ObjectId(); milestones.push({_id:milestoneId,projectId,title:"Delivery",amount:active?10:20,status:"PENDING"});
      if(active) ledgers.push({projectId,milestoneId,clientId,studentId,amount:10,amountPaise:1000,provider:"mock",status:"LOCKED"});
    }
    await db.collection("projects").insertMany(projects); await db.collection("bids").insertMany(bids); await db.collection("milestones").insertMany(milestones); await db.collection("paymentledgers").insertMany(ledgers);
  } finally { await connection.close(); }
  for(const contractPage of [1,2]) {
    const dashboard=await json(request,"get",`/projects/student/dashboard?contractPage=${contractPage}&bidPage=1`,student.token);
    expect(dashboard.contracts).toHaveLength(contractPage===1?25:1); expect(dashboard.bids).toHaveLength(25);
    expect(dashboard.stats).toEqual({activeContractsCount:26,openBidsCount:26}); expect(dashboard.pagination.bids.total).toBe(52);
  }
  const ownerPage=await json(request,"get","/projects/client/dashboard?projectPage=1&bidPage=2",client.token);
  expect(ownerPage.pendingBids).toHaveLength(1); expect(ownerPage.postedCount).toBe(52); expect(ownerPage.activeGigsCount).toBe(26); expect(ownerPage.bidsReceivedCount).toBe(52);
  expect(ownerPage.pagination.projects.pages).toBe(3); expect((await json(request,"get","/payments?limit=1",client.token)).stats.lockedAmount).toBe(260);
  for(const [role,account] of [["client",client],["student",student]]) {
    const context=await browser.newContext(); await context.addInitScript(token=>localStorage.setItem("token",token),account.token); const page=await context.newPage(); await page.goto(`/${role}`);
    if(role==="client") await expect(page.getByText("26 awaiting response",{exact:true})).toBeVisible();
    const label=role==="client"?"projects":"contracts", pages=role==="client"?3:2;
    for(let i=2;i<=pages;i++) { await page.getByRole("button",{name:`Next ${label}`,exact:true}).click(); await expect(page.getByText(`${label[0].toUpperCase()+label.slice(1)} page ${i} of ${pages}`,{exact:true})).toBeVisible(); }
    await expect(page.getByRole("heading",{name:role==="client"?"Volume active 0":"Volume client · Volume active 0",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Next proposals",exact:true}).click(); await expect(page.getByText("Proposals page 2 of "+(role==="client"?2:3),{exact:true})).toBeVisible();
    await context.close();
  }
  expect((await request.get(api+"/projects/student/dashboard?bidPage=0",{headers:{Authorization:`Bearer ${student.token}`}})).status()).toBe(400);
});

test("expired browser session returns to the intended brief after real sign-in", async ({ browser, request }) => {
  const suffix=Date.now();
  const client=await json(request,"post","/auth/register",null,{name:"Expiry client",email:`expiry-client-${suffix}@example.com`,password:"Synthetic123!",role:"client"});
  const email=`expiry-student-${suffix}@example.com`;
  const student=await json(request,"post","/auth/register",null,{name:"Expiry student",email,password:"Synthetic123!",role:"student"});
  const project=await json(request,"post","/projects",client.token,{title:`Session return ${suffix}`,description:"A public brief remains the intended destination after session expiry.",category:"Writing & Content",budget:100,deadline:"2027-12-31",milestones:[{title:"Delivery",amount:100}]});
  const expired=jwt.sign({id:student._id},serverEnv.JWT_SECRET,{expiresIn:-1});
  expect((await request.get(api+"/auth/me",{headers:{Authorization:`Bearer ${expired}`}})).status()).toBe(401);
  const context=await browser.newContext(); await context.addInitScript(token=>{if(!sessionStorage.getItem("expiry-initialized")){localStorage.setItem("token",token);sessionStorage.setItem("expiry-initialized","yes");}},expired);
  const page=await context.newPage(); await page.goto(`/project/${project._id}`);
  await page.locator("#login-email").fill(email); await page.locator("#login-password").fill("Synthetic123!"); await page.getByRole("button",{name:"Sign In",exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/project/${project._id}$`)); await expect(page.getByText(project.title,{exact:true}).first()).toBeVisible();
  await context.close();
});

test("mounted browse search, canonical brief retries, real ledger pages, clipboard errors and profile cancel",async({browser,request})=>{
  const suffix=Date.now();
  const client=await json(request,"post","/auth/register",null,{name:"Searchable Client",email:`searchable-${suffix}@example.com`,password:"Synthetic123!",role:"client"});
  const ownerContext=await browser.newContext(); await ownerContext.addInitScript(token=>localStorage.setItem("token",token),client.token);
  const owner=await ownerContext.newPage();
  const payload={title:`Rare ${suffix} Library Research Brief`,description:"Document the research process, source notes, acceptance criteria, and a practical handover.",category:"Writing & Editing",budget:1250,deadline:"2027-12-31",skillsRequired:["RarePracticalSkill"],clientRequestId:crypto.randomUUID(),milestones:[{title:"Research",amount:500},{title:"Final guide",amount:750}]};
  const published=await json(request,"post","/projects",client.token,payload);
  expect(published.category).toBe("Writing & Content");
  expect((await json(request,"post","/projects",client.token,payload))._id).toBe(published._id);
  const changed=await request.post(api+"/projects",{headers:{Authorization:`Bearer ${client.token}`},data:{...payload,title:`Changed ${suffix}`}}); expect(changed.status()).toBe(409);
  const past=await request.post(api+"/projects",{headers:{Authorization:`Bearer ${client.token}`},data:{...payload,clientRequestId:crypto.randomUUID(),skillsRequired:[],deadline:"2020-01-01"}}); expect(past.status()).toBe(400);
  for(const query of [`search=RarePracticalSkill`,`search=Searchable%20Client`,`skills=RarePracticalSkill`,`category=Writing%20%26%20Editing`]) {
    const response=await request.get(api+`/projects?status=OPEN&${query}`); expect(response.ok()).toBeTruthy(); expect((await response.json()).some(p=>p._id===published._id)).toBeTruthy();
  }
  await owner.goto("/browse"); const navSearch=owner.getByRole("textbox",{name:"Search project index"}); await navSearch.fill("RarePracticalSkill"); await navSearch.press("Enter");
  await expect(owner.getByText(published.title,{exact:true})).toBeVisible();
  await owner.goto("/profile"); await owner.getByRole("button",{name:"Edit profile",exact:true}).click(); await owner.locator("#profile-bio").fill("Unsaved text should be discarded."); await owner.getByRole("button",{name:"Cancel",exact:true}).click(); await expect(owner.getByText("No biography provided yet. Add your technical disciplines, coursework, and specialties.",{exact:true})).toBeVisible();
  const mongo=new mongoose.mongo.MongoClient(serverEnv.MONGODB_URI); await mongo.connect();
  try {
    const now=new Date(), rows=Array.from({length:26},(_,i)=>{const id=new mongoose.Types.ObjectId(); return {_id:id,projectId:new mongoose.Types.ObjectId(published._id),clientId:new mongoose.Types.ObjectId(client._id),studentId:new mongoose.Types.ObjectId(),amount:1,amountPaise:100,provider:"razorpay",status:"LOCKED",stripeSessionId:`order_fixture_${suffix}_${i}`,transactionRef:`TXN-fixture-${suffix}-${i}`,receiptRef:`TEST-RECEIPT-${id}`,createdAt:new Date(now.getTime()-i),updatedAt:now,sampleData:false};});
    await mongo.db().collection("paymentledgers").insertMany(rows);
    const first=await json(request,"get","/payments",client.token), second=await json(request,"get","/payments?page=2",client.token);
    expect(first.transactions).toHaveLength(25); expect(second.transactions).toHaveLength(1); expect(first.pagination.total).toBe(26);
    const refs=[...first.transactions,...second.transactions].map(t=>t.receiptRef); expect(new Set(refs).size).toBe(26); expect(refs.every(ref=>ref.startsWith("TEST-RECEIPT-"))).toBeTruthy();
  } finally { await mongo.close(); }
  await ownerContext.grantPermissions(["clipboard-read","clipboard-write"]); await owner.goto("/client"); await owner.getByRole("button",{name:"Funding ledger",exact:true}).click();
  await expect(owner.getByText("Test Funding Ledger",{exact:true})).toBeVisible();
  const receiptButton=owner.getByRole("button",{name:/Copy transaction reference TEST-RECEIPT-/}).first(); await receiptButton.click(); await expect(owner.getByText(/Copied internal test receipt:/)).toBeVisible();
  const failingContext=await browser.newContext(); await failingContext.addInitScript(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw new Error("denied");}}})); await failingContext.addInitScript(token=>localStorage.setItem("token",token),client.token);
  const failingPage=await failingContext.newPage(); await failingPage.goto("/client"); await failingPage.getByRole("button",{name:"Funding ledger",exact:true}).click(); await failingPage.getByRole("button",{name:/Copy transaction reference TEST-RECEIPT-/}).first().click(); await expect(failingPage.getByRole("alert")).toContainText("Clipboard access failed");
  await failingContext.close(); await ownerContext.close();
});

test("patched body parsers survive malformed compressed requests in the actual isolated backend",async({request})=>{
  for(const file of ["node_modules/body-parser/package.json","backend/node_modules/body-parser/package.json"]){const version=JSON.parse(fs.readFileSync(file,"utf8")).version.split(".").map(Number);expect(version[0]===1 && (version[1]>20 || version[1]===20 && version[2]>=9)).toBe(true);}
  const bodies=[Buffer.concat([zlib.gzipSync(Buffer.from('{"audit":true}')),Buffer.from([0]),Buffer.alloc(100*1024,0x58)]),Buffer.from("invalid gzip input"),zlib.gzipSync(Buffer.alloc(3*1024*1024,0x61))];
  for(const body of bodies) {
    await new Promise((resolve,reject)=>{const req=http.request({hostname:"127.0.0.1",port:5019,path:"/api/audit-no-such-route",method:"POST",headers:{"content-type":"application/json","content-encoding":"gzip","content-length":body.length}},res=>{res.resume();res.on("end",resolve);});req.on("error",reject);req.setTimeout(5000,()=>req.destroy(new Error("Compressed probe timed out")));req.end(body);});
    await expect.poll(async()=>(await request.get(api+"/health")).ok()).toBe(true);expect(apiProcess.exitCode).toBe(null);
  }
});
