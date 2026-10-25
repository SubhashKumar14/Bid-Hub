import { httpErrorStatus } from "../lib/validation.js";
import { CATEGORIES, canonicalCategory } from "../../shared/categories.js";
import { publishFingerprint } from "../lib/publish-identity.js";
import { verifiedReviews } from "../services/reputation.js";
import { isOperator, resolveRecovery } from "../services/recovery.js";
import { validateAttachments } from "../lib/attachments.js";
import { Contract } from "../models/Contract.js";
import { RecoveryCase } from "../models/RecoveryCase.js";
import { Clarification } from "../models/Clarification.js";
import mongoose from "mongoose";
import express from "express";
import { createRouter } from "../lib/router.js";
import { Project } from "../models/Project.js";
import { Milestone } from "../models/Milestone.js";
import { Bid } from "../models/Bid.js";
import { Activity } from "../models/Activity.js";
import { User } from "../models/User.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { protect, requireRole } from "../middleware/auth.js";
import { boundedInteger, amountToPaise } from "../lib/validation.js";

const router = createRouter();
router.get("/:id/recovery", protect, async (req,res)=>{
  const record=await RecoveryCase.findOne({projectId:req.params.id});
  const contract=await Contract.findOne({projectId:req.params.id});
  if(!record || (!isOperator(req.user._id) && ![contract?.clientId,contract?.studentId].some(id=>String(id)===String(req.user._id)))) return res.status(404).json({message:"Recovery case unavailable."});
  res.json(record);
});
router.patch("/:id/recovery/:caseId",protect,async(req,res)=>{
  const result=await resolveRecovery(req.params.id,req.params.caseId,req.user._id,req.body);
  res.json({...result,message:result.replayed?"This request was applied previously. The current project and case state are returned.":req.body.action==="RESUME"?"Work resumed. Financial records are unchanged.":"Work terminated; evidence retained. No refund or payout was made."});
});

const clarificationAccess = async req => {
  const project = await Project.findById(req.params.id);
  const participant = project && await Contract.exists({ projectId: project._id, studentId: req.user._id });
  if (!project || (String(project.clientId) !== String(req.user._id) && !participant && !(project.status === "OPEN" && req.user.role === "student"))) throw Object.assign(new Error("Clarifications are available to the owner, agreed participant and prospective students on open briefs."), { status: 403 });
  return project;
};
router.get("/:id/clarifications", protect, async (req, res) => {
  await clarificationAccess(req);
  const before = req.query.before;
  if (before !== undefined && (typeof before !== "string" || !/^[a-f\d]{24}$/i.test(before))) return res.status(400).json({ message: "Invalid clarification cursor." });
  const rows = await Clarification.find({ projectId: req.params.id, ...(before ? { _id: { $lt: before } } : {}) }).sort({ _id: -1 }).limit(26).populate("authorId", "name role");
  const page = rows.slice(0, 25);
  res.setHeader("X-Next-Cursor", rows.length > 25 ? String(page.at(-1)._id) : "");
  res.json(page);
});
router.post("/:id/clarifications", protect, async (req, res) => {
  const project = await clarificationAccess(req);
  if (project.status !== "OPEN") return res.status(409).json({ message: "The brief discussion is retained read-only after agreement. Use contract discussion for ongoing work." });
  if (typeof req.body.content !== "string" || !req.body.content.trim() || req.body.content.length > 2000) return res.status(400).json({ message: "Clarification must contain 1 to 2000 characters." });
  const record = await Clarification.create({ projectId: req.params.id, authorId: req.user._id, content: req.body.content.trim() });
  res.status(201).json(record);
});

router.get("/:id/contract", protect, async (req, res) => {
  const contract = await Contract.findOne({ projectId: req.params.id, $or: [{ clientId: req.user._id }, { studentId: req.user._id }] });
  if (!contract) return res.status(404).json({ message: "Agreed contract unavailable." });
  res.json(contract);
});

