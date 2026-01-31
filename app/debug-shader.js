// Debug clamp fix logic 
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test expression: "1.- vec3<f32>(val)"
const expr = " 1.- vec3<f32>(val)";

// Variables (simulating empty map)
const varTypes = new Map();

// Scalar-returning functions
const scalarReturningFuncs = ['dot', 'length', 'distance', 'determinant'];
const scalarReturningUserFuncs = new Set();

const allScalarFuncs = [...scalarReturningFuncs, ...scalarReturningUserFuncs];

// Check constructor pattern
const constructorPattern = /vec[234](?:<f32>)?\s*\(/g;
let cMatch;
while ((cMatch = constructorPattern.exec(expr)) !== null) {
  const matchStart = cMatch.index;
  console.log(`Found constructor at index ${matchStart}: ${cMatch[0]}`);

  // Check if inside scalar function
  let insideScalarFunc = false;
  const beforeMatch = expr.slice(0, matchStart);
  console.log(`Before match: "${beforeMatch}"`);

  for (const fn of allScalarFuncs) {
    const fnIdx = beforeMatch.lastIndexOf(fn);
    if (fnIdx !== -1) {
      const verifyRegion = beforeMatch.slice(fnIdx + fn.length);
      let parenCount = 0;
      let hasOpen = false;
      for (const ch of verifyRegion) {
        if (ch === '(') { parenCount++; hasOpen = true; }
        else if (ch === ')') parenCount--;
      }
      console.log(`  Checking ${fn}: fnIdx=${fnIdx}, parenCount=${parenCount}, hasOpen=${hasOpen}`);
      if (hasOpen && parenCount > 0) {
        insideScalarFunc = true;
        break;
      }
    }
  }

  console.log(`  Inside scalar func: ${insideScalarFunc}`);

  if (!insideScalarFunc) {
    console.log(`  → Vector constructor found OUTSIDE scalar context`);
    // This should return false from isScalarByVectorUsage
  }
}
