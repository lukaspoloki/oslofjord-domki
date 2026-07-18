#!/usr/bin/env node
/**
 * Oslofjord domki — prywatny bot Telegram do zarządzania listą mieszkańców.
 *
 * Dane trzymane są w data.json w repozytorium GitHub; każda zmiana to commit,
 * a GitHub Pages automatycznie publikuje nową wersję mapy.
 *
 * Zero zależności — wymaga tylko Node.js >= 18. Uruchomienie: node bot.js
 * Konfiguracja: plik .env obok bot.js (patrz .env.example).
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ── konfiguracja (.env) ─────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID  = Number(process.env.ALLOWED_USER_ID || 0);
const REPO      = process.env.GITHUB_REPO;              // np. lukaspoloki/oslofjord-domki
const GH_TOKEN  = process.env.GITHUB_TOKEN;
const BRANCH    = process.env.GITHUB_BRANCH || "main";
const DATA_PATH = process.env.DATA_PATH || "data.json";

if (!BOT_TOKEN) { console.error("Brak BOT_TOKEN w .env"); process.exit(1); }
if (!REPO || !GH_TOKEN) { console.error("Brak GITHUB_REPO lub GITHUB_TOKEN w .env"); process.exit(1); }
if (!OWNER_ID) console.warn("⚠️  ALLOWED_USER_ID nie ustawione — bot będzie tylko podawał ID piszących.");

// ── pomocnicze ──────────────────────────────────────────────────────
class UserError extends Error {}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc  = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "")
                   .replace(/ł/g, "l").replace(/Ł/g, "L").toLowerCase().trim();
const coll = new Intl.Collator("pl", { numeric: true });
const RE_APT = "([0-9]+[a-zA-Z]?)";

function parseAddr(s) {
  const m = String(s).trim().match(new RegExp(`^(\\d+)\\s*/\\s*${RE_APT}$`));
  return m ? { b: m[1], apt: m[2].toUpperCase() } : null;
}
function cleanName(s) {
  const name = String(s).replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.includes("/")) throw new UserError("To nie wygląda na imię i nazwisko: " + esc(name));
  return name;
}
const findApt = (d, b, apt) => d.apartments.find(a => a.building === b && a.apt === apt);
const bLabel  = b => `Oslofjordveien ${b}`;
function findPeople(d, q) {
  const nq = norm(q), out = [];
  for (const a of d.apartments)
    a.residents.forEach((name, i) => { if (norm(name).includes(nq)) out.push({ a, name, i }); });
  // dokładne trafienie ma pierwszeństwo
  const exact = out.filter(x => norm(x.name) === nq);
  return exact.length ? exact : out;
}
function sortData(d) {
  d.apartments.sort((x, y) => Number(x.building) - Number(y.building) || coll.compare(x.apt, y.apt));
  for (const a of d.apartments) a.residents.sort(coll.compare);
}
function byBuilding(d) {
  const m = {};
  for (const a of d.apartments) (m[a.building] ??= []).push(a);
  return m;
}
const nPeople = d => d.apartments.reduce((n, a) => n + a.residents.length, 0);
const statsLine = d =>
  `${nPeople(d)} osób · ${d.apartments.length} mieszkań · ${Object.keys(byBuilding(d)).length} budynków`;

// ── GitHub: data.json jako źródło prawdy ────────────────────────────
const GH = "https://api.github.com";
const ghHeaders = {
  authorization: `Bearer ${GH_TOKEN}`,
  accept: "application/vnd.github+json",
  "user-agent": "oslofjord-bot",
  "content-type": "application/json",
};

async function loadData() {
  const res = await fetch(`${GH}/repos/${REPO}/contents/${DATA_PATH}?ref=${BRANCH}`, { headers: ghHeaders });
  if (!res.ok) throw new Error(`GitHub GET ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const file = await res.json();
  return { data: JSON.parse(Buffer.from(file.content, "base64").toString("utf8")), sha: file.sha };
}
async function saveData(data, sha, message) {
  const body = {
    message, branch: BRANCH, sha,
    content: Buffer.from(JSON.stringify(data, null, 2) + "\n").toString("base64"),
  };
  const res = await fetch(`${GH}/repos/${REPO}/contents/${DATA_PATH}`,
    { method: "PUT", headers: ghHeaders, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`GitHub PUT ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
/** Wczytaj → zmodyfikuj → zapisz (commit). fn zwraca { commit, reply }. */
async function withData(fn) {
  for (let attempt = 0; ; attempt++) {
    const { data, sha } = await loadData();
    const out = fn(data);
    sortData(data);
    try { await saveData(data, sha, out.commit); return out; }
    catch (e) {
      if (attempt === 0 && /PUT 409/.test(String(e.message))) continue; // konflikt sha — ponów raz
      throw e;
    }
  }
}

// ── operacje na danych ──────────────────────────────────────────────
function requireBuilding(d, b) {
  if (!d.buildings[b]) throw new UserError(
    `Nie ma budynku <b>${esc(b)}</b>. Istniejące: ${Object.keys(d.buildings).sort((x, y) => x - y).join(", ")}\n` +
    `Nowy budynek: <code>budynek ${esc(b)} 59.2300 10.3620</code> (lat lng)`);
}
function opAddPerson(d, b, apt, rawName) {
  requireBuilding(d, b);
  const name = cleanName(rawName);
  let a = findApt(d, b, apt);
  const created = !a;
  if (!a) { a = { building: b, apt, residents: [] }; d.apartments.push(a); }
  if (a.residents.some(r => norm(r) === norm(name)))
    throw new UserError(`${esc(name)} już mieszka w ${b}/${apt}.`);
  a.residents.push(name);
  return { commit: `bot: +${name} (${b}/${apt})`,
           reply: `✅ Dodano <b>${esc(name)}</b> → ${b}/${apt}${created ? " (nowe mieszkanie)" : ""}` };
}
function residentAt(d, b, apt, i) {
  const a = findApt(d, b, apt);
  const name = a?.residents[i];
  if (name == null) throw new UserError("Dane się zmieniły — otwórz /menu jeszcze raz.");
  return { a, name };
}
function opRemovePerson(d, b, apt, i) {
  const { a, name } = residentAt(d, b, apt, i);
  a.residents.splice(i, 1);
  let extra = "";
  if (a.residents.length === 0) {
    d.apartments.splice(d.apartments.indexOf(a), 1);
    extra = ` — mieszkanie ${b}/${apt} było puste, więc też je usunięto`;
  }
  return { commit: `bot: -${name} (${b}/${apt})`,
           reply: `🗑 Usunięto <b>${esc(name)}</b> z ${b}/${apt}${extra}.` };
}
function opRenamePerson(d, b, apt, i, rawName) {
  const { a, name } = residentAt(d, b, apt, i);
  const newName = cleanName(rawName);
  a.residents[i] = newName;
  return { commit: `bot: ${name} -> ${newName} (${b}/${apt})`,
           reply: `✏️ <b>${esc(name)}</b> → <b>${esc(newName)}</b> (${b}/${apt})` };
}
function opMovePerson(d, b, apt, i, tb, tapt) {
  const { a, name } = residentAt(d, b, apt, i);
  if (b === tb && apt === tapt) throw new UserError("To to samo mieszkanie.");
  requireBuilding(d, tb);
  a.residents.splice(i, 1);
  let extra = "";
  if (a.residents.length === 0) {
    d.apartments.splice(d.apartments.indexOf(a), 1);
    extra = ` (puste ${b}/${apt} usunięto)`;
  }
  let t = findApt(d, tb, tapt);
  if (!t) { t = { building: tb, apt: tapt, residents: [] }; d.apartments.push(t); extra += " (nowe mieszkanie)"; }
  if (t.residents.some(r => norm(r) === norm(name)))
    throw new UserError(`${esc(name)} już mieszka w ${tb}/${tapt}.`);
  t.residents.push(name);
  return { commit: `bot: ${name} ${b}/${apt} -> ${tb}/${tapt}`,
           reply: `🔀 <b>${esc(name)}</b>: ${b}/${apt} → ${tb}/${tapt}${extra}` };
}
function opRenameApt(d, b, apt, nb, napt) {
  const a = findApt(d, b, apt);
  if (!a) throw new UserError(`Nie ma mieszkania ${b}/${apt}.`);
  requireBuilding(d, nb);
  if (findApt(d, nb, napt)) throw new UserError(`Mieszkanie ${nb}/${napt} już istnieje.`);
  a.building = nb; a.apt = napt;
  return { commit: `bot: ${b}/${apt} -> ${nb}/${napt}`,
           reply: `✏️ Mieszkanie ${b}/${apt} → <b>${nb}/${napt}</b> (${a.residents.map(esc).join(", ")})` };
}
function opDeleteApt(d, b, apt) {
  const a = findApt(d, b, apt);
  if (!a) throw new UserError(`Nie ma mieszkania ${b}/${apt}.`);
  d.apartments.splice(d.apartments.indexOf(a), 1);
  return { commit: `bot: usunieto ${b}/${apt}`,
           reply: `🗑 Usunięto mieszkanie <b>${b}/${apt}</b> (${a.residents.map(esc).join(", ") || "puste"}).` };
}
function opAddBuilding(d, b, lat, lng) {
  if (d.buildings[b]) throw new UserError(`Budynek ${esc(b)} już istnieje.`);
  d.buildings[b] = { lat, lng };
  return { commit: `bot: +budynek ${b}`,
           reply: `🏢 Dodano budynek <b>${esc(b)}</b> (${lat}, ${lng}).` };
}

// ── Telegram API ────────────────────────────────────────────────────
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
async function tg(method, params = {}) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`TG ${method}: ${data.description || res.status}`);
  return data.result;
}
const send = (chatId, text, kb) =>
  tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML",
                      ...(kb ? { reply_markup: { inline_keyboard: kb } } : {}) });
async function view(chatId, mid, text, kb) {
  const params = { chat_id: chatId, text, parse_mode: "HTML",
                   reply_markup: { inline_keyboard: kb || [] } };
  if (mid) {
    try { return await tg("editMessageText", { ...params, message_id: mid }); }
    catch (e) { if (/not modified/.test(e.message)) return; }
  }
  return send(chatId, text, kb);
}
const chunk = (arr, n) => arr.reduce((rows, x, i) => (i % n ? rows[rows.length - 1].push(x) : rows.push([x]), rows), []);

// ── widoki (menu przyciskowe) ───────────────────────────────────────
const HELP = `🏘 <b>Oslofjord domki — bot</b>

Menu przyciskowe: /menu

Szybkie komendy (bez ukośnika):
• <code>dodaj 3/203 Anna Kowalska</code> — dodaj osobę (utworzy mieszkanie, jeśli trzeba)
• <code>usuń Anna Kowalska</code> — usuń osobę
• <code>usuń 3/203</code> — usuń całe mieszkanie
• <code>przenieś Anna Kowalska 2/417</code> — przenieś osobę
• <code>zmień 3/203 3/204</code> — zmień numer mieszkania
• <code>lista</code> / <code>lista 3</code> — wszystko / tylko budynek 3
• <code>budynek 26 59.2290 10.3615</code> — dodaj budynek (lat lng)
• dowolny inny tekst — szukanie osoby

Każda zmiana = commit na GitHubie; mapa odświeża się po ~1–2 min.
/anuluj — przerwij bieżącą operację`;

function mainMenuView(d) {
  return {
    text: `🏘 <b>Oslofjord domki</b>\n${statsLine(d)}`,
    kb: [
      [{ text: "🏢 Budynki", callback_data: "B" }, { text: "📋 Lista", callback_data: "list" }],
      [{ text: "🔍 Szukaj", callback_data: "find" }, { text: "➕ Dodaj osobę", callback_data: "qa" }],
      [{ text: "ℹ️ Pomoc", callback_data: "help" }],
    ],
  };
}
function buildingsView(d) {
  const by = byBuilding(d);
  const btns = Object.keys(d.buildings)
    .sort((x, y) => Number(x) - Number(y))
    .map(b => {
      const ppl = (by[b] || []).reduce((n, a) => n + a.residents.length, 0);
      return { text: `${b} · ${ppl}👤`, callback_data: `b|${b}` };
    });
  return { text: "🏢 <b>Budynki</b> (Oslofjordveien)\nWybierz budynek:",
           kb: [...chunk(btns, 3), [{ text: "⬅️ Menu", callback_data: "m" }]] };
}
function buildingView(d, b) {
  const apts = byBuilding(d)[b] || [];
  const lines = apts.map(a => `• <b>${a.apt}</b> — ${a.residents.map(esc).join(", ")}`);
  const btns = apts.map(a => ({ text: `m. ${a.apt} (${a.residents.length} os.)`, callback_data: `a|${b}|${a.apt}` }));
  return {
    text: `🏢 <b>${bLabel(b)}</b>\n${lines.join("\n") || "Brak mieszkań."}`,
    kb: [...chunk(btns, 2),
         [{ text: "➕ Nowe mieszkanie", callback_data: `af|${b}` }],
         [{ text: "⬅️ Budynki", callback_data: "B" }]],
  };
}
function aptView(d, b, apt) {
  const a = findApt(d, b, apt);
  if (!a) return buildingView(d, b);
  const floor = apt.match(/^\d/) ? `piętro ${apt[0]}` : "";
  const btns = a.residents.map((r, i) => [{ text: `👤 ${r}`, callback_data: `r|${b}|${apt}|${i}` }]);
  return {
    text: `🚪 <b>${bLabel(b)}, m. ${apt}</b>${floor ? ` (${floor})` : ""}\n` +
          a.residents.map(r => `• ${esc(r)}`).join("\n"),
    kb: [...btns,
         [{ text: "➕ Dodaj osobę", callback_data: `ap|${b}|${apt}` }],
         [{ text: "✏️ Zmień numer", callback_data: `rf|${b}|${apt}` },
          { text: "🗑 Usuń mieszkanie", callback_data: `df|${b}|${apt}` }],
         [{ text: `⬅️ Budynek ${b}`, callback_data: `b|${b}` }]],
  };
}
function personView(d, b, apt, i) {
  const { name } = residentAt(d, b, apt, i);
  return {
    text: `👤 <b>${esc(name)}</b>\n${bLabel(b)}, m. ${apt}`,
    kb: [[{ text: "✏️ Zmień imię", callback_data: `rp|${b}|${apt}|${i}` },
          { text: "🔀 Przenieś", callback_data: `mp|${b}|${apt}|${i}` }],
         [{ text: "🗑 Usuń", callback_data: `dp|${b}|${apt}|${i}` }],
         [{ text: `⬅️ m. ${apt}`, callback_data: `a|${b}|${apt}` }]],
  };
}
function listText(d, onlyB) {
  const by = byBuilding(d);
  const keys = Object.keys(by).sort((x, y) => Number(x) - Number(y)).filter(b => !onlyB || b === onlyB);
  if (!keys.length) return onlyB ? `Budynek ${esc(onlyB)} nie ma mieszkań.` : "Brak danych.";
  const parts = keys.map(b =>
    `🏢 <b>${bLabel(b)}</b>\n` + by[b].map(a => `   ${a.apt} — ${a.residents.map(esc).join(", ")}`).join("\n"));
  return parts.join("\n\n") + `\n\n${statsLine(d)}`;
}
function searchResults(d, q) {
  const hits = findPeople(d, q);
  if (!hits.length) return { text: `Nie znaleziono: <b>${esc(q)}</b>`, kb: [[{ text: "⬅️ Menu", callback_data: "m" }]] };
  return {
    text: `🔍 Wyniki dla „${esc(q)}”:`,
    kb: [...hits.slice(0, 20).map(h =>
          [{ text: `👤 ${h.name} — ${h.a.building}/${h.a.apt}`, callback_data: `r|${h.a.building}|${h.a.apt}|${h.i}` }]),
         [{ text: "⬅️ Menu", callback_data: "m" }]],
  };
}

// ── stan oczekiwania na tekst (jeden użytkownik → jedna zmienna) ────
let pending = null;
const CANCEL_KB = [[{ text: "✖️ Anuluj", callback_data: "cancel" }]];
const ask = (chatId, mode, ctx, prompt) => { pending = { mode, ...ctx }; return send(chatId, prompt, CANCEL_KB); };

async function handlePending(chatId, text) {
  const p = pending; pending = null;
  const backApt = (b, apt) => [[{ text: "⬅️ Wróć", callback_data: `a|${b}|${apt}` }]];
  switch (p.mode) {
    case "search": {
      const { data } = await loadData();
      const r = searchResults(data, text);
      return send(chatId, r.text, r.kb);
    }
    case "quickAdd": {
      const m = text.match(new RegExp(`^(\\d+)\\s*/\\s*${RE_APT}\\s+(.+)$`));
      if (!m) throw new UserError("Format: <code>3/203 Anna Kowalska</code>");
      const out = await withData(d => opAddPerson(d, m[1], m[2].toUpperCase(), m[3]));
      return send(chatId, out.reply, backApt(m[1], m[2].toUpperCase()));
    }
    case "addPerson": {
      const out = await withData(d => opAddPerson(d, p.b, p.apt, text));
      return send(chatId, out.reply, backApt(p.b, p.apt));
    }
    case "addFlatNum": {
      const apt = text.trim().toUpperCase();
      if (!new RegExp(`^${RE_APT}$`).test(apt)) throw new UserError("Podaj sam numer mieszkania, np. <code>203</code>.");
      const { data } = await loadData();
      if (findApt(data, p.b, apt)) throw new UserError(`Mieszkanie ${p.b}/${apt} już istnieje.`);
      return ask(chatId, "addPerson", { b: p.b, apt }, `Numer: <b>${p.b}/${apt}</b>. Teraz podaj imię i nazwisko pierwszej osoby:`);
    }
    case "renameFlat": {
      const t = parseAddr(text) || (new RegExp(`^${RE_APT}$`).test(text.trim()) ? { b: p.b, apt: text.trim().toUpperCase() } : null);
      if (!t) throw new UserError("Format: <code>204</code> (ten sam budynek) albo <code>3/204</code>.");
      const out = await withData(d => opRenameApt(d, p.b, p.apt, t.b, t.apt));
      return send(chatId, out.reply, backApt(t.b, t.apt));
    }
    case "renamePerson": {
      const out = await withData(d => opRenamePerson(d, p.b, p.apt, p.i, text));
      return send(chatId, out.reply, backApt(p.b, p.apt));
    }
    case "movePerson": {
      const t = parseAddr(text);
      if (!t) throw new UserError("Format: <code>2/417</code> (budynek/mieszkanie).");
      const out = await withData(d => opMovePerson(d, p.b, p.apt, p.i, t.b, t.apt));
      return send(chatId, out.reply, backApt(t.b, t.apt));
    }
  }
}

// ── obsługa wiadomości tekstowych ───────────────────────────────────
async function onMessage(msg) {
  const chatId = msg.chat.id;
  if (!msg.from) return;
  if (!OWNER_ID) return send(chatId,
    `Twoje ID: <code>${msg.from.id}</code>\nWpisz je w .env jako <code>ALLOWED_USER_ID</code> i zrestartuj bota.`);
  if (msg.from.id !== OWNER_ID) return send(chatId, "⛔ Ten bot jest prywatny.");
  const text = (msg.text || "").trim();
  if (!text) return;

  // komendy /
  if (/^\/(start|pomoc|help)\b/i.test(text)) return send(chatId, HELP);
  if (/^\/id\b/i.test(text)) return send(chatId, `Twoje ID: <code>${msg.from.id}</code>`);
  if (/^\/anuluj\b/i.test(text)) { pending = null; return send(chatId, "Anulowano. /menu"); }
  if (/^\/menu\b/i.test(text)) {
    const { data } = await loadData();
    const v = mainMenuView(data);
    return send(chatId, v.text, v.kb);
  }

  // trwa operacja wieloetapowa?
  if (pending) return handlePending(chatId, text);

  let m;
  // lista [budynek]
  if ((m = text.match(/^\/?lista(?:\s+(\d+))?$/i))) {
    const { data } = await loadData();
    return send(chatId, listText(data, m[1]));
  }
  // szukaj <q>
  if ((m = text.match(/^\/?szukaj\s+(.+)$/i))) {
    const { data } = await loadData();
    const r = searchResults(data, m[1]);
    return send(chatId, r.text, r.kb);
  }
  // dodaj 3/203 Anna Kowalska
  if ((m = text.match(new RegExp(`^dodaj\\s+(\\d+)\\s*/\\s*${RE_APT}\\s+(.+)$`, "i")))) {
    const out = await withData(d => opAddPerson(d, m[1], m[2].toUpperCase(), m[3]));
    return send(chatId, out.reply);
  }
  // usuń 3/203  → usuń całe mieszkanie (z potwierdzeniem)
  if ((m = text.match(new RegExp(`^usu[nń]\\s+(\\d+)\\s*/\\s*${RE_APT}\\s*$`, "i")))) {
    const b = m[1], apt = m[2].toUpperCase();
    const { data } = await loadData();
    const a = findApt(data, b, apt);
    if (!a) throw new UserError(`Nie ma mieszkania ${b}/${apt}.`);
    return send(chatId, `Usunąć mieszkanie <b>${b}/${apt}</b> (${a.residents.map(esc).join(", ") || "puste"})?`,
      [[{ text: "✅ Tak, usuń", callback_data: `df!|${b}|${apt}` }, { text: "✖️ Nie", callback_data: "cancel" }]]);
  }
  // usuń 3/203 Anna  |  usuń Anna Kowalska
  if ((m = text.match(/^usu[nń]\s+(.+)$/i))) {
    const arg = m[1].trim();
    const { data } = await loadData();
    let hits;
    const am = arg.match(new RegExp(`^(\\d+)\\s*/\\s*${RE_APT}\\s+(.+)$`));
    if (am) {
      const a = findApt(data, am[1], am[2].toUpperCase());
      hits = a ? findPeople({ apartments: [a] }, am[3]) : [];
    } else hits = findPeople(data, arg);
    if (!hits.length) throw new UserError(`Nie znaleziono osoby: ${esc(arg)}`);
    if (hits.length > 1) return send(chatId, `Kilka osób pasuje do „${esc(arg)}” — wybierz:`,
      hits.slice(0, 20).map(h => [{ text: `🗑 ${h.name} — ${h.a.building}/${h.a.apt}`,
                                    callback_data: `dp|${h.a.building}|${h.a.apt}|${h.i}` }]));
    const h = hits[0];
    return send(chatId, `Usunąć <b>${esc(h.name)}</b> z ${h.a.building}/${h.a.apt}?`,
      [[{ text: "✅ Tak, usuń", callback_data: `dp!|${h.a.building}|${h.a.apt}|${h.i}` },
        { text: "✖️ Nie", callback_data: "cancel" }]]);
  }
  // przenieś Anna Kowalska 2/417
  if ((m = text.match(new RegExp(`^przenie[sś]\\s+(.+?)\\s+(\\d+)\\s*/\\s*${RE_APT}\\s*$`, "i")))) {
    const { data } = await loadData();
    const hits = findPeople(data, m[1]);
    if (!hits.length) throw new UserError(`Nie znaleziono osoby: ${esc(m[1])}`);
    if (hits.length > 1) throw new UserError(`Kilka osób pasuje do „${esc(m[1])}” — doprecyzuj albo użyj /menu.`);
    const h = hits[0];
    const out = await withData(d => opMovePerson(d, h.a.building, h.a.apt, h.i, m[2], m[3].toUpperCase()));
    return send(chatId, out.reply);
  }
  // zmień 3/203 3/204
  if ((m = text.match(new RegExp(`^zmie[nń]\\s+(\\d+)\\s*/\\s*${RE_APT}\\s+(\\d+)\\s*/\\s*${RE_APT}\\s*$`, "i")))) {
    const out = await withData(d => opRenameApt(d, m[1], m[2].toUpperCase(), m[3], m[4].toUpperCase()));
    return send(chatId, out.reply);
  }
  // budynek 26 59.2290 10.3615
  if ((m = text.match(/^budynek\s+(\d+[a-zA-Z]?)\s+(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)\s*$/i))) {
    const out = await withData(d => opAddBuilding(d, m[1], Number(m[2]), Number(m[3])));
    return send(chatId, out.reply);
  }
  // cokolwiek innego → szukaj osoby
  const { data } = await loadData();
  const r = searchResults(data, text);
  return send(chatId, r.text, r.kb);
}

// ── obsługa przycisków ──────────────────────────────────────────────
async function onCallback(q) {
  tg("answerCallbackQuery", { callback_query_id: q.id }).catch(() => {});
  if (!q.message || !OWNER_ID || q.from.id !== OWNER_ID) return;
  const chatId = q.message.chat.id, mid = q.message.message_id;
  const [cmd, b, apt, iRaw] = q.data.split("|");
  const i = iRaw == null ? null : Number(iRaw);
  const show = v => view(chatId, mid, v.text, v.kb);
  const fresh = async () => (await loadData()).data;

  switch (cmd) {
    case "m":    return show(mainMenuView(await fresh()));
    case "B":    return show(buildingsView(await fresh()));
    case "b":    return show(buildingView(await fresh(), b));
    case "a":    return show(aptView(await fresh(), b, apt));
    case "r":    return show(personView(await fresh(), b, apt, i));
    case "list": return view(chatId, mid, listText(await fresh()), [[{ text: "⬅️ Menu", callback_data: "m" }]]);
    case "help": return view(chatId, mid, HELP, [[{ text: "⬅️ Menu", callback_data: "m" }]]);
    case "cancel":
      pending = null;
      return view(chatId, mid, "Anulowano.", [[{ text: "⬅️ Menu", callback_data: "m" }]]);

    case "find": return ask(chatId, "search", {}, "🔍 Kogo szukasz? Wpisz imię lub nazwisko:");
    case "qa":   return ask(chatId, "quickAdd", {}, "➕ Wpisz: <code>budynek/mieszkanie Imię Nazwisko</code>\nnp. <code>3/203 Anna Kowalska</code>");
    case "ap":   return ask(chatId, "addPerson", { b, apt }, `➕ Nowa osoba w ${b}/${apt} — podaj imię i nazwisko:`);
    case "af":   return ask(chatId, "addFlatNum", { b }, `🚪 Nowe mieszkanie w ${bLabel(b)} — podaj numer (np. 203):`);
    case "rf":   return ask(chatId, "renameFlat", { b, apt }, `✏️ Nowy numer dla ${b}/${apt} (np. <code>204</code> albo <code>3/204</code>):`);
    case "rp": {
      const { name } = residentAt(await fresh(), b, apt, i);
      return ask(chatId, "renamePerson", { b, apt, i }, `✏️ Nowe imię i nazwisko dla <b>${esc(name)}</b>:`);
    }
    case "mp": {
      const { name } = residentAt(await fresh(), b, apt, i);
      return ask(chatId, "movePerson", { b, apt, i }, `🔀 Dokąd przenieść <b>${esc(name)}</b>? (np. <code>2/417</code>)`);
    }
    case "dp": {
      const { name } = residentAt(await fresh(), b, apt, i);
      return view(chatId, mid, `Usunąć <b>${esc(name)}</b> z ${b}/${apt}?`,
        [[{ text: "✅ Tak, usuń", callback_data: `dp!|${b}|${apt}|${i}` },
          { text: "✖️ Nie", callback_data: `a|${b}|${apt}` }]]);
    }
    case "dp!": {
      const out = await withData(d => opRemovePerson(d, b, apt, i));
      return view(chatId, mid, out.reply, [[{ text: `⬅️ Budynek ${b}`, callback_data: `b|${b}` }]]);
    }
    case "df":
      return view(chatId, mid, `Usunąć całe mieszkanie <b>${b}/${apt}</b> razem z mieszkańcami?`,
        [[{ text: "✅ Tak, usuń", callback_data: `df!|${b}|${apt}` },
          { text: "✖️ Nie", callback_data: `a|${b}|${apt}` }]]);
    case "df!": {
      const out = await withData(d => opDeleteApt(d, b, apt));
      return view(chatId, mid, out.reply, [[{ text: `⬅️ Budynek ${b}`, callback_data: `b|${b}` }]]);
    }
  }
}

// ── pętla long polling ──────────────────────────────────────────────
async function main() {
  const me = await tg("getMe");
  console.log(`✅ Bot @${me.username} działa. Repo: ${REPO} (${BRANCH}/${DATA_PATH})`);
  let offset = 0;
  for (;;) {
    let updates;
    try {
      updates = await tg("getUpdates", { offset, timeout: 50, allowed_updates: ["message", "callback_query"] });
    } catch (e) {
      console.error("poll:", e.message);
      await sleep(3000);
      continue;
    }
    for (const u of updates) {
      offset = u.update_id + 1;
      const chatId = u.message?.chat?.id ?? u.callback_query?.message?.chat?.id;
      try {
        if (u.message) await onMessage(u.message);
        else if (u.callback_query) await onCallback(u.callback_query);
      } catch (e) {
        if (e instanceof UserError) { if (chatId) await send(chatId, "⚠️ " + e.message).catch(() => {}); }
        else {
          console.error(e);
          if (chatId) await send(chatId, "❌ Błąd: " + esc(e.message)).catch(() => {});
        }
      }
    }
  }
}
main();
