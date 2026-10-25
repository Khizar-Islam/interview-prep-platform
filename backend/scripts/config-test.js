// Checks how TRUST_PROXY_HOPS is read. No database, no Gemini, no server.
// Run with: npm run test:config

const { parseTrustProxyHops } = require('../src/config/env');

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const cases = [
  ['unset -> 1', undefined, 1],
  ['empty -> 1', '', 1],
  ['"1" -> 1', '1', 1],
  ['"2" -> 2', '2', 2],
  ['"5" -> 5', '5', 5],
  ['" 3 " (spaces) -> 3', ' 3 ', 3],
  ['"0" -> 1', '0', 1],
  ['"6" -> 1', '6', 1],
  ['"-1" -> 1', '-1', 1],
  ['"1.5" -> 1', '1.5', 1],
  ['"abc" -> 1', 'abc', 1],
  ['"true" -> 1', 'true', 1],
  ['"2abc" -> 1', '2abc', 1],
];

console.log('\nTRUST_PROXY_HOPS parsing');
for (const [name, raw, expected] of cases) {
  const actual = parseTrustProxyHops(raw);
  check(name, actual === expected, `got ${actual}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
