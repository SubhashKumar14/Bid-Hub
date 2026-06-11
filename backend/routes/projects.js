import express from "express";
import { Project } from "../models/Project.js";
import { Milestone } from "../models/Milestone.js";
import { Activity } from "../models/Activity.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Helper: escape special regex characters to prevent ReDoS
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
      budget,
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
        amount: m.amount,
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
    if (title) project.title = title.trim();
    if (description) project.description = description.trim();
    if (budget) project.budget = budget;
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
