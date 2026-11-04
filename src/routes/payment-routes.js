import { initializePayment, verifyPayments } from "../controller/payment-controller.js";
import express from "express";


const router = express.Router();

// Initialize Paystack payment
router.post("/initialize", initializePayment);

// Verify Paystack payment
router.get("/verify/:reference", verifyPayments);

export default router;

