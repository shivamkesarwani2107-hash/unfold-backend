
import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import multer from "multer";
import nodemailer from "nodemailer";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 5000;
const UPI_ID = process.env.UPI_ID || "9336991973@ptaxis";
const PRICE_INR = Number(process.env.PRICE_INR || 19);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADMIN_HTML_PATH = path.join(__dirname, "admin.html");

app.use(
  cors({
    origin: (process.env.FRONTEND_ORIGIN || "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim()),
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Order-Access-Token",
    ],
  })
);

app.use(express.json({ limit: "10mb" }));

// -------------------- DATABASE MODEL --------------------

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    required: true,
    index: true,
  },
  amount: { type: Number, required: true },
  upiId: { type: String, required: true },

  // Store only the SHA-256 hash, never the raw access token.
  accessTokenHash: { type: String, default: "" },

  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
    index: true,
  },

  greeting: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },

  screenshot: {
    data: String,
    mimeType: String,
    uploadedAt: Date,
  },

  customerNote: { type: String, default: "" },
  adminNote: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  reviewedAt: Date,
});

const Order =
  mongoose.models.ManualUpiOrder ||
  mongoose.model("ManualUpiOrder", orderSchema);

// -------------------- SCREENSHOT UPLOAD --------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];

    if (!allowed.includes(file.mimetype)) {
      return callback(
        new Error("Upload a JPG, PNG, or WEBP screenshot.")
      );
    }

    callback(null, true);
  },
});

// -------------------- SECURITY HELPERS --------------------

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function adminOnly(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  const header = req.headers.authorization || "";
  const supplied = header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

  if (
    !expected ||
    !supplied ||
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(
      Buffer.from(supplied),
      Buffer.from(expected)
    )
  ) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized admin access.",
    });
  }

  next();
}

function userHasOrderToken(req, order) {
  const supplied = req.get("X-Order-Access-Token") || "";

  if (!supplied || !order.accessTokenHash) {
    return false;
  }

  const suppliedHash = Buffer.from(hashToken(supplied), "hex");
  const savedHash = Buffer.from(order.accessTokenHash, "hex");

  return (
    suppliedHash.length === savedHash.length &&
    crypto.timingSafeEqual(suppliedHash, savedHash)
  );
}

// -------------------- ADMIN EMAIL --------------------