router.post("/:id/recovery", protect, async (req, res) => {
  if (typeof req.body.reason !== "string" || req.body.reason.trim().length < 10 || req.body.reason.length > 5000) return res.status(400).json({ message: "Describe the problem in 10 to 5000 characters." });
  const recovery = await mongoose.connection.transaction(async session => {
    const project = await Project.findOne({ _id: req.params.id, status: { $in: ["PENDING_FUNDING", "ASSIGNED", "IN_PROGRESS"] } }).session(session);
    const contract = project && await Contract.findOne({ projectId: project._id }).session(session);
    if (!contract || ![contract.clientId, contract.studentId].some(id => String(id) === String(req.user._id))) throw Object.assign(new Error("Only contract participants may request recovery."), { status: 403 });
    const prior = await RecoveryCase.findOne({ projectId: project._id }).session(session);
    if (prior?.state === "OPERATOR_REVIEW") return prior;
    project.recoveryPending = true;
    await project.save({ session });
    if(prior) { prior.state="OPERATOR_REVIEW"; prior.reason=req.body.reason.trim(); prior.requestedBy=req.user._id; prior.version=(prior.version || 1)+1; await prior.save({session}); return prior; }
    const [record] = await RecoveryCase.create([{ projectId: project._id, requestedBy: req.user._id, reason: req.body.reason.trim() }], { session });
    return record;
  });
  res.json({ recovery, message: "Recovery requested. Work is paused for operator review. No refund or payout was initiated." });
});

