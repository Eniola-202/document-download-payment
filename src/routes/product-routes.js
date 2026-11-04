import { getProducts, getProductSlug } from "../controller/product-controller.js";
import express from "express";

const router = express.Router();

router.get("/", getProducts);
router.get("/", getProductSlug);

export default router;