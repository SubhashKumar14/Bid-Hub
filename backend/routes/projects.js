import express from "express";
import { Project } from "../models/Project.js";
import { Milestone } from "../models/Milestone.js";
import { Activity } from "../models/Activity.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router();

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
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  if (skills) {
    const skillsArray = skills.split(",");
    query.skillsRequired = { $in: skillsArray };
  }

  try {
    const projects = await Project.find(query)
      .populate("clientId", "name avatarUrl rating completedProjects")
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: error.message });
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
      return res.status(404).json({ message: "Project not found" });
    }

    // Find milestones for this project
    const milestones = await Milestone.find({ projectId: project._id });

    res.json({ project, milestones });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create a new project
// @route   POST /api/projects
// @access  Private (Client only)
router.post("/", protect, requireRole("client"), async (req, res) => {
  const { title, description, category, budget, deadline, skillsRequired, milestones, files, fileManifest, importSource } = req.body;

  try {
    const project = await Project.create({
      title,
      description,
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
    res.status(500).json({ message: error.message });
  }
});

// @desc    Update project
// @route   PATCH /api/projects/:id
// @access  Private (Client only)
router.patch("/:id", protect, requireRole("client"), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (project.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to update this project" });
    }

    const { status, title, description, budget, deadline } = req.body;

    if (status) project.status = status;
    if (title) project.title = title;
    if (description) project.description = description;
    if (budget) project.budget = budget;
    if (deadline) project.deadline = deadline;

    const updatedProject = await project.save();
    res.json(updatedProject);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete project
// @route   DELETE /api/projects/:id
// @access  Private (Client only)
router.delete("/:id", protect, requireRole("client"), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (project.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this project" });
    }

    if (project.status !== "OPEN") {
      return res.status(400).json({ message: "Cannot delete an active project" });
    }

    await project.deleteOne();
    // Delete associated milestones
    await Milestone.deleteMany({ projectId: project._id });

    res.json({ message: "Project removed successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
