import express from "express";
import { handlePaymentWebhook } from "../controller/webhook-controller.js";


const router = express.Router();

// Initialize Paystack payment
router.post("/", handlePaymentWebhook);


export default router;

