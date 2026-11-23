// Cloudflare Pages Function: handles every /api/* request.
// Bindings required:  DB (KV namespace)  ·  IMAGES (R2 bucket)
// Secrets required:   ADMIN_USER · ADMIN_PASSWORD · SESSION_SECRET

const enc = new TextEncoder();
const MAX_IMG = 6 * 1024 * 1024;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(secret, data) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
const safeEq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

async function isAuthed(request, env) {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)session=([^;]+)/);
  if (!m) return false;
  const [exp, sig] = m[1].split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEq(sig, await hmac(env.SESSION_SECRET, exp));
}

export async function onRequest({ request, env, params }) {
  const route = [].concat(params.route || []).join("/");
  const method = request.method;

  if (!env.SESSION_SECRET || !env.ADMIN_USER || !env.ADMIN_PASSWORD) return json({ error: "Server not configured" }, 500);

  // ---- public ----
  if (route === "projects" && method === "GET") {
    return json((await env.DB.get("projects", "json")) || [], 200, { "cache-control": "public, max-age=30" });
  }

  if (route.startsWith("img/") && method === "GET") {
    const obj = await env.IMAGES.get(route.slice(4));
    if (!obj) return new Response("Not found", { status: 404 });
    return new Response(obj.body, { headers: {
      "content-type": obj.httpMetadata?.contentType || "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff"
    } });
  }

  if (route === "login" && method === "POST") {
    let b; try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
    const s = env.SESSION_SECRET;
    const okU = safeEq(await hmac(s, String(b.user || "")), await hmac(s, env.ADMIN_USER));
    const okP = safeEq(await hmac(s, String(b.password || "")), await hmac(s, env.ADMIN_PASSWORD));
    if (!(okU && okP)) { await new Promise(r => setTimeout(r, 700)); return json({ error: "Wrong user ID or password" }, 401); }
    const exp = String(Date.now() + 12 * 3600 * 1000);
    return json({ ok: true }, 200, { "set-cookie": `session=${exp}.${await hmac(s, exp)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200` });
  }

  if (route === "logout" && method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": "session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0" });
  }

  if (route === "me" && method === "GET") return json({ admin: await isAuthed(request, env) });

  // ---- admin only ----
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);

  if (route === "upload" && method === "POST") {
    const type = (request.headers.get("content-type") || "").split(";")[0].trim();
    const ext = TYPES[type];
    if (!ext) return json({ error: "Only JPG, PNG, WEBP or GIF images" }, 415);
    const data = await request.arrayBuffer();
    if (data.byteLength > MAX_IMG) return json({ error: "Image too large (max 6 MB)" }, 413);
    const key = `${crypto.randomUUID()}.${ext}`;
    await env.IMAGES.put(key, data, { httpMetadata: { contentType: type } });
    return json({ url: `/api/img/${key}` });
  }

  if (route === "projects" && method === "PUT") {
    let list; try { list = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
    if (!Array.isArray(list) || list.length > 200) return json({ error: "Invalid data" }, 400);
    const clean = list.map(p => ({
      id: String(p.id || crypto.randomUUID()).slice(0, 64),
      name: String(p.name || "").slice(0, 120),
      category: String(p.category || "Other").slice(0, 40),
      description: String(p.description || "").slice(0, 1000),
      slide: p.slide !== false,
      photos: (Array.isArray(p.photos) ? p.photos : []).filter(u => /^\/api\/img\/[\w.-]+$/.test(u)).slice(0, 30)
    }));
    // delete photos that are no longer used
    const old = (await env.DB.get("projects", "json")) || [];
    const keep = new Set(clean.flatMap(p => p.photos));
    for (const u of old.flatMap(p => p.photos || [])) if (!keep.has(u)) await env.IMAGES.delete(u.replace("/api/img/", ""));
    await env.DB.put("projects", JSON.stringify(clean));
    return json({ ok: true, projects: clean });
  }

  return json({ error: "Not found" }, 404);
}
