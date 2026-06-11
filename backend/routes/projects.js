import express from "express";
import { Project } from "../models/Project.js";
import { Milestone } from "../models/Milestone.js";
import { Bid } from "../models/Bid.js";
import { Activity } from "../models/Activity.js";
import { User } from "../models/User.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router();

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
  const { search, category, status, skills } = req.query;

  let query = {};

  if (category && category !== "All") {
    query.category = category;
  }

  if (status) {
    query.status = status;
  }

  if (search) {
    const safeSearch = escapeRegex(search.trim().slice(0, 100)); // cap at 100 chars
    query.$or = [
      { title: { $regex: safeSearch, $options: "i" } },
      { description: { $regex: safeSearch, $options: "i" } },
    ];
  }

  if (skills) {
    const skillsArray = skills.split(",").map((s) => s.trim()).filter(Boolean);
    query.skillsRequired = { $in: skillsArray };
  }

  try {
    const projects = await Project.find(query)
      .populate("clientId", "name avatarUrl rating completedProjects")
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    console.error("Get projects error:", error);
    res.status(500).json({ message: "Failed to load projects. Please try again." });
  }
});

// @desc    Get student dashboard projects and bids
// @route   GET /api/projects/student/dashboard
// @access  Private (Student only)
router.get("/student/dashboard", protect, requireRole("student"), async (req, res) => {
  try {
    // 1. Find all bids by this student
    const studentBids = await Bid.find({ studentId: req.user._id })
      .populate("projectId", "title category budget status deadline clientId")
      .sort({ createdAt: -1 });

    // 2. Filter projects where student is accepted
    const acceptedProjectIds = studentBids
      .filter(b => b.status === "ACCEPTED" && b.projectId)
      .map(b => b.projectId._id || b.projectId);

    // 3. Fetch these projects populated with milestones and client details
    const activeProjects = await Project.find({ _id: { $in: acceptedProjectIds } })
      .populate("clientId", "name avatarUrl rating completedProjects college");

    // Fetch milestones for all active projects
    const milestones = await Milestone.find({ projectId: { $in: acceptedProjectIds } });

    // Map milestones to their respective projects
    const projectsWithMilestones = activeProjects.map(proj => {
      const projMilestones = milestones.filter(m => m.projectId.toString() === proj._id.toString());
      return {
        project: proj,
        milestones: projMilestones
      };
    });

    res.json({
      bids: studentBids.map(b => ({
        id: b._id,
        projectId: b.projectId?._id || b.projectId,
        title: b.projectId?.title || "Deleted Project",
        amount: b.amount,
        status: b.status.toLowerCase(),
      })),
      contracts: projectsWithMilestones.map(item => {
        const p = item.project;
        const ms = item.milestones;
        const releasedCount = ms.filter(m => m.status === "RELEASED").length;
        const progress = ms.length > 0 ? Math.round((releasedCount / ms.length) * 100) : 0;
        const inReview = ms.some(m => m.status === "SUBMITTED");

        return {
          id: p._id,
          title: `${p.clientId?.name || "Client"} · ${p.title}`,
          statusText: inReview ? "Hi-fi / milestone in review" : "Sprint active",
          amount: p.budget,
          progress,
          status: inReview ? "in-review" : "active",
          projectStatus: p.status,
          milestones: ms
        };
      })
    });
  } catch (error) {
    console.error("Student dashboard projects error:", error);
    res.status(500).json({ message: "Failed to load dashboard data." });
  }
});

