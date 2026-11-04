import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import supabase from "./config/supabase.js";
import productRoutes from "./routes/product-routes.js";
import paymentRoutes from './routes/payment-routes.js';
import downloadRoutes from './routes/downloadRoutes.js';
import webhookroutes from './routes/webhookroutes.js';
import commentRoutes from './routes/commentroutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5500",
  }),
);

app.use(express.json({
  verify: function (req,res,buf){
    req.rawBody = Buffer.from(buf)
  }
}));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON format in request body. Please check your quotes and commas.",
    });
  }
  next();
});

app.get("/api/health", function (req, res) {
  res.json({
    success: true,
    message: "Tech Law Advocate API is running",
  });
});

app.get("/api/test-supabase", async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("id")
      .limit(1);

    if (error) {
      throw error;
    }
    res.json({
      success: true,
      message: "supabase connection successful",
    });
  } catch (error) {
    console.error("supabase error", error.message);

    res.status(500).json({
      success: false,
      message: "Supabase connection failed",
    });
  }
});

app.use("/api/products", productRoutes);
app.use("/api/payments", paymentRoutes)
app.use("/api/orders", downloadRoutes);
app.use("/api/payments/webhooks", webhookroutes)
app.use("/api/comments", commentRoutes);

app.listen(PORT, function () {
  console.log(`API server running on port ${PORT}`);
});
