
import crypto from "crypto";
import supabase from "../config/supabase.js";

// Generate a secure download token for a paid order
export async function generateDownloadToken(req, res) {
    try {
        const { reference } = req.body;

        if (!reference) {
            return res.status(400).json({
                success: false,
                message: "Payment reference is required"
            });
        }

        // Find the order using its Paystack reference
        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("id, product_id, status")
            .eq("paystack_reference", reference)
            .maybeSingle();

        if (orderError) throw orderError;

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Only paid orders can receive download tokens
        if (order.status !== "paid") {
            return res.status(403).json({
                success: false,
                message: "Payment has not been confirmed"
            });
        }

        // Confirm the corresponding payment is successful
        const { data: payment, error: paymentError } = await supabase
            .from("payments")
            .select("status")
            .eq("reference", reference)
            .maybeSingle();

        if (paymentError) throw paymentError;

        if (!payment || payment.status !== "success") {
            return res.status(403).json({
                success: false,
                message: "Successful payment record not found"
            });
        }

        // Generate a cryptographically secure token
        const token = crypto.randomBytes(32).toString("hex");

        // Store only the SHA-256 hash in the database
        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        // Token expires after 15 minutes
        const expiresAt = new Date(
            Date.now() + 15 * 60 * 1000
        ).toISOString();

        const { error: updateError } = await supabase
            .from("orders")
            .update({
                download_token_hash: tokenHash,
                download_expires_at: expiresAt
            })
            .eq("id", order.id);

        if (updateError) throw updateError;

        return res.status(200).json({
            success: true,
            message: "Download token generated successfully",
            download_token: token,
            expires_at: expiresAt
        });

    } catch (error) {
        console.error("Generate Download Token Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to generate download token"
        });
    }
}


// Validate token and generate a temporary Supabase download URL
export async function downloadDocument(req, res) {
    try {
        const { token } = req.params;

        if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
            return res.status(400).json({
                success: false,
                message: "Invalid download token"
            });
        }

        // Hash the supplied token before checking the database
        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("id, product_id, status, download_expires_at, download_count")
            .eq("download_token_hash", tokenHash)
            .maybeSingle();

        if (orderError) throw orderError;

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Invalid or expired download token"
            });
        }

        // Check order status
        if (order.status !== "paid") {
            return res.status(403).json({
                success: false,
                message: "This order has not been paid"
            });
        }

        // Check token expiry
        if (
            !order.download_expires_at ||
            new Date(order.download_expires_at).getTime() <= Date.now()
        ) {
            return res.status(410).json({
                success: false,
                message: "Download token has expired"
            });
        }

        // Retrieve the product's private storage path
        const { data: product, error: productError } = await supabase
            .from("products")
            .select("file_path, name, is_active")
            .eq("id", order.product_id)
            .maybeSingle();

        if (productError) throw productError;

        if (!product || !product.file_path) {
            return res.status(404).json({
                success: false,
                message: "Document not found"
            });
        }

        // Generate a temporary signed URL (5 minutes)
        const { data: signedUrlData, error: signedUrlError } =
            await supabase.storage
                .from("legaldocuments")
                .createSignedUrl(product.file_path, 300, {
                    download: true
                });

        if (signedUrlError) throw signedUrlError;

        // Track successful signed URL generation
        const { error: countError } = await supabase
            .from("orders")
            .update({
                download_count: (order.download_count || 0) + 1
            })
            .eq("id", order.id);

        if (countError) throw countError;

        return res.status(200).json({
            success: true,
            message: "Download link generated successfully",
            document_name: product.name,
            download_url: signedUrlData.signedUrl,
            expires_in: 300
        });

    } catch (error) {
        console.error("Download Document Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to generate document download link"
        });
    }
}
