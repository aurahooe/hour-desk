const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
let session = null;
const $ = (id) => document.getElementById(id);
function tick() {
  const n = new Date();
  $("clock").textContent = n.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
async function loadEdition() {
  const { data } = await sb.from("hourdesk_editions").select("*").order("created_at", { ascending: false }).limit(1);
  const ed = data && data[0];
  if (!ed) { $("edTitle").textContent = "The desk is clearing its throat"; $("edBody").textContent = "The first hourly edition will land on the hour."; return; }
  $("edKicker").textContent = ed.kicker || "This hour";
  $("edTitle").textContent = ed.title;
  $("edBody").textContent = ed.body;
  $("edMeta").textContent = "Filed " + ed.hour_key;
}
function escapeHtml(s) { return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function cardHTML(slip, extra = "") {
  const tilt = ((slip.title.length % 7) - 3) * 0.35;
  const when = new Date(slip.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `<article class="card" style="--tilt:${tilt}deg"><h3>${escapeHtml(slip.title)}</h3><p>${escapeHtml(slip.body)}</p><div class="meta">${slip.is_public ? "Public" : "Private"} · ${when}${extra}</div></article>`;
}
async function loadWall() {
  const { data } = await sb.from("hourdesk_slips").select("*").eq("is_public", true).order("created_at", { ascending: false }).limit(40);
  $("wallGrid").innerHTML = (data || []).map((s) => cardHTML(s)).join("") || `<p class="fine">The wall is empty. File something public.</p>`;
}
async function loadMine() {
  if (!session) { $("slipForm").classList.add("hidden"); $("deskGate").classList.remove("hidden"); $("mySlips").innerHTML = ""; return; }
  $("slipForm").classList.remove("hidden"); $("deskGate").classList.add("hidden");
  const { data } = await sb.from("hourdesk_slips").select("*").eq("author_id", session.user.id).order("created_at", { ascending: false });
  $("mySlips").innerHTML = (data || []).map((s) => cardHTML(s, ` · <button data-toggle="${s.id}" data-pub="${s.is_public}">${s.is_public ? "Make private" : "Make public"}</button>`)).join("");
}
function setAuthUi() { $("authBtn").textContent = session ? "Sign out" : "Sign in"; }
async function refreshAuth() { const { data } = await sb.auth.getSession(); session = data.session; setAuthUi(); await loadMine(); }
$("authBtn").onclick = async () => {
  if (session) { await sb.auth.signOut(); session = null; setAuthUi(); await loadMine(); return; }
  $("authModal").classList.remove("hidden");
};
$("closeAuth").onclick = () => $("authModal").classList.add("hidden");
$("authForm").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("email").value.trim();
  const password = $("password").value;
  $("authMsg").textContent = "Working…";
  if (!password) {
    const { error } = await sb.auth.signInWithOtp({ email });
    $("authMsg").textContent = error ? error.message : "Check your inbox for the link.";
    return;
  }
  let { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    const signed = await sb.auth.signUp({ email, password });
    error = signed.error;
    $("authMsg").textContent = error ? error.message : "Account created. Confirm email if asked, then sign in.";
    if (!error && signed.data.session) { session = signed.data.session; $("authModal").classList.add("hidden"); setAuthUi(); await loadMine(); }
    return;
  }
  session = (await sb.auth.getSession()).data.session;
  $("authModal").classList.add("hidden"); setAuthUi(); await loadMine();
};
$("passBtn").onclick = () => { if (!$("password").value) { $("authMsg").textContent = "Add a password first."; return; } $("authForm").requestSubmit(); };
$("slipForm").onsubmit = async (e) => {
  e.preventDefault(); if (!session) return;
  const { error } = await sb.from("hourdesk_slips").insert({ author_id: session.user.id, title: $("slipTitle").value.trim(), body: $("slipBody").value.trim(), is_public: $("slipPublic").checked });
  if (error) { alert(error.message); return; }
  $("slipForm").reset(); await Promise.all([loadMine(), loadWall()]);
};
$("mySlips").onclick = async (e) => {
  const btn = e.target.closest("[data-toggle]"); if (!btn) return;
  const id = btn.getAttribute("data-toggle"); const pub = btn.getAttribute("data-pub") === "true";
  await sb.from("hourdesk_slips").update({ is_public: !pub, updated_at: new Date().toISOString() }).eq("id", id);
  await Promise.all([loadMine(), loadWall()]);
};
document.querySelectorAll("[data-goto]").forEach((b) => { b.onclick = () => document.getElementById(b.dataset.goto).scrollIntoView({ behavior: "smooth" }); });
sb.auth.onAuthStateChange((_e, s) => { session = s; setAuthUi(); loadMine(); });
tick(); setInterval(tick, 1000); loadEdition(); loadWall(); refreshAuth(); setInterval(loadEdition, 60000);
