import crypto from "crypto";
import supabase from "../config/supabase.js";
import { verifyTransaction } from "../services/paystackservice.js";

export async function handlePaymentWebhook(req, res) {
  try {
    const signature = req.headers["x-paystack-signature"];
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!req.rawBody || !Buffer.isBuffer(req.rawBody)) {
      return res.status(400).json({
        success: false,
        message: "Raw request body missing",
      });
    }

    if (!signature || !secretKey) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook authentication",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha512", secretKey)
      .update(req.rawBody)
      .digest();
    if (!/^[a-fA-F0-9]{128}$/.test(signature)) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    const recievedSignature = Buffer.from(signature, "hex");
    if (!crypto.timingSafeEqual(expectedSignature, recievedSignature)) {
      return res.status(401).json({
        success: false,
        message: "webhook signatire failed",
      });
    }
    const event = req.body;

    if (event.event !== "charge.success") {
      return res.status(200).json({
        success: true,
        message: "event recieved but not processed",
      });
    }
    const reference = event.data?.reference;
    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "no transaction reference",
      });
    }
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("paystack_reference", reference)
      .maybeSingle();
    if (orderError) {
      throw orderError;
    }
    if (!order) {
      console.error("webhooko recieved unknown refrence: ", reference);
      return res.status(200).json({
        success: true,
        message: "unknown transaction reference",
      });
    }
    // Check whether this payment has already been recorded
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, status")
      .eq("reference", reference)
      .maybeSingle();

    if (paymentError) {
      throw paymentError;
    }

    if (!payment) {
      throw new Error("Payment record not found");
    }

    // Verify independently with Paystack
    const transaction = await verifyTransaction(reference);

    // Confirm the transaction details
    if (
      transaction.reference !== reference ||
      Number(transaction.amount) !== Number(order.amount_kobo) ||
      transaction.currency !== order.currency ||
      transaction.status !== "success"
    ) {
      throw new Error("Transaction verification failed");
    }

    // Idempotency: repeated notifications must not repeat fulfillment
    if (order.status === "paid" && payment.status === "success") {
      return res.status(200).json({
        success: true,
        message: "Payment already processed",
      });
    }

    // Update the order
    const { error: updateOrderError } = await supabase
      .from("orders")
      .update({
        status: "paid",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (updateOrderError) {
      throw updateOrderError;
    }

    // Update the payment
    const { error: updatePaymentError } = await supabase
      .from("payments")
      .update({
        status: "success",
        gateway_response: transaction,
        paid_at: transaction.paid_at || new Date().toISOString(),
      })
      .eq("reference", reference);

    if (updatePaymentError) {
      throw updatePaymentError;
    }

    console.log("Paystack payment confirmed:", reference);

    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
    });
  } catch (error) {
    console.error("Paystack Webhook Error:", error.message);

    // A 500 response allows Paystack to retry delivery
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
}