// Helper: escape special regex characters to prevent ReDoS
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseAmount = (val) => {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const cleaned = val.toString().replace(/[₹$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};


// @desc    Get all projects with search & filter
// @route   GET /api/projects
// @access  Public
router.get("/", async (req, res) => {
  const { search, category, status, skills, location, sort } = req.query;
  const page = boundedInteger(req.query.page, 1, 10000), limit = boundedInteger(req.query.limit, 50, 100);
  if (page === null || limit === null) return res.status(400).json({ message: "Invalid project pagination." });
  if ([search, category, status, skills, location, sort].some(value => value !== undefined && (typeof value !== "string" || value.length > 1000))) {
    return res.status(400).json({ message: "Search and filter values must be bounded strings." });
  }

  let query = {};
  if (location === "remote") query.$and = [{ $or: [{ remote: true }, { remote: null, location: /remote/i }] }];
  else if (location === "onsite") query.$and = [{ $or: [{ remote: false }, { remote: null, location: { $exists: true, $nin: ["", null], $not: /remote/i } }] }];
  else if (location && location !== "all") return res.status(400).json({ message: "Unknown location filter." });
  const orders = new Map([["newest", { createdAt: -1, _id: -1 }], ["budget-desc", { budget: -1, _id: -1 }], ["budget-asc", { budget: 1, _id: -1 }], ["proposals", { bidsCount: -1, _id: -1 }]]);
  const order = orders.get(sort || "newest");
  if (!order) return res.status(400).json({ message: "Unknown sorting rule." });

  if (category && category !== "All") {
    query.category = canonicalCategory(category);
  }

  if (status) {
    query.status = status;
  }

  if (search) {
    const safeSearch = escapeRegex(search.trim().slice(0, 100)); // cap at 100 chars
    query.$or = [
      { title: { $regex: safeSearch, $options: "i" } },
      { description: { $regex: safeSearch, $options: "i" } },
      { skillsRequired: { $regex: safeSearch, $options: "i" } },
      { clientId: { $in: await User.find({ name: { $regex: safeSearch, $options: "i" }, role: "client" }).distinct("_id") } },
    ];
  }

  if (skills) {
    const skillsArray = skills.split(",").map((s) => s.trim()).filter(Boolean);
    query.skillsRequired = { $in: skillsArray };
  }

  try {
    const projects = await Project.find(query)
      .populate("clientId", "name avatarUrl college")
      .sort(order).skip((page - 1) * limit).limit(limit);
    res.setHeader("X-Total-Count", String(await Project.countDocuments(query)));
    res.json(projects);
  } catch (error) {
    console.error("Get projects error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Failed to load projects. Please try again." });
  }
});

// @desc    Get student dashboard projects and bids
// @route   GET /api/projects/student/dashboard
// @access  Private (Student only)
router.get("/student/dashboard", protect, requireRole("student"), async (req, res) => {
  const bidPage = boundedInteger(req.query.bidPage, 1, 10000), contractPage = boundedInteger(req.query.contractPage, 1, 10000), limit = 25;
  if (bidPage === null || contractPage === null) return res.status(400).json({ message: "Invalid dashboard pagination." });
  try {
    // 1. Find all bids by this student
    const studentBids = await Bid.find({ studentId: req.user._id })
      .populate("projectId", "title category budget status deadline clientId")
      .sort({ createdAt: -1, _id: -1 }).skip((bidPage - 1) * limit).limit(limit);

    // 2. Filter projects where student is accepted
    const acceptedProjectIds = await Bid.find({ studentId: req.user._id, status: "ACCEPTED" }).distinct("projectId");

    // 3. Fetch these projects populated with milestones and client details
    const activeProjects = await Project.find({ _id: { $in: acceptedProjectIds } })
      .populate("clientId", "name avatarUrl college")
      .sort({ createdAt: -1, _id: -1 }).skip((contractPage - 1) * limit).limit(limit);

    // Fetch milestones for all active projects
    const milestones = await Milestone.find({ projectId: { $in: activeProjects.map(p => p._id) } });

    // Fetch pending checkout ledgers involving this student
    const pendingLedgers = await PaymentLedger.find({
      studentId: req.user._id,
      projectId: { $in: studentBids.map(b => b.projectId?._id ?? b.projectId).filter(Boolean) },
      status: "PENDING_CHECKOUT"
    });
    const bidTotal = await Bid.countDocuments({ studentId: req.user._id });
    const contractTotal = await Project.countDocuments({ _id: { $in: acceptedProjectIds } });
    const activeContractsCount = await Project.countDocuments({ _id: { $in: acceptedProjectIds }, status: { $in: ["ASSIGNED", "IN_PROGRESS"] } });
    const pendingCount = await Bid.aggregate([{ $match: { studentId: req.user._id, status: "PENDING" } }, { $lookup: { from: "projects", localField: "projectId", foreignField: "_id", as: "project" } }, { $match: { "project.status": "OPEN" } }, { $count: "total" }]);

    // Map milestones to their respective projects
    const projectsWithMilestones = activeProjects.map(proj => {
      const projMilestones = milestones.filter(m => m.projectId.toString() === proj._id.toString());
      return {
        project: proj,
        milestones: projMilestones
      };
    });

    res.json({
      stats: { activeContractsCount, openBidsCount: pendingCount[0]?.total || 0 },
      pagination: { bids: { page: bidPage, pages: Math.max(1, Math.ceil(bidTotal / limit)), total: bidTotal }, contracts: { page: contractPage, pages: Math.max(1, Math.ceil(contractTotal / limit)), total: contractTotal } },
      bids: studentBids.map(b => {
        const projectId = b.projectId?._id ?? b.projectId;
        const isPendingEscrow = projectId != null && pendingLedgers.some(l =>
          String(l.projectId) === String(projectId)
        );
        return {
          id: b._id,
          projectId,
          title: b.projectId?.title || "Deleted Project",
          amount: b.amount,
          timeline: b.timeline,
          status: b.projectId?.status === "CANCELLED" ? "project cancelled" : isPendingEscrow ? "agreed (funding pending)" : b.status.toLowerCase(),
        };
      }),
      contracts: projectsWithMilestones.map(item => {
        const p = item.project;
        const ms = item.milestones;
        const totalAmount = ms.reduce((n,m) => n + m.amount, 0);
        const progress = totalAmount > 0 ? Math.round(ms.filter(m => ["RELEASED", "APPROVED"].includes(m.status)).reduce((n,m) => n + m.amount, 0) / totalAmount * 100) : 0;
        const inReview = ms.some(m => m.status === "SUBMITTED");

        return {
          id: p._id,
          title: `${p.clientId?.name || "Client"} · ${p.title}`,
          statusText: p.recoveryPending ? "Paused for recovery" : p.status === "CANCELLED" ? "Cancelled; history retained" : p.status === "COMPLETED" ? "Completed" : inReview ? "Milestone in review" : "Active work",
          amount: p.contractTotalPaise != null ? p.contractTotalPaise / 100 : totalAmount || null,
          progress,
          status: p.status === "COMPLETED" ? "completed" : inReview ? "in-review" : "active",
          projectStatus: p.status,
          recoveryPending: p.recoveryPending,
          milestones: ms
        };
      })
    });
  } catch (error) {
    console.error("Student dashboard projects error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Failed to load dashboard data." });
  }
});

