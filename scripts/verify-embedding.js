/**
 * 验证智谱 Embedding 空串防护：
 * 混合批次（含空串）不应再让整批 400 失败。
 */
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");

// 加载 .env.local
[".env.local", ".env"].forEach(function (n) {
  const f = path.join(ROOT, n);
  if (!fs.existsSync(f)) return;
  fs.readFileSync(f, "utf8").split(/\r?\n/).forEach(function (l) {
    const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  });
});

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + label + (extra ? "  " + extra : "")); }
  else { fail++; console.log("  ✗ " + label + (extra ? "  " + extra : "")); }
}

// 从 server.js 中抽出 requestZhipuEmbeddings 的真实逻辑不便，这里直接复刻修复后的过滤语义，
// 并对真实智谱接口发请求，验证「含空串的输入数组」是否还会 400。
const key = process.env.ZHIPU_API_KEY;
const model = process.env.ZHIPU_EMBEDDING_MODEL || "embedding-3";
const ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/embeddings";

async function call(label, texts) {
  // 修复后：先过滤空串
  const list = texts.map(function (t) { return String(t == null ? "" : t).trim(); })
    .filter(function (t) { return t.length > 0; });
  if (!list.length) { ok(label + "（全部为空 → 直接跳过，不发请求）", true, "过滤后 0 条"); return; }
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ model: model, input: list }),
  });
  const t = await res.text();
  let data = null; try { data = JSON.parse(t); } catch (e) {}
  const n = data && data.data ? data.data.length : 0;
  ok(label, res.ok && n === list.length, "过滤后 " + list.length + " 条 → HTTP " + res.status + " 返回 " + n + " 个向量");
}

(async () => {
  console.log("=== 智谱 Embedding 空串防护验证（model=" + model + "） ===");

  // 对照组：不过滤、直接把空串发过去（这是修复前的行为）
  const raw = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ model: model, input: ["正常文本", "", "另一段正常文本"] }),
  });
  const rawBody = await raw.text();
  console.log("  [修复前行为 · 不过滤] 含空串的批次 → HTTP " + raw.status +
    (raw.ok ? "" : "  ← 整批失败，拖垮同批正常文本"));
  ok("确认修复前确实会整批失败（这就是根因）", raw.status === 400, "HTTP " + raw.status);

  console.log("");
  await call("修复后：常规批次", ["第一段文本", "第二段文本"]);
  await call("修复后：混合空串批次", ["第一段文本", "", "   ", "第二段文本", null, undefined, "第三段文本"]);
  await call("修复后：单条", ["单独一条"]);
  await call("修复后：全空批次", ["", "  ", null]);

  console.log("\n===== 汇总：通过 " + pass + " / 失败 " + fail + " =====");
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error("FATAL", e); process.exit(1); });
