import express from "express";

import {
    generateDownloadToken,
    downloadDocument
} from "../controller/downloadContoller.js";

const router = express.Router();

router.post("/download-token", generateDownloadToken);

router.get("/download/:token", downloadDocument);

export default router;