// @desc    Get client dashboard projects, bids and milestones
// @route   GET /api/projects/client/dashboard
// @access  Private (Client only)
router.get("/client/dashboard", protect, requireRole("client"), async (req, res) => {
  const projectPage = boundedInteger(req.query.projectPage, 1, 10000), bidPage = boundedInteger(req.query.bidPage, 1, 10000), limit = 25;
  if (projectPage === null || bidPage === null) return res.status(400).json({ message: "Invalid dashboard pagination." });
  try {
    // 1. Fetch all projects posted by this client
    const myProjects = await Project.find({ clientId: req.user._id })
      .populate("clientId", "name avatarUrl college")
      .sort({ createdAt: -1, _id: -1 }).skip((projectPage - 1) * limit).limit(limit);

    const projectIds = myProjects.map(p => p._id);

    // 2. Fetch all milestones for these projects
    const milestones = await Milestone.find({ projectId: { $in: projectIds } });

    // 3. Fetch all bids for these projects if status is OPEN
    const allProjectIds = await Project.find({ clientId: req.user._id }).distinct("_id");
    const openProjectIds = await Project.find({ clientId: req.user._id, status: "OPEN" }).distinct("_id");
    const pendingFilter = { projectId: { $in: openProjectIds }, status: "PENDING" };
    const bids = await Bid.find(pendingFilter)
      .populate("studentId", "name avatarUrl college skills").populate("projectId", "title")
      .sort({ createdAt: -1, _id: -1 }).skip((bidPage - 1) * limit).limit(limit);
    const pendingTotal = await Bid.countDocuments(pendingFilter);

    // Format milestones to approve and active projects
    const milestonesToApprove = [];
    const activeProjects = [];
    const bidsReceivedCount = await Bid.countDocuments({ projectId: { $in: allProjectIds } });
    const activeGigsCount = await Project.countDocuments({ clientId: req.user._id, status: { $in: ["ASSIGNED", "IN_PROGRESS"] } });

    myProjects.forEach(p => {
      const ms = milestones.filter(m => m.projectId.toString() === p._id.toString());

      if (["ASSIGNED", "IN_PROGRESS"].includes(p.status)) {
        const totalAmount = ms.reduce((n,m) => n + m.amount, 0);
        const progress = totalAmount > 0 ? Math.round(ms.filter(m => ["RELEASED", "APPROVED"].includes(m.status)).reduce((n,m) => n + m.amount, 0) / totalAmount * 100) : 0;

        activeProjects.push({
          id: p._id,
          title: p.title,
          statusText: p.status === "PENDING_FUNDING" ? "Escrow Pending" : p.status === "ASSIGNED" ? "Hired / Kickoff" : p.status === "IN_PROGRESS" ? "Development" : "Completed",
          budget: p.contractTotalPaise != null ? p.contractTotalPaise / 100 : totalAmount || null,
          progress,
          status: p.status,
        });

        ms.forEach(m => {
          if (m.status === "SUBMITTED") {
            milestonesToApprove.push({
              id: m._id,
              title: `${p.title} · ${m.title}`,
              amount: m.amount,
            });
          }
        });
      }
    });

    // Format pending bids
    const pendingBids = bids
      .filter(b => b.status === "PENDING")
      .map(b => ({
        id: b._id,
        projectId: b.projectId?._id || b.projectId,
        studentName: b.studentId?.name || "Student",
        projectTitle: b.projectId?.title || "Project",
        amount: b.amount,
        timeline: b.timeline,
        proposal: b.proposal,
        schedule: b.schedule,
        version: b.version,
      }));

    res.json({
      postedCount: allProjectIds.length,
      pagination: { projects: { page: projectPage, pages: Math.max(1, Math.ceil(allProjectIds.length / limit)), total: allProjectIds.length }, bids: { page: bidPage, pages: Math.max(1, Math.ceil(pendingTotal / limit)), total: pendingTotal } },
      bidsReceivedCount,
      activeGigsCount,
      pendingBids,
      milestonesToApprove,
      activeProjects,
      openProjects: myProjects.filter(p => p.status === "OPEN"),
      cancelledProjects: myProjects.filter(p => p.status === "CANCELLED"),
      awaitingFunding: myProjects.filter(p => p.status === "PENDING_FUNDING"),
      completedProjects: myProjects.filter(p => p.status === "COMPLETED"),
    });
  } catch (error) {
    console.error("Client dashboard projects error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Failed to load dashboard data." });
  }
});

