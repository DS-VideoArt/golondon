import crypto from "node:crypto";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

/*
  הגנה מפני ניחוש סיסמאות.

  האימות עצמו כבר מתבצע כאן בשרת ולא בדפדפן, והסיסמה לעולם לא מגיעה
  לקוד הפומבי. מה שחסר היה הגבלת קצב: בלי זה אפשר לירות לנקודת הקצה
  הזאת ניחושים ללא הגבלה.

  המונה נשמר בזיכרון המופע. פונקציות נטליפיי הן חסרות מצב בין מופעים,
  ולכן זו אינה הגנה מוחלטת, אבל מופע חם משרת רצף בקשות מאותו מקור וזה
  בדיוק התרחיש של ניחוש אוטומטי. זו הגנה אמיתית בלי להוסיף שום תשתית
  אחסון, וזו הסיבה שנבחרה כאן.

  החלון קצר בכוונה, כדי שנעילה בטעות של בעל האתר תשתחרר מעצמה.
*/
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_FAILS = 8;
const RATE_MAX_KEYS = 500;
const failures = new Map();

function clientKey(req) {
  const h = req.headers;
  return (
    h.get("x-nf-client-connection-ip") ||
    (h.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}

function tooManyFailures(key) {
  const now = Date.now();
  const hits = (failures.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length) failures.set(key, hits);
  else failures.delete(key);
  return hits.length >= RATE_MAX_FAILS;
}

function recordFailure(key) {
  const now = Date.now();
  const hits = (failures.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  failures.set(key, hits);
  /* תקרת זיכרון, כדי שמפתח אקראי לכל בקשה לא ינפח את המפה */
  if (failures.size > RATE_MAX_KEYS) {
    const oldest = failures.keys().next().value;
    failures.delete(oldest);
  }
}

function sign(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_TOKEN_SECRET;
  if (!adminPassword || !secret) {
    return new Response(JSON.stringify({ error: "server not configured" }), { status: 500 });
  }

  const key = clientKey(req);
  if (tooManyFailures(key)) {
    return new Response(JSON.stringify({ error: "too many attempts" }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "900" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad request" }), { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!safeEqual(password, adminPassword)) {
    recordFailure(key);
    /* השהיה קצרה מייקרת ניחוש אוטומטי ואינה מורגשת למשתמש אמיתי */
    await new Promise((r) => setTimeout(r, 400));
    return new Response(JSON.stringify({ error: "invalid password" }), { status: 401 });
  }

  failures.delete(key);
  const exp = Date.now() + TOKEN_TTL_MS;
  const token = sign({ exp }, secret);

  return new Response(JSON.stringify({ token, exp }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
