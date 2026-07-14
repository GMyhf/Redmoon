#!/usr/bin/env node
// handoff.mjs — 把一方的 git 改动整理成给另一方 AI 的 review 输入包。
//
// 用法:
//   node tools/handoff.mjs --from claude --to codex
//   node tools/handoff.mjs --from claude --to codex --base main
//   node tools/handoff.mjs --from codex --to claude --range HEAD~3..HEAD --test
//   node tools/handoff.mjs --from claude --stdout           # 打印而不写文件
//
// 参数:
//   --from <name>   交接方（claude|codex），默认 claude
//   --to <name>     接收方，默认取另一方
//   --base <ref>    审查 <ref>..HEAD 的全部改动
//   --range <a..b>  显式 git range，优先级高于 --base
//   --out <path>    输出路径，默认 collab/review-input.md
//   --test          附带运行 `npm test` 的结果（较慢）
//   --stdout        打印到 stdout，不写文件
//
// 无 --base/--range 时自动推断：工作区有未提交改动 → 对比 HEAD；否则 → HEAD~1..HEAD。
// 只用 Node 内置模块 + git，无第三方依赖。

import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COLLAB = resolve(ROOT, "collab");
const OTHER = { claude: "codex", codex: "claude" };
const MAX_DIFF_BYTES = 200_000; // 超过则截断，避免生成一个没法读的巨文件

function git(args, opts = {}) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      ...opts,
    }).trimEnd();
  } catch (err) {
    if (opts.soft) return "";
    throw err;
  }
}

function parseArgs(argv) {
  const opts = { from: "claude", test: false, stdout: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[(i += 1)];
    if (a === "--from") opts.from = next();
    else if (a === "--to") opts.to = next();
    else if (a === "--base") opts.base = next();
    else if (a === "--range") opts.range = next();
    else if (a === "--out") opts.out = next();
    else if (a === "--test") opts.test = true;
    else if (a === "--stdout") opts.stdout = true;
    else if (a === "-h" || a === "--help") opts.help = true;
    else throw new Error(`未知参数: ${a}`);
  }
  return opts;
}

const HELP = `handoff.mjs — 生成给另一方 AI 的 review 输入包

  node tools/handoff.mjs --from claude --to codex [--base <ref> | --range <a..b>] [--test] [--stdout]

参数见文件顶部注释。`;

function resolveRange(opts) {
  if (opts.range) return { range: opts.range, mode: "range" };
  if (opts.base) return { range: `${opts.base}..HEAD`, mode: "range" };
  const dirty = git(["status", "--porcelain"], { soft: true });
  if (dirty) return { range: "HEAD", mode: "worktree" }; // git diff HEAD == 未提交(已跟踪)改动
  const hasParent = git(["rev-parse", "--verify", "--quiet", "HEAD~1"], { soft: true });
  if (!hasParent) return { range: "HEAD", mode: "worktree" };
  return { range: "HEAD~1..HEAD", mode: "range" };
}

function collect(opts) {
  const { range, mode } = resolveRange(opts);
  const diffArgs = mode === "worktree" ? ["diff", "HEAD"] : ["diff", range];

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], { soft: true });
  const headSha = git(["rev-parse", "--short", "HEAD"], { soft: true });
  const stat = git([...diffArgs, "--stat"], { soft: true });
  const nameStatus = git([...diffArgs, "--name-status"], { soft: true });
  let diff = git([...diffArgs], { soft: true });
  let truncated = false;
  if (Buffer.byteLength(diff, "utf8") > MAX_DIFF_BYTES) {
    diff = diff.slice(0, MAX_DIFF_BYTES);
    truncated = true;
  }

  let log = "";
  if (mode === "range") {
    log = git(["log", "--oneline", "--no-decorate", range], { soft: true });
  }

  const untracked = git(["ls-files", "--others", "--exclude-standard"], { soft: true });

  return { range, mode, diffArgs, branch, headSha, stat, nameStatus, diff, truncated, log, untracked };
}

function readNotes(from) {
  const path = resolve(COLLAB, `NOTES-${from}.md`);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").trim();
}

function readOpenItems() {
  const path = resolve(COLLAB, "PLAN.md");
  if (!existsSync(path)) return "";
  const text = readFileSync(path, "utf8");
  // 抽出状态看板里非 Done 的行，给审查方一眼看到还在飞的任务
  const rows = text
    .split("\n")
    .filter((l) => /^\|\s*T-\d+\s*\|/.test(l) && !/\bDone\b/.test(l));
  return rows.join("\n");
}

