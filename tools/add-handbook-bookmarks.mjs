import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const htmlPath = path.join(root, "docs/dev-handbook.html");
const inputPath = process.argv[2] || path.join(root, "docs/dev-handbook.pdf");
const outputPath = process.argv[3] || inputPath;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "redmoon-handbook-"));
const textPath = path.join(tempDir, "handbook.txt");
const markPath = path.join(tempDir, "bookmarks.ps");
const renderedPath = path.join(tempDir, "bookmarked.pdf");

function visibleHeading(level, markup) {
  const match = level === 2
    ? markup.match(/<span class="h-num">([^<]*)<\/span><span class="h-text">([^<]*)<\/span>/)
    : markup.match(/<span class="h3-num">([^<]*)<\/span>([^<]*)/);
  if (!match) throw new Error(`cannot parse h${level} heading: ${markup}`);
  return `${match[1]} ${match[2]}`.replace(/\s+/g, " ").trim();
}

function compact(value) {
  return value.replace(/\s+/g, "");
}

function utf16beHex(value) {
  const littleEndian = Buffer.from(`\uFEFF${value}`, "utf16le");
  const bytes = [];
  for (let i = 0; i < littleEndian.length; i += 2) {
    bytes.push(littleEndian[i + 1].toString(16).padStart(2, "0"));
    bytes.push(littleEndian[i].toString(16).padStart(2, "0"));
  }
  return `<${bytes.join("")}>`;
}

const html = fs.readFileSync(htmlPath, "utf8");
const headings = [...html.matchAll(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/g)].map((match) => ({
  level: Number(match[1]),
  title: visibleHeading(Number(match[1]), match[2]),
}));
execFileSync("pdftotext", ["-layout", inputPath, textPath], { stdio: "inherit" });
const pages = fs.readFileSync(textPath, "utf8").split("\f");

let lastPage = 1;
for (const heading of headings) {
  const needle = compact(heading.title);
  const page = pages.findIndex((content, index) => index >= lastPage - 1 && compact(content).includes(needle));
  if (page < 0) throw new Error(`heading not found in PDF: ${heading.title}`);
  heading.page = page + 1;
  lastPage = heading.page;
}

const marks = ["%!PS-Adobe-3.0" ];
for (let i = 0; i < headings.length; i += 1) {
  const heading = headings[i];
  const childCount = heading.level === 2 && headings[i + 1]?.level === 3
    ? headings.slice(i + 1).findIndex((item) => item.level === 2)
    : 0;
  const count = childCount > 0 ? ` /Count ${childCount}` : "";
  marks.push(`[ /Title ${utf16beHex(heading.title)} /Page ${heading.page} /View [/XYZ null null]${count} /OUT pdfmark`);
}
fs.writeFileSync(markPath, `${marks.join("\n")}\n`);

execFileSync("gs", [
  "-q", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite",
  `-sOutputFile=${renderedPath}`, inputPath, markPath,
], { stdio: "inherit" });
fs.copyFileSync(renderedPath, outputPath);
fs.rmSync(tempDir, { recursive: true, force: true });
console.log(`added ${headings.length} PDF bookmarks to ${outputPath}`);
