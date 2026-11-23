# Parsha Narayana — Portfolio (Cloudflare Pages)

public/      → website (HTML/CSS/JS)
functions/   → server API (login, upload, projects) — runs on Cloudflare automatically

## Deploy (dashboard only, no command line)
1. Push this folder to a GitHub repo (public/ and functions/ at the top level).
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
   Build command: (leave empty)   Build output directory: public
3. Storage & Databases → KV → Create namespace "portfolio-db".
   Storage & Databases → R2 → Create bucket "portfolio-images".
4. Pages project → Settings → Bindings:
   - KV namespace      → variable name  DB      → portfolio-db
   - R2 bucket         → variable name  IMAGES  → portfolio-images
5. Pages project → Settings → Variables and Secrets (add as Secret):
   - ADMIN_USER       your user id
   - ADMIN_PASSWORD   a strong password
   - SESSION_SECRET   any long random string (40+ chars)
6. Deployments → Retry deployment (so bindings/secrets apply). Open your *.pages.dev URL.