function runTests() {
  try {
    const out = execFileSync("npm", ["test"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { pass: true, tail: tail(out) };
  } catch (err) {
    const out = `${err.stdout || ""}${err.stderr || ""}`;
    return { pass: false, tail: tail(out) };
  }
}

function tail(text, n = 40) {
  const lines = String(text).trimEnd().split("\n");
  return lines.slice(-n).join("\n");
}

const CHECKLIST = `## Review 检查清单（本项目红线）

- [ ] **服务端权威**：客户端只提交意图；命中/伤害/位置/XP/奖励是否都由 \`world.js\` 在 tick 边界决定？
- [ ] **协议一致**：改了 server→client 字段吗？若是破坏性改动，是否同步了 \`PROTOCOL_VERSION\` + \`docs/ARCHITECTURE.md\` + 测试？
- [ ] **输入校验**：新的客户端意图是否做了校验（类型、范围、seq 单调性）？非法输入是否安全拒绝？
- [ ] **确定性测试**：新逻辑是否有 \`node:test\` 覆盖，注入 \`rng\`、关闭随机生成、用 \`world.update(dt)\` 推进，不依赖真实时钟/网络？
- [ ] **数值单一来源**：共享数值/技能常量是否放在 \`definitions.js\`，没有在客户端复制游戏规则？
- [ ] **边界与失败路径**：断线、重复 seq、越界坐标、除零、空目标——是否想过？
- [ ] **文档同步**：实质玩法/协议改动是否记进 \`CHANGELOG.md\`？
- [ ] **可回归**：\`npm test\` 与 \`npm run check\` 是否都绿？`;

function build(opts, data, testResult) {
  const to = opts.to || OTHER[opts.from] || "codex";
  const lines = [];
  lines.push(`# Review 输入包 · ${opts.from} → ${to}`);
  lines.push("");
  lines.push("> 由 `tools/handoff.mjs` 自动生成，不入库。审查方读完请把意见写进 " +
    `\`collab/NOTES-${to}.md\`，并在 \`collab/HANDOFF.md\` 追加一条交接记录。`);
  lines.push("");
  lines.push("## 概况");
  lines.push("");
  lines.push(`- 分支: \`${data.branch}\` @ \`${data.headSha}\``);
  lines.push(`- 对比范围: \`${data.range}\`（${data.mode === "worktree" ? "未提交改动 vs HEAD" : "提交区间"}）`);
  if (data.truncated) lines.push(`- ⚠️ diff 超过 ${MAX_DIFF_BYTES} 字节已截断，完整改动请用 \`git ${data.diffArgs.join(" ")}\` 查看`);
  lines.push("");

  const openItems = readOpenItems();
  if (openItems) {
    lines.push("## PLAN 中未完成的任务");
    lines.push("");
    lines.push("```");
    lines.push(openItems);
    lines.push("```");
    lines.push("");
  }

  if (data.log) {
    lines.push("## 本区间提交");
    lines.push("");
    lines.push("```");
    lines.push(data.log);
    lines.push("```");
    lines.push("");
  }

  lines.push("## 改动文件");
  lines.push("");
  lines.push("```");
  lines.push(data.nameStatus || "(无跟踪改动)");
  lines.push("```");
  if (data.untracked) {
    lines.push("");
    lines.push("未跟踪(新增未 add)文件：");
    lines.push("```");
    lines.push(data.untracked);
    lines.push("```");
  }
  lines.push("");

  if (data.stat) {
    lines.push("<details><summary>diffstat</summary>");
    lines.push("");
    lines.push("```");
    lines.push(data.stat);
    lines.push("```");
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  const notes = readNotes(opts.from);
  if (notes) {
    lines.push(`## 交接方留言（NOTES-${opts.from}.md）`);
    lines.push("");
    lines.push(notes);
    lines.push("");
  }

  if (testResult) {
    lines.push(`## \`npm test\` 结果：${testResult.pass ? "✅ 通过" : "❌ 失败"}`);
    lines.push("");
    lines.push("```");
    lines.push(testResult.tail || "(无输出)");
    lines.push("```");
    lines.push("");
  }

  lines.push("## 完整 Diff");
  lines.push("");
  lines.push("```diff");
  lines.push(data.diff || "(空)");
  lines.push("```");
  lines.push("");

  lines.push(CHECKLIST);
  lines.push("");
  return lines.join("\n");
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (!OTHER[opts.from]) {
    throw new Error(`--from 只能是 claude 或 codex，收到: ${opts.from}`);
  }
  const data = collect(opts);
  const testResult = opts.test ? runTests() : null;
  const markdown = build(opts, data, testResult);

  if (opts.stdout) {
    process.stdout.write(markdown);
    return;
  }
  const outPath = opts.out ? resolve(ROOT, opts.out) : resolve(COLLAB, "review-input.md");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, markdown, "utf8");
  const rel = outPath.startsWith(ROOT) ? outPath.slice(ROOT.length + 1) : outPath;
  process.stdout.write(`✅ 已生成 review 输入包: ${rel}\n`);
  process.stdout.write(`   把它交给 ${opts.to || OTHER[opts.from]}，或让对方直接读这个文件。\n`);
}

main();
