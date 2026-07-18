import * as fs from "fs";
import * as path from "path";

const BANNED_PATTERNS = [
  { name: "Disease Probability", regex: /disease\s+probability/i },
  { name: "Chance of Disease", regex: /chance\s+of\s+disease/i },
  { name: "AI Diagnosis", regex: /ai\s+diagnosis/i },
  { name: "Clinically Validated Model/Prediction", regex: /clinically\s+validated/i },
  { name: "Exact FINDRISC Implementation", regex: /exact\s+findrisc/i },
  { name: "Exact Framingham Implementation", regex: /exact\s+framingham/i },
  { name: "Guaranteed Risk Reduction", regex: /guaranteed\s+risk/i },
  { name: "Hospital-Ready", regex: /hospital[- ]ready/i },
  { name: "Production-Grade Clinical System", regex: /production[- ]grade/i },
  { name: "Statistical Confidence Without Validation", regex: /statistical\s+confidence/i },
];

const IGNORED_PATHS = [
  "node_modules",
  "dist",
  ".git",
  "docs",
  "e2e",
  "test-semantic.ts", // Ignore this test file itself
];

function walk(dir: string, callback: (filePath: string) => void) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (IGNORED_PATHS.some((p) => filePath.includes(p))) {
      continue;
    }
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walk(filePath, callback);
    } else if (stat.isFile() && /\.(ts|tsx|html|css|js)$/.test(filePath)) {
      callback(filePath);
    }
  }
}

async function runSemanticTests() {
  console.log("==================================================");
  console.log("HEALTHGUARD AI AUTOMATED SEMANTIC REGRESSION TESTS");
  console.log("==================================================");

  let totalViolations = 0;
  const projectRoot = path.resolve(process.cwd(), ".."); // process.cwd() is backend/

  walk(path.join(projectRoot, "src"), checkFile);
  walk(path.join(projectRoot, "backend", "src"), checkFile);
  checkFile(path.join(projectRoot, "index.html"));

  function checkFile(filePath: string) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    lines.forEach((line, idx) => {
      // Exclude comment blocks/lines in the test itself or if we find code comments
      BANNED_PATTERNS.forEach((pattern) => {
        if (pattern.regex.test(line)) {
          console.error(
            `❌ Violation: [${pattern.name}] found in ${path.relative(projectRoot, filePath)}:L${idx + 1}`
          );
          console.error(`   Line: "${line.trim()}"`);
          totalViolations++;
        }
      });
    });
  }

  console.log("==================================================");
  if (totalViolations > 0) {
    console.error(`TESTS FAILED: Found ${totalViolations} semantic guideline violations.`);
    process.exit(1);
  } else {
    console.log("✅ All semantic vocabulary regression checks passed!");
    process.exit(0);
  }
}

runSemanticTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
