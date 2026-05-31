import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { User } from "./models/User.js";
import { Project } from "./models/Project.js";
import { Bid } from "./models/Bid.js";
import { Milestone } from "./models/Milestone.js";
import { PaymentLedger } from "./models/PaymentLedger.js";
import { Review } from "./models/Review.js";
import { Activity } from "./models/Activity.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/bidhub";

const seed = async () => {
  try {
    console.log("Connecting to MongoDB for seeding...");
    await mongoose.connect(MONGODB_URI);
    console.log("Connected. Wiping database collections...");

    await User.deleteMany({});
    await Project.deleteMany({});
    await Bid.deleteMany({});
    await Milestone.deleteMany({});
    await PaymentLedger.deleteMany({});
    await Review.deleteMany({});
    await Activity.deleteMany({});

    console.log("Collections wiped. Creating test users...");

    // Password Hashing
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash("password123", salt);

    // Create Rohan (Student)
    const rohan = await User.create({
      name: "Rohan Sharma",
      email: "rohan@rvce.edu",
      passwordHash,
      role: "student",
      college: "RV College of Engineering",
      skills: ["React", "Node.js", "Express", "Tailwind CSS", "UX/UI"],
      bio: "Pre-final year CS student building fullstack MERN products. Quick learner and visual programmer.",
      avatarUrl: "",
      rating: 4.8,
      completedProjects: 1,
      profileViews: 12,
    });

    // Create Siddharth (Client)
    const siddharth = await User.create({
      name: "Siddharth Malhotra",
      email: "siddharth@rvceinc.com",
      passwordHash,
      role: "client",
      college: "RVCE Inc.",
      skills: [],
      bio: "Product Manager at RVCE Inc. We hire college students for small freelance design and development sprints.",
      avatarUrl: "",
      rating: 5.0,
      completedProjects: 2,
      profileViews: 4,
    });

    console.log("Users created. Creating project briefs and workflows...");

    // Project 1: Portfolio website redesign (OPEN for bidding)
    const projectOpen = await Project.create({
      title: "Redesign landing page for campus slower-fashion label",
      description: "We are looking for a designer and React builder to turn our slow-fashion label page into an editorial premium grid layout. Reference: Awwwards editorial sites.",
      category: "Product Design",
      budget: "₹25,000",
      deadline: "20 days",
      skillsRequired: ["UX/UI", "React", "Tailwind CSS"],
      clientId: siddharth._id,
      status: "OPEN",
      bidsCount: 1,
      importSource: "zip",
      fileManifest: [
        { path: "index.html", size: 1024, type: "html" },
        { path: "src/main.jsx", size: 512, type: "javascript" },
        { path: "src/styles/app.css", size: 2048, type: "css" }
      ]
    });

    // Create Bid from Rohan on the open project
    const bidOpen = await Bid.create({
      projectId: projectOpen._id,
      studentId: rohan._id,
      amount: "₹23,500",
      timeline: "2 weeks",
      proposal: "Hi Siddharth! I read your brief and I love slower-fashion editorial grids. I have built three React projects with warm cream layouts. Here is my portfolio.",
      status: "PENDING"
    });

    // Create Milestones for open project
    await Milestone.create([
      { projectId: projectOpen._id, title: "Wireframes & design styleguide", amount: "₹10,000", status: "PENDING" },
      { projectId: projectOpen._id, title: "React components & Tailwind styling", amount: "₹13,500", status: "PENDING" }
    ]);

    // Project 2: Campus Ride Share brief (ASSIGNED - Escrow Locked)
    const projectAssigned = await Project.create({
      title: "RVCE Ride Share dashboard layout",
      description: "Build a responsive grid-based dashboard using Tailwind CSS for sharing rides on campus.",
      category: "Web Development",
      budget: "₹15,000",
      deadline: "10 days",
      skillsRequired: ["React", "Tailwind CSS", "Node.js"],
      clientId: siddharth._id,
      status: "ASSIGNED",
      bidsCount: 1,
      importSource: "github",
      fileManifest: [
        { path: "README.md", size: 250, type: "markdown" },
        { path: "package.json", size: 700, type: "json" },
        { path: "server.js", size: 1500, type: "javascript" }
      ]
    });

    // Accepted Bid from Rohan
    const bidAssigned = await Bid.create({
      projectId: projectAssigned._id,
      studentId: rohan._id,
      amount: "₹15,000",
      timeline: "8 days",
      proposal: "I have built similar dashboards using Tailwind CSS. Ready to start immediately.",
      status: "ACCEPTED"
    });

    projectAssigned.acceptedBidId = bidAssigned._id;
    await projectAssigned.save();

    // Milestones for Assigned Project (First submitted, Second pending)
    const m1 = await Milestone.create({
      projectId: projectAssigned._id,
      title: "UI design mockup integration",
      amount: "₹7,500",
      status: "SUBMITTED" // Student submitted this work
    });

    const m2 = await Milestone.create({
      projectId: projectAssigned._id,
      title: "Backend API endpoints integration",
      amount: "₹7,500",
      status: "PENDING"
    });

    // Set up Escrow PaymentLedger entries for Assigned Project
    await PaymentLedger.create([
      {
        projectId: projectAssigned._id,
        milestoneId: m1._id,
        clientId: siddharth._id,
        studentId: rohan._id,
        amount: 7500,
        status: "PENDING", // PENDING release since milestone status is SUBMITTED
        transactionRef: "TXN-MOCKASSIGNED1",
      },
      {
        projectId: projectAssigned._id,
        milestoneId: m2._id,
        clientId: siddharth._id,
        studentId: rohan._id,
        amount: 7500,
        status: "LOCKED", // LOCKED in escrow
        transactionRef: "TXN-MOCKASSIGNED2",
      }
    ]);

    // Project 3: Completed Gigs brief (COMPLETED)
    const projectCompleted = await Project.create({
      title: "Campus club event registration portal",
      description: "Build an event page layout for the RVCE coding society annual fest.",
      category: "Web Development",
      budget: "₹8,000",
      deadline: "5 days",
      skillsRequired: ["React"],
      clientId: siddharth._id,
      status: "COMPLETED",
      bidsCount: 1,
    });

    // Accepted Bid
    const bidCompleted = await Bid.create({
      projectId: projectCompleted._id,
      studentId: rohan._id,
      amount: "₹8,000",
      timeline: "4 days",
      proposal: "I am part of the coding society and have code snippets ready to reuse for registration sheets.",
      status: "ACCEPTED"
    });

    projectCompleted.acceptedBidId = bidCompleted._id;
    await projectCompleted.save();

    // Milestones Completed
    const mc1 = await Milestone.create({
      projectId: projectCompleted._id,
      title: "Main Registration Layout",
      amount: "₹8,000",
      status: "RELEASED"
    });

    // Payment Ledger Released
    await PaymentLedger.create({
      projectId: projectCompleted._id,
      milestoneId: mc1._id,
      clientId: siddharth._id,
      studentId: rohan._id,
      amount: 8000,
      status: "RELEASED",
      transactionRef: "TXN-MOCKCOMPLETED1",
      releasedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    });

    // Create Review left by Siddharth to Rohan
    await Review.create({
      projectId: projectCompleted._id,
      reviewerId: siddharth._id,
      revieweeId: rohan._id,
      rating: 5,
      comment: "Rohan did an outstanding job styling the registration components. Code was delivered on time and responsive layout behaves beautifully on mobile."
    });

    // Create Activity Logs
    await Activity.create([
      {
        actorId: siddharth._id,
        type: "PROJECT_POSTED",
        message: `${siddharth.name} posted a new brief: "${projectOpen.title}"`,
        targetId: projectOpen._id,
      },
      {
        actorId: rohan._id,
        type: "BID_PLACED",
        message: `${rohan.name} submitted a bid of ${bidOpen.amount} for "${projectOpen.title}"`,
        targetId: projectOpen._id,
      },
      {
        actorId: siddharth._id,
        type: "PROJECT_COMPLETED",
        message: `Project "${projectCompleted.title}" has been successfully completed!`,
        targetId: projectCompleted._id,
      }
    ]);

    console.log("Database seeded successfully!");
    mongoose.connection.close();
  } catch (error) {
    console.error("Seeding failed: ", error.message);
    mongoose.connection.close();
    process.exit(1);
  }
};

seed();
