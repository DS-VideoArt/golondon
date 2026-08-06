import crypto from "node:crypto";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

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

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad request" }), { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!safeEqual(password, adminPassword)) {
    return new Response(JSON.stringify({ error: "invalid password" }), { status: 401 });
  }

  const exp = Date.now() + TOKEN_TTL_MS;
  const token = sign({ exp }, secret);

  return new Response(JSON.stringify({ token, exp }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
