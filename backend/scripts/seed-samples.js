import mongoose from "mongoose";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";
import { CATEGORIES } from "../../shared/categories.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { Contract } from "../models/Contract.js";
import { Milestone } from "../models/Milestone.js";
import { MilestoneSubmission } from "../models/MilestoneSubmission.js";
import { Review } from "../models/Review.js";
import { PaymentLedger } from "../models/PaymentLedger.js";

const id=key=>new mongoose.Types.ObjectId(crypto.createHash("sha256").update("bidhub-samples-v1/"+key).digest("hex").slice(0,24));
const topics=[
 ["Design a student society sign-up flow","Figma", "Map three sign-up tasks, produce accessible desktop/mobile screens, and hand over editable design files."],
 ["Build a community library directory","React", "Implement searchable listings and a responsive detail view, document setup, and cover the agreed acceptance cases."],
 ["Implement a volunteer scheduling API","Node.js", "Create validated roster and availability endpoints with ownership checks, API documentation, and integration tests."],
 ["Write a research-backed onboarding guide","Technical Writing", "Interview the sample audience, produce an outline and a sourced 1500-word guide, and deliver an editable draft."],
 ["Edit an accessible event introduction","Video Editing", "Prepare a 60-second introduction from supplied sample footage with captions, licensed audio notes, and an editable project."],
 ["Prepare a library poster kit","Typography", "Deliver two poster concepts and final print/web exports with typography, source files, and accessibility rationale."],
 ["Analyse a sample commuter survey","Data Analysis", "Clean the supplied synthetic CSV, document assumptions, reproduce three charts, and summarize limitations without identity claims."]
];
export async function seedSamples({uri=process.env.SEED_MONGODB_URI,password=process.env.SEED_PASSWORD}={}) {
  if(process.env.NODE_ENV==="production" || process.env.ALLOW_SAMPLE_SEED!=="yes" || !uri) throw new Error("Set ALLOW_SAMPLE_SEED=yes and SEED_MONGODB_URI for an explicit non-production seed.");
  const target=new URL(uri);
  if(!["localhost","127.0.0.1","[::1]"].includes(target.hostname) || !/^\/bidhub_(dev|test|samples|seed)[\w-]*$/.test(target.pathname)) throw new Error("Only a dedicated local bidhub_dev/test/samples/seed database is allowed; application/production databases are refused.");
  if(typeof password!=="string" || password.length<12) throw new Error("Supply a development-only SEED_PASSWORD of at least 12 characters.");
  await mongoose.connect(uri);
  try {
    await Promise.all(Object.values(mongoose.models).map(model=>model.init()));
    const passwordHash=await bcrypt.hash(password,10);
    const save=async(Model,key,data,session)=>{
      const existing=await Model.findById(id(key)).session(session);
      if(existing && (existing.sampleKey!==key || !existing.sampleData)) throw new Error("Seed identity collision; existing records were not changed.");
      await Model.updateOne({_id:id(key),sampleKey:key,sampleData:true},{$setOnInsert:{...data,_id:id(key),sampleData:true,sampleKey:key}},{upsert:true,runValidators:true,session});
    };
    for(const [c,category] of CATEGORIES.entries()) {
      await mongoose.connection.transaction(async session=>{
        for(const role of ["client","student"]) await save(User,`user/${c}/${role}`,{name:`Sample ${category} ${role}`,email:`sample-${c}-${role}@samples.invalid`,passwordHash,role,skills:[topics[c][1]],bio:"Sample development account. This is not a genuine marketplace participant.",rating:0,completedProjects:0,profileViews:0},session);
      });
      for(let n=0;n<10;n++) await mongoose.connection.transaction(async session=>{
        const key=`project/${c}/${n}`, projectId=id(key), clientId=id(`user/${c}/client`), studentId=id(`user/${c}/student`), bidId=id(key+"/bid");
        const phase=n%5, budget=2000+c*1000+n*500, totalPaise=budget*80;
        const schedule=[{milestoneId:id(key+"/m/0"),title:"Scope and first deliverable",amountPaise:totalPaise*0.4},{milestoneId:id(key+"/m/1"),title:"Final handover and acceptance evidence",amountPaise:totalPaise*0.6}];
        const status=phase===0?"OPEN":phase===1?"PENDING_FUNDING":phase===2?"ASSIGNED":phase===3?"IN_PROGRESS":"COMPLETED";
        const brief=`SAMPLE DATA. ${topics[c][2]} Variant ${n+1}: agree the audience, acceptance criteria, and one review round before starting. No gateway operation or genuine testimonial is represented.`;
        await save(Project,key,{title:`[Sample] ${topics[c][0]} ${n+1}`,description:brief,category,budget,deadline:new Date(Date.now()+(45+n)*86400000).toISOString().slice(0,10),skillsRequired:[topics[c][1]],remote:true,location:"Remote",level:n%2?"intermediate":"beginner",duration:`${2+n%3} weeks`,clientId,status,bidsCount:1,acceptedBidId:phase>=2?bidId:null,contractTotalPaise:phase?totalPaise:undefined},session);
        await save(Bid,key+"/bid",{projectId,studentId,amount:totalPaise/100,timeline:`${2+n%3} weeks`,proposal:`SAMPLE OFFER. ${topics[c][2]} I propose the visible two-checkpoint allocation with one revision round.`,status:phase>=2?"ACCEPTED":"PENDING",version:1,schedule},session);
        if(phase) await save(Contract,key+"/contract",{projectId,clientId,studentId,bidId,proposalVersion:1,totalPaise,timeline:`${2+n%3} weeks`,brief,proposal:"Sample agreed offer; no real gateway funding occurred.",schedule},session);
        for(let m=0;m<2;m++) {
          const milestoneId=schedule[m].milestoneId, submitted=phase===4 || (phase===3 && m===0), submissionId=id(key+`/submission/${m}`);
          await save(Milestone,key+`/m/${m}`,{projectId,title:schedule[m].title,amount:phase?schedule[m].amountPaise/100:budget*(m?0.6:0.4),status:phase===4?"APPROVED":submitted?"CHANGES_REQUESTED":"PENDING",activeSubmissionId:submitted?submissionId:undefined},session);
          if(submitted) await save(MilestoneSubmission,key+`/submission/${m}`,{milestoneId,submittedBy:studentId,version:1,description:`Sample evidence: ${topics[c][2]} Checkpoint ${m+1}.`,status:phase===4?"APPROVED":"CHANGES_REQUESTED",reviewComment:phase===3?"Sample feedback: clarify the documented acceptance evidence.":""},session);
          if(phase>=2) await save(PaymentLedger,key+`/allocation/${m}`,{projectId,milestoneId,clientId,studentId,bidId,amount:schedule[m].amountPaise/100,amountPaise:schedule[m].amountPaise,provider:"sample",status:"LOCKED",stripeSessionId:`sample_no_gateway_${projectId}`},session);
        }
        if(phase===4) for(const [reviewerId,revieweeId,role] of [[clientId,studentId,"client"],[studentId,clientId,"student"]]) await save(Review,key+`/review/${role}`,{projectId,reviewerId,revieweeId,rating:4,comment:"Sample review of this illustrative completed contract. Excluded from genuine reputation and testimonials."},session);
      });
    }
    return {categories:CATEGORIES.length,projects:await Project.countDocuments({sampleData:true}),sample:true,message:"Additive sample seed complete. No existing records deleted; no gateway actions performed."};
  } finally {await mongoose.disconnect();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) seedSamples().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
