import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const source = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const walk = (path) => readdirSync(path).flatMap((entry) => { const child = join(path, entry); return statSync(child).isDirectory() ? walk(child) : [child]; });
const files = [...new Set([...source, ...walk("dist")])];
const findings = []; let scanned = 0;
for (const file of files) {
  const bytes = readFileSync(file);
  if (bytes.includes(0) || /\.(png|jpe?g|pdf|woff2?|ico|zip)$/i.test(file)) continue;
  const text = bytes.toString("utf8"); scanned++;
  const reasons = [];
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) reasons.push("private key");
  if (/\b(?:sb_secret_[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|sbp_[a-f0-9]{40,})\b/.test(text)) reasons.push("credential-shaped literal");
  for (const token of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    try { if (JSON.parse(Buffer.from(token[1], "base64url").toString()).role === "service_role") reasons.push("service-role JWT"); } catch { /* Non-JWT fixture. */ }
  }
  if (reasons.length) findings.push({ file, reasons: [...new Set(reasons)] });
}
const tests = JSON.parse(readFileSync(".tmp/cloud-final-tests.json", "utf8"));
const result = {
  at: new Date().toISOString(), branch: execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(),
  main: execFileSync("git", ["rev-parse", "main"], { encoding: "utf8" }).trim(),
  tests: { total: tests.numTotalTests, passed: tests.numPassedTests, failed: tests.numFailedTests, success: tests.success },
  secretScan: { scannedTextFiles: scanned, findings, scope: "Git tracked/untracked nonignored text and dist including source maps; pattern-based, not a guarantee against arbitrary secrets" },
  artifacts: walk("dist").map((file) => ({ file: file.replaceAll("\\", "/"), bytes: statSync(file).size })),
};
writeFileSync("docs/studyhub2/cloud-release-checks.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
if (findings.length || !tests.success) process.exitCode = 1;
