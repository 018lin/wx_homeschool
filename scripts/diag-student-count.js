// 只读诊断：比对 /api/admin/overview 与 /api/admin/accounts 的「学生数」口径
const path = require("path");
process.chdir(path.join(__dirname, ".."));
const fs = require("fs");

function loadEnv() {
  const f = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const { Pool } = require("pg");

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const q = async (sql) => (await pool.query(sql)).rows;
  const scalar = async (sql) => Number((await q(sql))[0].n);

  const childRows = await scalar("SELECT COUNT(*) AS n FROM children");
  const childWithUser = await scalar("SELECT COUNT(*) AS n FROM children WHERE user_id IS NOT NULL");
  const childNoUser = await scalar("SELECT COUNT(*) AS n FROM children WHERE user_id IS NULL");
  const studentUsers = await scalar("SELECT COUNT(*) AS n FROM users WHERE role = 'student'");
  const studentUserWithChild = await scalar(
    "SELECT COUNT(DISTINCT u.id) AS n FROM users u JOIN children c ON c.user_id = u.id WHERE u.role = 'student'"
  );
  const studentUserNoChild = await scalar(
    "SELECT COUNT(*) AS n FROM users u LEFT JOIN children c ON c.user_id = u.id WHERE u.role = 'student' AND c.id IS NULL"
  );
  const orphanChild = await scalar(
    "SELECT COUNT(*) AS n FROM children c WHERE c.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_id)"
  );
  const linkedUserNotStudent = await scalar(
    "SELECT COUNT(*) AS n FROM children c JOIN users u ON u.id = c.user_id WHERE u.role <> 'student'"
  );

  console.log("--- overview 口径（children 表行数）---");
  console.log("children 总数                :", childRows);
  console.log("--- accounts 口径（users.role='student'）---");
  console.log("student 账号数               :", studentUsers);
  console.log("--- 差异拆解 ---");
  console.log("有账号(children.user_id 非空):", childWithUser);
  console.log("无账号的纯档案(child.user_id 空):", childNoUser);
  console.log("student 账号已建档案        :", studentUserWithChild);
  console.log("student 账号缺档案(LEFT JOIN 空):", studentUserNoChild);
  console.log("档案指向的 user_id 查无此人 :", orphanChild);
  console.log("档案指向的角色非 student    :", linkedUserNotStudent);
  console.log("差值 accounts - overview     :", studentUsers - childRows);

  console.log("\n--- 无账号的纯档案明细（这些只会进 overview，不进 accounts）---");
  console.table(await q(
    "SELECT c.id, c.name, c.grade FROM children c LEFT JOIN users u ON u.id = c.user_id WHERE c.user_id IS NULL OR u.id IS NULL ORDER BY c.id LIMIT 40"
  ));

  console.log("\n--- 缺档案的 student 账号明细（这些只会进 accounts，不进 overview）---");
  console.table(await q(
    "SELECT u.id, u.account, u.display_name FROM users u LEFT JOIN children c ON c.user_id = u.id WHERE u.role = 'student' AND c.id IS NULL ORDER BY u.id LIMIT 40"
  ));

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });