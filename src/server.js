"use strict";

const express = require("express");
require("dotenv").config();

const { fibSeries, primesFromList, lcmList, hcfList } = require("./math");

const app = express();

/* ===== config ===== */
const OFFICIAL_EMAIL = String(process.env.OFFICIAL_EMAIL || "").trim();
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const PORT = Number(process.env.PORT || 3000);
const RATE_LIMIT_RPM = Math.max(1, Number(process.env.RATE_LIMIT_RPM || 60));

//security mechanisms
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb", strict: true }));

//rate limiter
const buckets = new Map(); 
app.use((req, res, next) => {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const windowMs = 60_000;

  const b = buckets.get(ip);
  if (!b || now >= b.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (b.count >= RATE_LIMIT_RPM) {
    return res.status(429).json({
      is_success: false,
      official_email: OFFICIAL_EMAIL || "",
      error: { code: "RATE_LIMITED", message: "Too many requests. Please retry later." }
    });
  }

  b.count += 1;
  return next();
});

// response helpers 
function ok(res, data) {
  return res.json({
    is_success: true,
    official_email: OFFICIAL_EMAIL,
    data
  });
}

function fail(res, status, code, message, details) {
  return res.status(status).json({
    is_success: false,
    official_email: OFFICIAL_EMAIL || "",
    error: {
      code,
      message,
      ...(details ? { details } : {})
    }
  });
}

//openAI
async function openaiSingleWord(question) {
  const q = String(question || "").trim();
  if (!q) return "";

  const clipped = q.length > 600 ? q.slice(0, 600) : q;

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: `Answer in ONE word only (no punctuation, no extra words). Question: ${clipped}`,
      max_output_tokens: 16
    })
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    const err = new Error("OpenAI API error");
    err.status = 502;
    err.details = { provider: "openai", http_status: resp.status, body: txt.slice(0, 200) };
    throw err;
  }

  const json = await resp.json();
  const text = String(json?.output_text || "").trim();
  return text.split(/\s+/)[0] || "";
}

/* ===== routes ===== */

// GET /health
app.get("/health", (req, res) => {
  return res.json({
    is_success: true,
    official_email: OFFICIAL_EMAIL
  });
});

// POST /bfhl
app.post("/bfhl", async (req, res) => {
  try {
    // env sanity
    if (!OFFICIAL_EMAIL) {
      return fail(res, 500, "MISSING_ENV", "OFFICIAL_EMAIL is missing");
    }

    // Content-Type guardrail
    if (!req.is("application/json")) {
      return fail(res, 400, "INVALID_CONTENT_TYPE", "Content-Type must be application/json");
    }

    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail(res, 400, "INVALID_JSON", "Body must be a JSON object");
    }

    // Must contain exactly ONE of: fibonacci, prime, lcm, hcf, AI
    const allowed = ["fibonacci", "prime", "lcm", "hcf", "AI"];
    const keys = Object.keys(body);

    const present = keys.filter((k) => allowed.includes(k));
    const unknown = keys.filter((k) => !allowed.includes(k));

    if (unknown.length > 0) {
      return fail(
        res,
        400,
        "UNKNOWN_KEY",
        "Only one of fibonacci, prime, lcm, hcf, AI is allowed",
        { unknown_keys: unknown }
      );
    }

    if (present.length !== 1) {
      return fail(
        res,
        400,
        "INVALID_KEYS",
        "Request must contain exactly one of: fibonacci, prime, lcm, hcf, AI",
        { received_keys: keys }
      );
    }

    const key = present[0];
    const val = body[key];

    // fibonacci: integer
    if (key === "fibonacci") {
      if (!Number.isInteger(val) || val < 0) {
        return fail(res, 400, "INVALID_FIBONACCI", "fibonacci must be a non-negative integer");
      }
      if (val > 2000) {
        return fail(res, 400, "FIB_TOO_LARGE", "fibonacci too large (max 2000)");
      }
      return ok(res, fibSeries(val));
    }

    // AI: string question
    if (key === "AI") {
      if (typeof val !== "string" || !val.trim()) {
        return fail(res, 400, "INVALID_AI", "AI must be a non-empty string question");
      }
      if (!OPENAI_API_KEY) {
        return fail(res, 500, "MISSING_ENV", "OPENAI_API_KEY is missing");
      }
      const ans = await openaiSingleWord(val);
      return ok(res, ans);
    }

    // prime/lcm/hcf: integer array
    if (!Array.isArray(val) || val.length === 0) {
      return fail(res, 400, "INVALID_ARRAY", `${key} must be a non-empty integer array`);
    }
    if (val.length > 2000) {
      return fail(res, 400, "ARRAY_TOO_LARGE", "Array too large (max 2000 elements)");
    }
    for (let i = 0; i < val.length; i++) {
      if (!Number.isInteger(val[i])) {
        return fail(res, 400, "INVALID_ARRAY_ELEMENT", "All array elements must be integers", {
          index: i,
          value: val[i]
        });
      }
    }

    if (key === "prime") return ok(res, primesFromList(val));
    if (key === "lcm") return ok(res, lcmList(val));
    if (key === "hcf") return ok(res, hcfList(val));

    // Should never reach
    return fail(res, 400, "UNSUPPORTED_KEY", "Unsupported key");
  } catch (err) {
    return fail(
      res,
      Number(err.status || 500),
      err.status ? "UPSTREAM_ERROR" : "INTERNAL_ERROR",
      err.message || "Server error",
      err.details || undefined
    );
  }
});

// 404 handler (consistent structure)
app.use((req, res) => {
  return fail(res, 404, "NOT_FOUND", "Route not found");
});

app.listen(PORT, () => {
  console.log(`BFHL API running on port ${PORT}`);
});
