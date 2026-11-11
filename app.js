/* Photo translation study (2AFC). The input photo is shown on top, two translations
 * of it (options A and B, two of the four methods) below. The 108 trials are the same
 * for everybody (trials.json); design.js shuffles their order and the A/B placement
 * per participant. Answers are kept in localStorage after every click, so a reload
 * resumes, and are POSTed to a Google Apps Script at the end. */
(function () {
  "use strict";
  const CFG = window.STUDY_CONFIG;
  const D = window.StudyDesign;
  const STORE_KEY = "pts_state_" + CFG.STUDY_ID;
  const $ = (id) => document.getElementById(id);
  const PREVIEW = new URLSearchParams(location.search).get("preview"); // welcome|guide|trial|done, nothing stored

  let DATA = null, S = null, cur = null, accepting = false, t0 = 0;

  // ------------------------------------------------------------------ helpers
  const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const article = (w) => (/^[aeiou]/i.test(w) ? "an " : "a ") + w;
  function save() { if (PREVIEW) return; try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {} }
  function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; } }
  function forget() { try { localStorage.removeItem(STORE_KEY); } catch (e) {} }
  function show(id) {
    ["p-welcome", "p-guide", "p-trial", "p-done"].forEach((p) => ($(p).hidden = p !== id));
    window.scrollTo(0, 0);
  }

  function newSession() {
    S = {
      session_id: uuid(), participant: "", expertise: "", started_at: new Date().toISOString(),
      seq: D.buildSession(DATA, Math.random), step: "welcome", idx: 0, answers: [],
    };
  }

  function preload(onProgress) {
    const urls = [...new Set(S.seq.flatMap((t) => [t.input, t.left_src, t.right_src]))];
    let done = 0;
    return Promise.all(urls.map((u) => new Promise((res) => {
      const im = new Image();
      im.onload = im.onerror = () => { onProgress(++done, urls.length); res(); };
      im.src = u;
    })));
  }

  // ------------------------------------------------------------------- trials
  async function nextTrial() {
    if (S.idx >= S.seq.length) return finish();
    cur = S.seq[S.idx];
    const arena = document.querySelector(".arena");
    arena.classList.add("blank");
    $("opt-left").classList.remove("picked");
    $("opt-right").classList.remove("picked");
    $("counter").textContent = `${S.idx + 1} / ${S.seq.length}`;
    $("progress").style.width = (100 * S.idx / S.seq.length) + "%";
    $("question").innerHTML = `Which is the better <b>${cur.target}</b> version of this ${cur.source}?`;
    const imgs = [[$("img-input"), cur.input], [$("img-left"), cur.left_src], [$("img-right"), cur.right_src]];
    imgs.forEach(([el, src]) => (el.src = src));
    await Promise.all([wait(CFG.ISI_MS), ...imgs.map(([el]) => (el.decode ? el.decode().catch(() => {}) : null))]);
    arena.classList.remove("blank");
    requestAnimationFrame(() => { t0 = performance.now(); accepting = true; });
  }

  async function pick(side, how) {
    if (!accepting || !cur || PREVIEW) return;
    accepting = false;
    const rt = Math.round(performance.now() - t0);
    const chosen = side === "left" ? cur.left_method : cur.right_method;
    S.answers.push({
      study_id: CFG.STUDY_ID, session_id: S.session_id, participant: S.participant,
      expertise: S.expertise, phase: "main", trial_index: S.idx + 1,
      trial_id: cur.trial_id, task: cur.task,
      left_method: cur.left_method, right_method: cur.right_method,
      chosen_side: side, chosen_method: chosen,
      other_method: side === "left" ? cur.right_method : cur.left_method,
      input: how, rt_ms: rt, timestamp: new Date().toISOString(),
      win_w: window.innerWidth, win_h: window.innerHeight,
    });
    S.idx++;
    save();
    $(side === "left" ? "opt-left" : "opt-right").classList.add("picked");
    await wait(160);
    nextTrial();
  }

  function finish() {
    cur = null;
    S.step = "done"; S.finished_at = new Date().toISOString(); save();
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    show("p-done");
    send();
  }

  // ------------------------------------------------------------ send / export
  function sessionRecord() {
    const rts = S.answers.map((r) => r.rt_ms).sort((a, b) => a - b);
    return {
      study_id: CFG.STUDY_ID, session_id: S.session_id, participant: S.participant,
      expertise: S.expertise, started_at: S.started_at, finished_at: S.finished_at || "",
      duration_s: S.finished_at ? Math.round((new Date(S.finished_at) - new Date(S.started_at)) / 1000) : "",
      n_main_trials: S.answers.length, median_rt_ms: rts.length ? rts[Math.floor(rts.length / 2)] : "",
      screen: `${screen.width}x${screen.height}`, dpr: window.devicePixelRatio,
      user_agent: navigator.userAgent, language: navigator.language,
      timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone || ""), resumed: S.resumed || 0,
    };
  }

  async function send() {
    const status = $("upload-status");
    if (!CFG.ENDPOINT_URL) {
      status.textContent = "Online saving is switched off. Please download your answers below.";
      $("download-box").hidden = false;
      return;
    }
    $("btn-submit").hidden = true;
    status.textContent = "Saving your answers…";
    const body = JSON.stringify({ session: sessionRecord(), rows: S.answers });
    try {
      // text/plain keeps this a "simple" request, so Apps Script needs no CORS preflight
      const r = await fetch(CFG.ENDPOINT_URL, { method: "POST", body, headers: { "Content-Type": "text/plain;charset=utf-8" } });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "server error");
      S.uploaded = true; save();
      status.textContent = "Your answers are saved. You can close this tab.";
      forget();
    } catch (e) {
      // second try without CORS; the reply is unreadable but the data normally arrives.
      // Possible duplicates are dropped in the analysis (session_id + trial_index).
      try {
        await fetch(CFG.ENDPOINT_URL, { method: "POST", body, mode: "no-cors" });
        status.textContent = "Answers sent. To be safe, please also download them below.";
      } catch (e2) {
        status.textContent = "Could not send your answers (" + e.message + ").";
      }
      $("download-box").hidden = false;
      $("btn-submit").hidden = false;
    }
  }

  function downloadCSV() {
    const ses = sessionRecord();
    const rows = S.answers.map((r) => ({ ...r, screen: ses.screen, dpr: ses.dpr, user_agent: ses.user_agent }));
    const cols = Object.keys(rows[0] || {});
    const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = [cols.join(",")].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(","))).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${CFG.STUDY_ID}_${(S.participant || "anon").replace(/\W+/g, "_")}_${S.session_id.slice(0, 8)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ------------------------------------------------------------------- flow
  function toGuide() {
    S.step = "guide"; save();
    show("p-guide");
    preload((d, n) => {
      $("load-bar").style.width = (100 * d / n) + "%";
      $("load-text").textContent = d < n ? `Preparing images… ${d} of ${n}` : "Ready when you are.";
    }).then(() => ($("btn-start").disabled = false));
  }

  function startTrials() {
    const el = document.documentElement;
    if ($("fs").checked && el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    S.step = "trials"; save();
    show("p-trial");
    nextTrial();
  }

  function resume(prev) {
    S = prev; S.resumed = (S.resumed || 0) + 1; save();
    if (S.step === "guide") return toGuide();
    if (S.step === "done") { show("p-done"); return send(); }
    preload(() => {}).then(() => { show("p-trial"); nextTrial(); });
  }

  function init() {
    $("n-total").textContent = DATA.trials.length;
    if (CFG.CONTACT) $("contact").textContent = "Questions? " + CFG.CONTACT;
    if (window.innerWidth < 900) $("narrow-warning").hidden = false;

    if (PREVIEW) {
      newSession();
      if (PREVIEW === "trial") { show("p-trial"); return nextTrial(); }
      if (PREVIEW === "guide") return toGuide();
      if (PREVIEW === "done") { S.answers = []; show("p-done"); return send(); }
      return show("p-welcome");
    }

    const prev = load();
    if (prev && prev.session_id && !prev.uploaded && prev.step !== "welcome") $("resume-box").hidden = false;
    $("btn-resume").onclick = () => resume(prev);
    $("btn-restart").onclick = () => { forget(); $("resume-box").hidden = true; };

    let expertise = "";
    const ready = () => ($("btn-welcome").disabled = !($("consent").checked && $("pid").value.trim() && expertise));
    document.querySelectorAll("#expertise button").forEach((b) => (b.onclick = () => {
      document.querySelectorAll("#expertise button").forEach((x) => x.classList.toggle("on", x === b));
      expertise = b.dataset.v; ready();
    }));
    $("pid").oninput = ready;
    $("consent").onchange = ready;
    $("btn-welcome").onclick = () => {
      newSession();
      S.participant = $("pid").value.trim();
      S.expertise = expertise;
      toGuide();
    };
    $("btn-start").onclick = startTrials;
    $("opt-left").onclick = () => pick("left", "click");
    $("opt-right").onclick = () => pick("right", "click");
    document.addEventListener("keydown", (e) => {
      if (e.repeat || $("p-trial").hidden) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); pick("left", "key"); }
      else if (e.key === "ArrowRight") { e.preventDefault(); pick("right", "key"); }
    });
    $("btn-submit").onclick = send;
    $("btn-download").onclick = downloadCSV;
    window.addEventListener("beforeunload", (e) => {
      if (S && S.step === "trials") { e.preventDefault(); e.returnValue = ""; }
    });
  }

  fetch("trials.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((d) => { DATA = d; init(); })
    .catch(() => { document.body.innerHTML = "<p style='padding:2em'>The study could not be loaded. Please reload the page.</p>"; });
})();
