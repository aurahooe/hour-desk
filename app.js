const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const FALLBACK = [
  ["The blotter drinks the light", "Paper holds more than ink. It holds the pause between two hours."],
  ["A window left a square on the desk", "If you write now, you are writing into a room that already exists."],
  ["Someone sharpened a pencil and left", "The shavings are gone. The point remains. Use it."],
  ["Rain on the glass, dry on the page", "Public notes are pins. Private notes are pockets."],
  ["The hour is a thin envelope", "Slip a sentence in before it closes."]
];

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let mode = "login";
let me = null;

function pad(n) { return String(n).padStart(2, "0"); }
function hourKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}`;
}

function tick() {
  const d = new Date();
  document.getElementById("face").textContent =
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const next = new Date(d);
  next.setMinutes(60, 0, 0);
  const left = Math.max(0, next - d);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  document.getElementById("until").textContent = `${pad(m)}:${pad(s)}`;
}

function setAuthBar(user) {
  const bar = document.getElementById("authbar");
  if (!user) {
    bar.innerHTML = `<button type="button" class="ghost" data-open="login">Sign in</button>
      <button type="button" class="ink" data-open="signup">Open a desk</button>`;
    document.getElementById("composer").hidden = true;
    document.getElementById("drawer").hidden = true;
    return;
  }
  bar.innerHTML = `<span class="who">signed in</span>
    <button type="button" class="ghost" id="signout">Leave the desk</button>`;
  document.getElementById("composer").hidden = false;
  document.getElementById("drawer").hidden = false;
  document.getElementById("signout").onclick = async () => {
    await sb.auth.signOut();
  };
}

async function loadFeature() {
  const key = hourKey();
  const { data } = await sb.from("hour_features").select("title,body,hour_key").eq("hour_key", key).maybeSingle();
  const slot = parseInt(key.slice(-2), 10) % FALLBACK.length;
  const [t, b] = FALLBACK[slot];
  document.getElementById("feat-title").textContent = data?.title || t;
  document.getElementById("feat-body").textContent = data?.body || b;
  document.getElementById("feat-meta").textContent = `hour ${key}`;
}

function renderNotes(el, rows) {
  el.innerHTML = "";
  if (!rows?.length) {
    el.innerHTML = "<li><p>The board is empty. That is allowed.</p></li>";
    return;
  }
  rows.forEach((n, i) => {
    const li = document.createElement("li");
    li.style.setProperty("--tilt", `${((i % 5) - 2) * 0.35}deg`);
    const handle = n.profiles?.handle || "anonymous blotter";
    const when = new Date(n.created_at).toLocaleString();
    li.innerHTML = `<p>${escapeHtml(n.body)}</p><div class="who">${escapeHtml(handle)} · ${when}${n.is_public ? " · public" : " · drawer"}</div>`;
    el.appendChild(li);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadBoard() {
  const { data } = await sb
    .from("notes")
    .select("id,body,is_public,created_at,profiles(handle)")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(40);
  renderNotes(document.getElementById("board"), data || []);
}

async function loadMine() {
  if (!me) return;
  const { data } = await sb
    .from("notes")
    .select("id,body,is_public,created_at,profiles(handle)")
    .eq("user_id", me.id)
    .order("created_at", { ascending: false })
    .limit(40);
  renderNotes(document.getElementById("mine"), data || []);
}

async function refresh() {
  await Promise.all([loadFeature(), loadBoard(), loadMine()]);
}

document.addEventListener("click", (e) => {
  const open = e.target.closest("[data-open]");
  if (!open) return;
  mode = open.dataset.open;
  document.getElementById("dlg-title").textContent = mode === "signup" ? "Open a desk" : "Sign in";
  document.getElementById("dlg-hint").textContent = mode === "signup"
    ? "A password of six characters or more. That is the whole ceremony."
    : "Use the same email you opened the desk with.";
  document.getElementById("auth-err").hidden = true;
  document.getElementById("dialog").showModal();
});

document.getElementById("auth-form").addEventListener("submit", async (e) => {
  if (e.submitter && e.submitter.value === "cancel") return;
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const err = document.getElementById("auth-err");
  try {
    if (mode === "signup") {
      const { error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    document.getElementById("dialog").close();
  } catch (ex) {
    err.hidden = false;
    err.textContent = ex.message || "That did not work.";
  }
});

document.getElementById("note-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!me) return;
  const body = document.getElementById("body").value.trim();
  const is_public = document.getElementById("is_public").checked;
  if (!body) return;
  const { error } = await sb.from("notes").insert({ user_id: me.id, body, is_public });
  if (error) {
    alert(error.message);
    return;
  }
  document.getElementById("body").value = "";
  document.getElementById("is_public").checked = false;
  await refresh();
});

sb.auth.onAuthStateChange(async (_evt, session) => {
  me = session?.user || null;
  setAuthBar(me);
  await refresh();
});

tick();
setInterval(tick, 1000);
setInterval(loadFeature, 30000);
refresh();
