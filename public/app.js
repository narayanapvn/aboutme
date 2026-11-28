(() => {
  const $ = id => document.getElementById(id);
  const S = window.SITE;
  let projects = [];
  let admin = false;
  let pending = [];

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const api = async (path, opt = {}) => {
    const r = await fetch("/api/" + path, { credentials: "same-origin", ...opt });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Request failed");
    return data;
  };
  const shrink = file => new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = img.width * k; c.height = img.height * k;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u); c.toBlob(b => b ? res(b) : rej(new Error("Image error")), "image/jpeg", .82);
    };
    img.onerror = () => rej(new Error("Not a valid image")); img.src = u;
  });

  /* ---------- hero slider ---------- */
  let idx = 0, timer;
  function buildSlides() {
    const slides = [];
    projects.filter(p => p.slide !== false && p.photos?.length).forEach(p =>
      p.photos.slice(0, 4).forEach(ph => slides.push({ img: ph, title: esc(p.name) }))
    );

    if (!slides.length) {
      $("slides").innerHTML = "";
      $("dots").innerHTML = "";
      clearInterval(timer);
      return;
    }

    $("slides").innerHTML = slides.map((s, i) => `
      <div class="slide ${i === 0 ? "on" : ""}" style="background-image:url('${esc(s.img)}')">
        <div class="txt"><h1>${s.title}</h1></div>
      </div>`).join("");
    $("dots").innerHTML = slides.map((_, i) => `<i class="${i === 0 ? "on" : ""}" data-i="${i}"></i>`).join("");
    idx = 0; auto();
  }
  function go(n) {
    const sl = document.querySelectorAll(".slide"), dt = document.querySelectorAll(".dots i");
    if (!sl.length) return;
    idx = (n + sl.length) % sl.length;
    sl.forEach((s, i) => s.classList.toggle("on", i === idx));
    dt.forEach((d, i) => d.classList.toggle("on", i === idx));
  }
  function auto() { clearInterval(timer); timer = setInterval(() => go(idx + 1), 5500); }
  $("next").onclick = () => { go(idx + 1); auto(); };
  $("prev").onclick = () => { go(idx - 1); auto(); };
  $("dots").onclick = e => { if (e.target.dataset.i) { go(+e.target.dataset.i); auto(); } };

  /* ---------- grid ---------- */
  function renderGrid() {
    $("grid").innerHTML = projects.map(p => `
      <article class="pcard" data-id="${esc(p.id)}">
        <div class="img" style="background-image:url('${esc(p.photos?.[0] || "")}')"></div>
        <div class="b"><small>${esc(p.category)}</small><h3>${esc(p.name)}</h3><p>${esc(p.description || "")}</p>
        ${p.category === "Android App" && p.androidLink ? `<a class="play-link" href="${esc(p.androidLink)}" target="_blank" rel="noopener noreferrer" data-no-view>View on Google Play</a>` : ""}
        </div>
      </article>`).join("");
    $("emptyMsg").classList.toggle("hidden", projects.length > 0);
  }
  $("grid").onclick = e => {
    if (e.target.closest("[data-no-view]")) return;
    const c = e.target.closest(".pcard"); if (!c) return;
    const p = projects.find(x => x.id === c.dataset.id); if (!p || !p.photos?.length) return;
    const m = document.createElement("div"); m.className = "modal viewer";
    m.innerHTML = `<div class="box wide"><div class="row between"><h3>${esc(p.name)}</h3><button class="x">&times;</button></div>${p.photos.map(ph => `<img src="${esc(ph)}" alt="">`).join("")}<p>${esc(p.description || "")}</p>${p.category === "Android App" && p.androidLink ? `<a class="btn solid" href="${esc(p.androidLink)}" target="_blank" rel="noopener noreferrer">View on Google Play</a>` : ""}</div>`;
    m.onclick = ev => { if (ev.target === m || ev.target.className === "x") m.remove(); };
    document.body.appendChild(m);
  };
  const refresh = () => { renderGrid(); buildSlides(); };

  /* ---------- auth ---------- */
  function authUI() {
    $("loginBtn").classList.toggle("hidden", admin);
    $("adminBtn").classList.toggle("hidden", !admin);
    $("logoutBtn").classList.toggle("hidden", !admin);
  }
  const open = id => $(id).classList.remove("hidden");
  const close = id => $(id).classList.add("hidden");
  document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => b.closest(".modal").classList.add("hidden"));
  $("loginBtn").onclick = () => { $("loginErr").textContent = ""; open("loginModal"); $("uid").focus(); };
  $("loginForm").onsubmit = async e => {
    e.preventDefault();
    try {
      await api("login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: $("uid").value.trim(), password: $("pwd").value }) });
      $("pwd").value = ""; admin = true; close("loginModal"); authUI(); openAdmin();
    } catch (err) { $("loginErr").textContent = err.message; }
  };
  $("logoutBtn").onclick = async () => { await api("logout", { method: "POST" }).catch(() => {}); admin = false; authUI(); close("adminModal"); };
  $("adminBtn").onclick = openAdmin;

  /* ---------- dashboard ---------- */
  const save = async () => { const r = await api("projects", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(projects) }); projects = r.projects; refresh(); drawList(); };
  function openAdmin() { clearForm(); drawList(); open("adminModal"); }
  function updateAndroidField() { $("androidLinkWrap").classList.toggle("hidden", $("pcat").value !== "Android App"); }
  $("pcat").onchange = updateAndroidField;
  function drawThumbs() { $("thumbs").innerHTML = pending.map((p, i) => `<div style="background-image:url('${esc(p)}')"><button type="button" data-i="${i}">&times;</button></div>`).join(""); }
  $("thumbs").onclick = e => { if (e.target.dataset.i) { pending.splice(+e.target.dataset.i, 1); drawThumbs(); } };
  $("pfiles").onchange = async e => {
    const files = [...e.target.files]; e.target.value = "";
    $("saveBtn").disabled = true; const old = $("saveBtn").textContent;
    try {
      for (let i = 0; i < files.length; i++) {
        $("saveBtn").textContent = `Uploading ${i + 1}/${files.length}…`;
        const blob = await shrink(files[i]);
        const r = await api("upload", { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob });
        pending.push(r.url); drawThumbs();
      }
    } catch (err) { alert(err.message); }
    $("saveBtn").disabled = false; $("saveBtn").textContent = old;
  };
  function clearForm() { $("projForm").reset(); $("pid").value = ""; $("androidLink").value = ""; pending = []; drawThumbs(); updateAndroidField(); $("saveBtn").textContent = "Save project"; }
  $("resetForm").onclick = clearForm;
  $("projForm").onsubmit = async e => {
    e.preventEventDefault();
    const id = $("pid").value || ("p" + Date.now());
    const category = $("pcat").value;
    const androidLink = category === "Android App" ? $("pandroidlink").value.trim() : "";
    const rec = { id, name: $("pname").value.trim(), category, androidLink, description: $("pdesc").value.trim(), photos: [...pending], slide: $("pslide").checked };
    const i = projects.findIndex(p => p.id === id);
    i >= 0 ? projects[i] = rec : projects.unshift(rec);
    try { await save(); clearForm(); } catch (err) { alert(err.message); }
  };
  function drawList() {
    $("plist").innerHTML = projects.map(p => `
      <div class="it"><div><b>${esc(p.name)}</b><br><span>${esc(p.category)} · ${p.photos?.length || 0} photo(s)</span></div>
      <div><button data-e="${esc(p.id)}">Edit</button><button data-d="${esc(p.id)}">Delete</button></div></div>`).join("") || "<p class='empty'>No projects yet.</p>";
  }
  $("plist").onclick = async e => {
    const ed = e.target.dataset.e, del = e.target.dataset.d;
    if (ed) {
      const p = projects.find(x => x.id === ed);
      $("pid").value = p.id; $("pname").value = p.name; $("pcat").value = p.category; $("pandroidlink").value = p.androidLink || ""; $("pdesc").value = p.description || "";
      $("pslide").checked = p.slide !== false; pending = [...(p.photos || [])]; updateAndroidField(); drawThumbs(); $("saveBtn").textContent = "Update project";
      $("projForm").scrollIntoView({ behavior: "smooth" });
    }
    if (del && confirm("Delete this project?")) { projects = projects.filter(x => x.id !== del); try { await save(); } catch (err) { alert(err.message); } }
  };

  /* ---------- misc / start ---------- */
  addEventListener("scroll", () => $("nav").classList.toggle("solid", scrollY > 60));
  $("yr").textContent = new Date().getFullYear();
  $("mailLink").href = "mailto:" + S.email; $("mailLink").textContent = S.email;
  (async () => {
    try { projects = await api("projects"); } catch { projects = []; }
    try { admin = (await api("me")).admin; } catch { admin = false; }
    authUI(); refresh();
  })();
})();