// @desc    Get public stats for the landing page
// @route   GET /api/projects/public/stats
// @access  Public
router.get("/public/stats", async (req, res) => {
  try {
    const studentsCount = await User.countDocuments({ role: "student", sampleData: { $ne: true } });
    const clientsCount = await User.countDocuments({ role: "client", sampleData: { $ne: true } });
    const projectsCount = await Project.countDocuments({ status: "OPEN", sampleData: { $ne: true } });
    const completedCount = await Project.countDocuments({ status: "COMPLETED", sampleData: { $ne: true } });

    // Calculate total escrow: Sum of amounts in ledger
    const ledgers = await PaymentLedger.find({ provider:"razorpay", sampleData: { $ne: true }, milestoneId: { $ne: null }, status: "LOCKED" });
    const totalEscrow = ledgers.reduce((acc, curr) => acc + (curr.amount || 0), 0);

    res.json({
      studentsCount,
      clientsCount,
      projectsCount,
      completedCount,
      totalEscrow,
    });
  } catch (error) {
    console.error("Get public stats error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Failed to load stats." });
  }
});

// @desc    Recover pending checkout details for the owning client only
// @route   GET /api/projects/:id/checkout
// @access  Private (Client owner only)
router.get("/:id/checkout", protect, requireRole("client"), async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, clientId: req.user._id });
    if (!project) return res.status(404).json({ message: "Project not found." });

    const ledger = project.status === "PENDING_FUNDING"
      ? await PaymentLedger.findOne({
          projectId: project._id,
          clientId: req.user._id,
          milestoneId: null,
          status: "PENDING_CHECKOUT",
        }).select("stripeSessionId studentId amount -_id")
      : null;

    // Explicit response allowlist: never return the underlying payment document.
    res.json({ pendingPayment: ledger ? {
      stripeSessionId: ledger.stripeSessionId,
      studentId: ledger.studentId,
      amount: ledger.amount,
    } : null });
  } catch (error) {
    console.error("Get checkout error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Failed to load checkout details." });
  }
});

// @desc    Get single project details
// @route   GET /api/projects/:id
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate(
      "clientId",
      "name avatarUrl rating completedProjects college"
    );
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    // Find milestones for this project
    const milestones = await Milestone.find({ projectId: project._id });
    if(project.clientId) {
      const reviews=await verifiedReviews({revieweeId:project.clientId._id});
      project.clientId.rating=reviews.length?reviews.reduce((n,r)=>n+r.rating,0)/reviews.length:0;
      project.clientId.completedProjects=await Project.countDocuments({clientId:project.clientId._id,status:"COMPLETED",sampleData:{$ne:true}});
    }

    res.json({ project, milestones });
  } catch (error) {
    console.error("Get project error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Failed to load project details. Please try again." });
  }
});

