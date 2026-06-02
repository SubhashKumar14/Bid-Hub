import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

export const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      // JWT_SECRET is validated on startup — no fallback here
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("-passwordHash");
      if (!req.user) {
        return res.status(401).json({ message: "Not authorized. User not found." });
      }
      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Not authorized. Session expired. Please log in again." });
      }
      return res.status(401).json({ message: "Not authorized. Invalid token." });
    }
  } else {
    return res.status(401).json({ message: "Not authorized. Please log in." });
  }
};

export const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user && req.user.role === role) {
      next();
    } else {
      res.status(403).json({ message: `Access denied. This action requires the '${role}' role.` });
    }
  };
};
