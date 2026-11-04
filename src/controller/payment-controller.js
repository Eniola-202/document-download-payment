import { randomBytes } from "crypto";
import {
  initializeTransaction,
  verifyTransaction,
} from "../services/paystackservice.js";
import supabase from "../config/supabase.js";

export async function initializePayment(req, res) {
  let orderId;
  let reference;
  try {
    const { productId, customerName, customerEmail } = req.body;

    if (
      !productId ||
      !customerName ||
      !customerEmail 
      // typeof customerName !== "string" ||
      // typeof customerEmail !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "product id, customer name, customer email are required",
      });
    }
    const email = customerEmail.trim().toLocaleLowerCase();
    const name = customerName.trim();

    if (
      name.length < 2 ||
      name.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        success: false,
        message: "please provide valid customer details",
      });
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name,price_kobo, currency, is_active")
      .eq("id", productId)
      .eq("is_active", true)
      .single();
      console.log("Supabase Product Result:", { product, productError }); 

    if (productError || !product) {
      return res.status(400).json({
        success: false,
        message: "product not found or unavailable",
      });
    }
    if (
      !Number.isSafeInteger(product.price_kobo) ||
      product.price_kobo <= 0 ||
      product.currency !== "NGN"
    ) {
      return res.status(400).json({
        success: false,
        message: "product pricing invalid",
      });
    }
    reference = `TLA-${Date.now()}-${randomBytes(6).toString("hex")}`;
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        product_id: product.id,
        customer_name: name,
        customer_email: email,
        amount_kobo: product.price_kobo,
        currency: product.currency,
        status: "pending",
        paystack_reference: reference,
      })
      .select()
      .single();

    if (orderError) {
      throw orderError;
    }
    orderId = order.id;

    const { error: paymentError } = await supabase.from("payments").insert({
      order_id: order.id,
      reference: reference,
      amount_kobo: product.price_kobo,
      currency: product.currency,
      status: "pending",
    });
    if (paymentError) {
      throw paymentError;
    }

    const payment = await initializeTransaction({
      email: email,
      amount: String(product.price_kobo),
      currency: product.currency,
      reference: reference,
      callback_url: process.env.PAYMENT_CALLBACK_URL,
      metadata: {
        order_id: order.id,
        product_id: product.id,
        product_name: product.name,
      },
    });
    const { error: updateError } = await supabase
      .from("payments")
      .update({
        gateway_response: payment,
      })
      .eq("reference", reference);

    if (updateError) {
      throw updateError;
    }
    return res.status(200).json({
      success: true,
      message: "Payment initailized successfully",
      authorization_url: payment.authorization_url,
      reference: payment.reference,
      order_id: order.id,
    });
  } catch (error) {
    console.error("payment Initializaton error", error.message);
    // Mark the order and payment as failed if initialization fails
    if (reference && orderId) {
      await supabase
        .from("orders")
        .update({ status: "failed" })
        .eq("id", orderId)
        .eq("status", "pending");

      await supabase
        .from("payments")
        .update({ status: "failed" })
        .eq("reference", reference)
        .eq("status", "pending");
    }

    return res.status(500).json({
      success: false,
      message: "Unable to initialize payment",
    });
  }
}

export async function verifyPayments(req, res) {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "payement reference is required",
      });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("paystack_reference", reference)
      .single();

    if (orderError || !order) {
      return res.status(404).json({
        success: false,
        message: "order not found",
      });
    }

    const transaction = await verifyTransaction(reference);

    if (
      transaction.reference !== reference ||
      Number(transaction.amount) !== Number(order.amount_kobo) ||
      transaction.currency !== order.currency
    ) {
      return res.status(400).json({
        success: false,
        message: "Transaction details do not match the order",
      });
    }
    if (transaction.status !== "success") {
      const failedStatuses = ["failed", "abandoned", "reversed"];
      const isFailed = failedStatuses.includes(transaction.status);
      if (isFailed) {
        await supabase
          .from("orders")
          .update({ status: "failed" })
          .eq("id", order.id)
          .neq("status", "paid");

        await supabase
          .from("payments")
          .update({
            status: "failed",
            gateway_response: transaction,
          })
          .eq("reference", reference)
          .neq("status", "success");
      }
      return res.status(200).json({
        success: false,
        message: "Payment has not been completed",
        payment_status: transaction.status,
      });
    }

    // Update order to paid
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

    // Update payment record
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

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      order_id: order.id,
      payment_status: "success",
    });
  } catch (error) {
    console.error("Payment Verification Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to verify payment",
    });
  }
}