async function sendAdminEmail(order) {
  if (
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS ||
    !process.env.ADMIN_EMAIL
  ) {
    console.warn("Email configuration is incomplete.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Unfold Payments" <${process.env.SMTP_USER}>`,
    to: process.env.ADMIN_EMAIL,
    subject: `Unfold: payment screenshot submitted (${order.orderId})`,
    text: [
      "A customer submitted a payment screenshot for review.",
      `Order ID: ${order.orderId}`,
      `Amount: Rs ${order.amount}`,
      `Recipient: ${order.greeting?.recipient || "N/A"}`,
      `Occasion: ${order.greeting?.occasion || "N/A"}`,
      "Open the backend admin panel to review the order.",
    ].join("\n"),
  });
}

// -------------------- HEALTH CHECK --------------------

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    service: "unfold-manual-upi",
  });
});

// -------------------- 1. CREATE ORDER --------------------

app.post("/api/manual-payment/orders", async (req, res) => {
  try {
    const greeting = req.body?.greeting;

    if (
      !greeting ||
      !String(greeting.recipient || "").trim() ||
      !String(greeting.message || "").trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Greeting details are incomplete.",
      });
    }

    // Generate a private token for this order.
    const accessToken = crypto.randomBytes(32).toString("hex");

    const order = await Order.create({
      orderId: `UNF-${Date.now().toString(36).toUpperCase()}-${crypto
        .randomBytes(4)
        .toString("hex")
        .toUpperCase()}`,
      amount: PRICE_INR,
      upiId: UPI_ID,
      accessTokenHash: hashToken(accessToken),
      status: "pending",
      greeting: {
        occasion: String(
          greeting.occasion || "Personalized Greeting"
        ).slice(0, 80),

        recipient: String(greeting.recipient).slice(0, 100),
        sender: String(greeting.sender || "You").slice(0, 100),
        message: String(greeting.message).slice(0, 3000),

        photo:
          typeof greeting.photo === "string"
            ? greeting.photo.slice(0, 1000000)
            : "",

        decoration: greeting.decoration || {},
        category: String(greeting.category || "").slice(0, 100),
      },
    });

    // The raw token is returned once so the user's browser can save it.
    res.status(201).json({
      success: true,
      orderId: order.orderId,
      amount: order.amount,
      upiId: order.upiId,
      status: order.status,
      accessToken,
    });
  } catch (error) {
    console.error("Create order error:", error);

    res.status(500).json({
      success: false,
      message: "Could not create order. Check MongoDB and backend.",
    });
  }
});

// -------------------- 2. UPLOAD PAYMENT SCREENSHOT --------------------

app.post(
  "/api/manual-payment/orders/:orderId/screenshot",
  upload.single("screenshot"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please attach a payment screenshot.",
        });
      }

      const order = await Order.findOne({
        orderId: req.params.orderId,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Payment order not found.",
        });
      }

      if (order.status !== "pending") {
        return res.status(409).json({
          success: false,
          message: "This order has already been reviewed.",
        });
      }

      order.screenshot = {
        data: req.file.buffer.toString("base64"),
        mimeType: req.file.mimetype,
        uploadedAt: new Date(),
      };

      order.customerNote = String(
        req.body?.transactionRef || ""
      ).slice(0, 100);

      await order.save();

      try {
        await sendAdminEmail(order);
      } catch (emailError) {
        console.error(
          "Email failed; order is saved:",
          emailError.message
        );
      }

      res.json({
        success: true,
        orderId: order.orderId,
        status: order.status,
        message: "Screenshot received. Awaiting admin review.",
      });
    } catch (error) {
      console.error("Screenshot upload error:", error);

      res.status(error instanceof multer.MulterError ? 400 : 500).json({
        success: false,
        message:
          error instanceof multer.MulterError
            ? "Screenshot exceeds the 3 MB limit."
            : error.message || "Screenshot upload failed.",
      });
    }
  }
);

// -------------------- 3. CHECK ORDER STATUS --------------------

app.get(
  "/api/manual-payment/orders/:orderId/status",
  async (req, res) => {
    try {
      const order = await Order.findOne({
        orderId: req.params.orderId,
      }).select("orderId amount status");

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      res.json({
        success: true,
        orderId: order.orderId,
        amount: order.amount,
        status: order.status,
      });
    } catch (error) {
      console.error("Status check error:", error);

      res.status(500).json({
        success: false,
        message: "Could not check payment status.",
      });
    }
  }
);

// -------------------- 4. SECURE GREETING ACCESS --------------------

app.get(
  "/api/manual-payment/orders/:orderId/greeting",
  async (req, res) => {
    try {
      const order = await Order.findOne({
        orderId: req.params.orderId,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      if (!userHasOrderToken(req, order)) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid or missing order access token. Return to the original payment session.",
        });
      }

      if (order.status !== "approved") {
        return res.status(403).json({
          success: false,
          message: "Greeting is locked until admin approves payment.",
          status: order.status,
        });
      }

      // Do not return payment screenshots or internal token hashes.
      res.json({
        success: true,
        orderId: order.orderId,
        greeting: order.greeting,
      });
    } catch (error) {
      console.error("Greeting access error:", error);

      res.status(500).json({
        success: false,
        message: "Could not load approved greeting.",
      });
    }
  }
);

// -------------------- 5. ADMIN: LIST ORDERS --------------------

app.get("/api/admin/orders", adminOnly, async (_req, res) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({
      success: true,
      orders: orders.map((order) => ({
        orderId: order.orderId,
        amount: order.amount,
        status: order.status,
        greeting: order.greeting,
        customerNote: order.customerNote,
        adminNote: order.adminNote,
        createdAt: order.createdAt,

        screenshot: order.screenshot?.data
          ? `data:${order.screenshot.mimeType};base64,${order.screenshot.data}`
          : null,
      })),
    });
  } catch (error) {
    console.error("Admin orders error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load orders.",
    });
  }
});

// -------------------- 6. ADMIN: APPROVE OR REJECT --------------------

app.patch(
  "/api/admin/orders/:orderId",
  adminOnly,
  async (req, res) => {
    try {
      const { status, adminNote = "" } = req.body || {};

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be approved or rejected.",
        });
      }

      const order = await Order.findOne({
        orderId: req.params.orderId,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      if (order.status !== "pending") {
        return res.status(409).json({
          success: false,
          message: "Order has already been reviewed.",
        });
      }

      if (status === "approved" && !order.screenshot?.data) {
        return res.status(400).json({
          success: false,
          message: "Cannot approve without a screenshot.",
        });
      }

      // The admin must verify the actual bank/UPI credit first.
      order.status = status;
      order.adminNote = String(adminNote).slice(0, 500);
      order.reviewedAt = new Date();

      await order.save();

      res.json({
        success: true,
        orderId: order.orderId,
        status: order.status,
        message:
          status === "approved"
            ? "Payment approved. Greeting access unlocked."
            : "Order rejected.",
      });
    } catch (error) {
      console.error("Review order error:", error);

      res.status(500).json({
        success: false,
        message: "Could not update order.",
      });
    }
  }
);

// -------------------- 7. ADMIN PAGE: FIXED FILE PATH --------------------

app.get("/admin", (_req, res) => {
  res.sendFile(ADMIN_HTML_PATH, (error) => {
    if (error) {
      console.error("Could not load admin.html:", error);

      if (!res.headersSent) {
        res.status(error.statusCode || 500).send(
          "Admin page could not load. Check that admin.html exists inside unfold-backend."
        );
      }
    }
  });
});

// -------------------- ERROR HANDLER --------------------

app.use((error, _req, res, _next) => {
  console.error("Request error:", error);

  if (res.headersSent) return;

  res.status(error instanceof multer.MulterError ? 400 : 500).json({
    success: false,
    message: error.message || "Server error.",
  });
});

// -------------------- START SERVER --------------------

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is missing from the backend .env file.");
  process.exit(1);
}

if (!process.env.ADMIN_TOKEN) {
  console.error("ADMIN_TOKEN is missing from the backend .env file.");
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);

console.log("MongoDB connected successfully.");

app.listen(PORT, () => {
  console.log(`Unfold backend running on port ${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