// @desc    Create a new project
// @route   POST /api/projects
// @access  Private (Client only)
router.post("/", protect, requireRole("client"), async (req, res) => {
  const { title, description, category, budget, deadline, skillsRequired, milestones, files, fileManifest, importSource, importRevision, remote, location, level, duration, clientRequestId } = req.body;

  if (!title || !description || !category || !budget || !deadline) {
    return res.status(400).json({ message: "Please fill in all required fields: title, description, category, budget, deadline." });
  }

  try {
    if ([title, description, category, deadline].some(v => typeof v !== "string" || !v.trim() || v.length > 10000)) return res.status(400).json({ message: "Project fields must be bounded strings." });
    try {
      amountToPaise(budget);
      if (!Array.isArray(milestones) || !milestones.length || milestones.length > 50) throw new Error();
      for (const m of milestones) {
        if (!m || typeof m.title !== "string" || !m.title.trim()) throw new Error();
        amountToPaise(m.amount);
        if(m.dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(m.dueDate) || !Number.isFinite(Date.parse(m.dueDate)) || new Date(m.dueDate).toISOString().slice(0,10)!==m.dueDate || m.dueDate<=new Date().toISOString().slice(0,10) || m.dueDate>deadline)) throw new Error();
      }
    } catch { return res.status(400).json({ message: "Positive budget and 1 to 50 valid milestone amounts are required." }); }
    const normalizedCategory = canonicalCategory(category);
    const fingerprint = publishFingerprint({...req.body, category: normalizedCategory});
    if (clientRequestId) { const prior = await Project.findOne({ clientId: req.user._id, clientRequestId }); if (prior) return prior.publishFingerprint === fingerprint ? res.json(prior) : res.status(409).json({ message: "This publish identity belongs to different content. Review the saved brief before publishing a new project." }); }
    if (clientRequestId !== undefined && (typeof clientRequestId !== "string" || !/^[\w-]{8,100}$/.test(clientRequestId))) return res.status(400).json({ message: "Invalid publish request identity." });
    await validateAttachments(files || [], req.user._id);
    if ((fileManifest !== undefined && (!Array.isArray(fileManifest) || fileManifest.length > 1000 || fileManifest.some(f => !f || typeof f.path !== "string" || f.path.length > 1000 || !Number.isSafeInteger(f.size) || f.size < 0))) || (importRevision && !/^[a-f0-9]{40}$/.test(importRevision))) return res.status(400).json({ message: "Invalid source manifest or revision." });
    if (skillsRequired !== undefined && (!Array.isArray(skillsRequired) || skillsRequired.length > 30 || skillsRequired.some(s => typeof s !== "string" || !s.trim() || s.length > 80))) return res.status(400).json({ message: "Invalid skills." });
    if (level && !["beginner", "intermediate", "advanced", "expert", "any"].includes(level)) return res.status(400).json({ message: "Invalid experience level." });
    if (!Number.isFinite(Date.parse(deadline)) || new Date(deadline).toISOString().slice(0, 10) !== deadline) return res.status(400).json({ message: "Use a valid delivery date (YYYY-MM-DD)." });
    if (deadline <= new Date().toISOString().slice(0,10)) return res.status(400).json({ message: "Choose a future delivery date." });
    if (!CATEGORIES.includes(normalizedCategory)) return res.status(400).json({ message: "Choose a supported project category." });
    if (!Array.isArray(skillsRequired) || !skillsRequired.length || description.trim().length < 20) return res.status(400).json({ message: "Describe the scope in at least 20 characters and provide at least one required skill." });
    if (milestones.reduce((sum, m) => sum + amountToPaise(m.amount), 0) !== amountToPaise(budget)) return res.status(400).json({ message: "Advertised milestone amounts must equal the advertised budget." });
    if ((remote !== undefined && typeof remote !== "boolean") || [location, level, duration].some(v => v !== undefined && (typeof v !== "string" || v.length > 200)) || !/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !Number.isFinite(Date.parse(deadline))) return res.status(400).json({ message: "Invalid project location, level, duration or delivery deadline." });
    const project = await mongoose.connection.transaction(async session => {
    const [project] = await Project.create([{
      remote, location, level, duration, clientRequestId, publishFingerprint: fingerprint,
      title: title.trim(),
      description: description.trim(),
      category: normalizedCategory,
      budget: parseAmount(budget),
      deadline,
      skillsRequired: skillsRequired || [],
      clientId: req.user._id,
      status: "OPEN",
      files: files || [],
      fileManifest: fileManifest || [],
      importSource: importSource || "",
      importRevision: importRevision || "",
    }], { session });

    // Create milestones if provided
    if (milestones && milestones.length > 0) {
      const milestoneDocs = milestones.map((m) => ({
        projectId: project._id,
        title: m.title,
        amount: parseAmount(m.amount),
        dueDate: m.dueDate || "",
        status: "PENDING",
      }));
      await Milestone.insertMany(milestoneDocs, { session });
    }

    // Log Activity
    await Activity.create([{
      actorId: req.user._id,
      type: "PROJECT_POSTED",
      message: `${req.user.name} posted a new brief: "${title}"`,
      targetId: project._id,
    }], { session });

      return project;
    });

    res.status(201).json(project);
  } catch (error) {
    console.error("Create project error:", error);
    if (error.code === 11000 && clientRequestId) { const prior = await Project.findOne({ clientId: req.user._id, clientRequestId }); if (prior) return prior.publishFingerprint === publishFingerprint({...req.body,category:canonicalCategory(req.body.category)}) ? res.json(prior) : res.status(409).json({ message: "Publish identity conflicts with saved content. Refresh before retrying." }); }
    res.status(httpErrorStatus(error)).json({ message: "Failed to create project. Please try again." });
  }
});

