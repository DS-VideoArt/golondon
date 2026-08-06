import crypto from "node:crypto";

function verify(token, secret) {
  if (typeof token !== "string" || !token.includes(".")) return false;
  const [data, sig] = token.split(".");
  const expectedSig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  const sigBuf = Buffer.from(sig || "");
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  return typeof payload.exp === "number" && payload.exp > Date.now();
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ valid: false }), { status: 405 });
  }

  const secret = process.env.ADMIN_TOKEN_SECRET;
  if (!secret) {
    return new Response(JSON.stringify({ valid: false }), { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ valid: false }), { status: 400 });
  }

  const valid = verify(body.token, secret);
  return new Response(JSON.stringify({ valid }), {
    status: valid ? 200 : 401,
    headers: { "content-type": "application/json" },
  });
};
