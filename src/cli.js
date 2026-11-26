#!/usr/bin/env node
// @ts-check
/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, InputError, inputFromFixture } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

if (args[0] !== 'evaluate' || !args[1]) {
  console.error('Usage: node src/cli.js evaluate <fixture> [--start YYYY-MM-DD]');
  process.exit(2);
}

const startIndex = args.indexOf('--start');
const startDate = startIndex >= 0 ? args[startIndex + 1] : '2024-01-15';
const fixtureArg = args[1];
const fixturePath = resolveFixture(fixtureArg);

try {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (fixture.kind === 'round' || fixture.kind === 'cycle-starts') {
    console.error(`La fixture ${fixture.id} n'est pas évaluable via evaluate().`);
    process.exit(2);
  }
  const output = evaluate(inputFromFixture(fixture, startDate));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} catch (error) {
  if (error instanceof InputError) {
    console.error(JSON.stringify({ name: error.name, code: error.code, message: error.message, day: error.day, date: error.date }, null, 2));
    process.exit(1);
  }
  throw error;
}

/**
 * @param {string} arg
 */
function resolveFixture(arg) {
  if (arg.endsWith('.json')) return isAbsolute(arg) ? arg : join(process.cwd(), arg);
  return join(here, '../test/golden/fixtures', `${arg}.json`);
}