// @desc    Update project
// @route   PATCH /api/projects/:id
// @access  Private (Client only)
router.patch("/:id", protect, requireRole("client"), async (req, res) => {
  const updated = await mongoose.connection.transaction(async session => {
    const project = await Project.findOne({ _id: req.params.id, clientId: req.user._id }).session(session);
    if (!project) throw Object.assign(new Error("Owned project not found."), { status: 404 });
    const scopeFields = ["title", "description", "category", "skillsRequired", "budget", "deadline", "remote", "location", "level", "duration"];
    const editing = scopeFields.some(field => req.body[field] !== undefined);
    if (editing && (project.status !== "OPEN" || await Bid.exists({ projectId: project._id }).session(session))) throw Object.assign(new Error("Scope cannot change after proposals. Clarify the brief or publish a new project; existing offers retain their context."), { status: 409 });
    for (const field of ["title", "description", "deadline", "location", "level", "duration"]) {
      if (req.body[field] !== undefined) {
        if (typeof req.body[field] !== "string" || req.body[field].length > (field === "description" ? 10000 : 200)) throw Object.assign(new Error("Invalid project field."), { status: 400 });
        project[field] = req.body[field].trim();
      }
    }
    if(req.body.category!==undefined) { const normalized=canonicalCategory(req.body.category); if(typeof normalized!=="string" || !CATEGORIES.includes(normalized)) throw Object.assign(new Error("Choose a supported project category."),{status:400}); project.category=normalized; }
    if(req.body.skillsRequired!==undefined) { if(!Array.isArray(req.body.skillsRequired) || !req.body.skillsRequired.length || req.body.skillsRequired.length>30 || req.body.skillsRequired.some(s=>typeof s!=="string" || !s.trim() || s.length>80)) throw Object.assign(new Error("At least one valid required skill is needed."),{status:400}); project.skillsRequired=req.body.skillsRequired.map(s=>s.trim()); }
    if (req.body.remote !== undefined) {
      if (typeof req.body.remote !== "boolean") throw Object.assign(new Error("Location mode must be a boolean."), { status: 400 });
      project.remote = req.body.remote;
    }
    if (req.body.deadline !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(project.deadline) || !Number.isFinite(Date.parse(project.deadline)) || new Date(project.deadline).toISOString().slice(0,10) !== project.deadline)) throw Object.assign(new Error("Invalid delivery deadline."), { status: 400 });
    if (req.body.budget !== undefined) {
      const total = amountToPaise(req.body.budget);
      const milestones = await Milestone.find({ projectId: project._id }).session(session);
      if (milestones.reduce((n,m)=>n+amountToPaise(m.amount),0) !== total) throw Object.assign(new Error("Advertised budget must equal the posted schedule."), { status: 400 });
      project.budget = total / 100;
    }
    if (req.body.status !== undefined) {
      const allowed = { OPEN: ["CANCELLED"], ASSIGNED: ["IN_PROGRESS"] };
      if (!allowed[project.status]?.includes(req.body.status)) throw Object.assign(new Error("This state transition requires the funding, approval or operator recovery workflow."), { status: 409 });
      project.status = req.body.status;
    }
    await project.save({ session });
    return project;
  });
  res.json(updated);
});

// @desc    Delete project
// @route   DELETE /api/projects/:id
// @access  Private (Client only)
router.delete("/:id", protect, requireRole("client"), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    if (project.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to delete this project." });
    }

    if (project.status === "CANCELLED") return res.json({ message: "Project already cancelled; history retained." });

    if (project.status !== "OPEN") {
      return res.status(400).json({ message: "Only open projects can be deleted. This project is already active or completed." });
    }

    const changed = await Project.updateOne({ _id: project._id, clientId: req.user._id, status: "OPEN" }, { status: "CANCELLED" });
    if (changed.modifiedCount !== 1) return res.status(409).json({ message: "Project state changed." });

    res.json({ message: "Project removed successfully." });
  } catch (error) {
    console.error("Delete project error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Failed to delete project. Please try again." });
  }
});

export default router;
