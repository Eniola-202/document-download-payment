
import express from "express";

import {
    submitComment,
    getBlogComments
} from "../controller/comments-controller.js";

const router = express.Router();

// Submit a comment
router.post("/", submitComment);

// Retrieve approved comments for a blog post
router.get("/:slug", getBlogComments);

export default router;
