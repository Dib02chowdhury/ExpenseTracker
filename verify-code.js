/**
 * Expense Tracker - Local Verification & Linting Script
 * Runs tests on folder structure, HTML tags, CSS brackets, and checks JavaScript syntax.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("=== Expense Tracker Verification Suite ===");

let passed = true;

function logTest(name, status, details = "") {
  if (status) {
    console.log(`[PASS] ${name}`);
  } else {
    console.log(`[FAIL] ${name} - ${details}`);
    passed = false;
  }
}

// 1. Verify Folder Structure
try {
  const requiredFiles = [
    'index.html',
    'Code.js',
    'css/style.css',
    'js/api.js',
    'js/app.js',
    'config.json.example',
    '.github/workflows/ci.yml',
    '.github/workflows/deploy.yml'
  ];

  let structureOk = true;
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(__dirname, file))) {
      logTest("Folder Structure Check", false, `Missing required file: ${file}`);
      structureOk = false;
      break;
    }
  }
  if (structureOk) {
    logTest("Folder Structure Check", true);
  }
} catch (e) {
  logTest("Folder Structure Check", false, e.message);
}

// 2. Validate HTML Structure
try {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const hasHtml = html.includes('<html') && html.includes('</html>');
  const hasHead = html.includes('<head') && html.includes('</head>');
  const hasBody = html.includes('<body') && html.includes('</body>');
  const hasTitle = html.includes('<title>') && html.includes('</title>');
  
  if (hasHtml && hasHead && hasBody && hasTitle) {
    logTest("HTML Structure Validation", true);
  } else {
    logTest("HTML Structure Validation", false, "Missing basic HTML tags (html, head, body, or title)");
  }
} catch (e) {
  logTest("HTML Structure Validation", false, e.message);
}

// 3. Check CSS Brackets Syntax
try {
  const css = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
  let openCount = 0;
  let closedCount = 0;
  
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') openCount++;
    if (css[i] === '}') closedCount++;
  }

  if (openCount === closedCount) {
    logTest("CSS Brackets Check", true, `Balanced rules (${openCount} rules total)`);
  } else {
    logTest("CSS Brackets Check", false, `Unbalanced braces: open=${openCount}, closed=${closedCount}`);
  }
} catch (e) {
  logTest("CSS Brackets Check", false, e.message);
}

// 4. Compile JavaScript Syntax via node --check
const jsFiles = ['js/api.js', 'js/app.js', 'Code.js'];
jsFiles.forEach(file => {
  try {
    const filePath = path.join(__dirname, file);
    execSync(`node --check "${filePath}"`, { stdio: 'ignore' });
    logTest(`JavaScript Syntax (${file})`, true);
  } catch (e) {
    logTest(`JavaScript Syntax (${file})`, false, `Syntax compilation error.`);
  }
});

// Exit process
if (passed) {
  console.log("\n>>> Verification succeeded. Code is syntactically sound!");
  process.exit(0);
} else {
  console.error("\n>>> Verification failed! Please fix structural or syntax errors.");
  process.exit(1);
}