// @desc    Get client dashboard projects, bids and milestones
// @route   GET /api/projects/client/dashboard
// @access  Private (Client only)
router.get("/client/dashboard", protect, requireRole("client"), async (req, res) => {
  try {
    // 1. Fetch all projects posted by this client
    const myProjects = await Project.find({ clientId: req.user._id })
      .populate("clientId", "name avatarUrl rating completedProjects college")
      .sort({ createdAt: -1 });

    const projectIds = myProjects.map(p => p._id);

    // 2. Fetch all milestones for these projects
    const milestones = await Milestone.find({ projectId: { $in: projectIds } });

    // 3. Fetch all bids for these projects if status is OPEN
    const openProjectIds = myProjects.filter(p => p.status === "OPEN").map(p => p._id);
    const bids = await Bid.find({ projectId: { $in: openProjectIds } })
      .populate("studentId", "name avatarUrl rating completedProjects college skills");

    // Format milestones to approve and active projects
    const milestonesToApprove = [];
    const activeProjects = [];
    let bidsReceivedCount = 0;
    let activeGigsCount = 0;

    myProjects.forEach(p => {
      bidsReceivedCount += p.bidsCount || 0;
      const ms = milestones.filter(m => m.projectId.toString() === p._id.toString());

      if (p.status !== "OPEN" && p.status !== "CANCELLED") {
        activeGigsCount++;
        const releasedCount = ms.filter(m => m.status === "RELEASED").length;
        const progress = ms.length > 0 ? Math.round((releasedCount / ms.length) * 100) : 0;

        activeProjects.push({
          id: p._id,
          title: p.title,
          statusText: p.status === "ASSIGNED" ? "Hired / Kickoff" : p.status === "IN_PROGRESS" ? "Development" : "Completed",
          budget: p.budget,
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
        projectId: b.projectId,
        studentName: b.studentId?.name || "Student",
        projectTitle: myProjects.find(p => p._id.toString() === b.projectId.toString())?.title || "Project",
        amount: b.amount,
        timeline: b.timeline,
      }));

    res.json({
      postedCount: myProjects.length,
      bidsReceivedCount,
      activeGigsCount,
      pendingBids,
      milestonesToApprove,
      activeProjects,
    });
  } catch (error) {
    console.error("Client dashboard projects error:", error);
    res.status(500).json({ message: "Failed to load dashboard data." });
  }
});

// @desc    Get public stats for the landing page
// @route   GET /api/projects/public/stats
// @access  Public
router.get("/public/stats", async (req, res) => {
  try {
    const studentsCount = await User.countDocuments({ role: "student" });
    const clientsCount = await User.countDocuments({ role: "client" });
    const projectsCount = await Project.countDocuments({ status: "OPEN" });
    const completedCount = await Project.countDocuments({ status: "COMPLETED" });

    // Calculate total escrow: Sum of amounts in ledger
    const ledgers = await PaymentLedger.find({ status: { $in: ["LOCKED", "PENDING_REVIEW", "RELEASED"] } });
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
    res.status(500).json({ message: "Failed to load stats." });
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

    res.json({ project, milestones });
  } catch (error) {
    console.error("Get project error:", error);
    res.status(500).json({ message: "Failed to load project details. Please try again." });
  }
});

// @desc    Create a new project
// @route   POST /api/projects
// @access  Private (Client only)
router.post("/", protect, requireRole("client"), async (req, res) => {
  const { title, description, category, budget, deadline, skillsRequired, milestones, files, fileManifest, importSource } = req.body;

  if (!title || !description || !category || !budget || !deadline) {
    return res.status(400).json({ message: "Please fill in all required fields: title, description, category, budget, deadline." });
  }

  try {
    const project = await Project.create({
      title: title.trim(),
      description: description.trim(),
      category,
      budget: parseAmount(budget),
      deadline,
      skillsRequired: skillsRequired || [],
      clientId: req.user._id,
      status: "OPEN",
      files: files || [],
      fileManifest: fileManifest || [],
      importSource: importSource || "",
    });

    // Create milestones if provided
    if (milestones && milestones.length > 0) {
      const milestoneDocs = milestones.map((m) => ({
        projectId: project._id,
        title: m.title,
        amount: parseAmount(m.amount),
        dueDate: m.dueDate || "",
        status: "PENDING",
      }));
      await Milestone.insertMany(milestoneDocs);
    }

    // Log Activity
    await Activity.create({
      actorId: req.user._id,
      type: "PROJECT_POSTED",
      message: `${req.user.name} posted a new brief: "${title}"`,
      targetId: project._id,
    });

    res.status(201).json(project);
  } catch (error) {
    console.error("Create project error:", error);
    res.status(500).json({ message: "Failed to create project. Please try again." });
  }
});

// @desc    Update project
// @route   PATCH /api/projects/:id
// @access  Private (Client only)
router.patch("/:id", protect, requireRole("client"), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    if (project.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to update this project." });
    }

    const { status, title, description, budget, deadline } = req.body;

    if (status) {
      // Define allowed manual transitions (clients cannot skip the payment/escrow workflow)
      const allowedTransitions = {
        OPEN: ["CANCELLED"],         // Client can cancel their OPEN project
        PENDING_FUNDING: [],          // Must go through payment flow
        ASSIGNED: ["IN_PROGRESS"],    // Client can mark project as in progress
        IN_PROGRESS: [],              // Completion only via milestone release
        COMPLETED: [],                // Immutable once complete
        CANCELLED: [],                // Immutable once cancelled
      };

      const currentStatus = project.status;
      const allowed = allowedTransitions[currentStatus] || [];
      if (!allowed.includes(status)) {
        return res.status(400).json({
          message: `Cannot transition project from '${currentStatus}' to '${status}'. This transition is not permitted via manual update.`,
        });
      }

      project.status = status;
    }
    if (title || description || budget || deadline) {
      if (project.status !== "OPEN") {
        return res.status(400).json({
          message: "Only projects in 'OPEN' status can have their title, description, budget, or deadline edited.",
        });
      }
    }

    if (title) project.title = title.trim();
    if (description) project.description = description.trim();
    if (budget) project.budget = parseAmount(budget);
    if (deadline) project.deadline = deadline;

    const updatedProject = await project.save();
    res.json(updatedProject);
  } catch (error) {
    console.error("Update project error:", error);
    res.status(500).json({ message: "Failed to update project. Please try again." });
  }
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

    if (project.status !== "OPEN") {
      return res.status(400).json({ message: "Only open projects can be deleted. This project is already active or completed." });
    }

    await project.deleteOne();
    // Delete associated milestones
    await Milestone.deleteMany({ projectId: project._id });

    res.json({ message: "Project removed successfully." });
  } catch (error) {
    console.error("Delete project error:", error);
    res.status(500).json({ message: "Failed to delete project. Please try again." });
  }
});

export default router;
