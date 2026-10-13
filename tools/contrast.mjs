#!/usr/bin/env node
// WCAG 2.x contrast ratio helper.
//
//   node tools/contrast.mjs '#1a8f3a' '#000'          one pair (foreground background)
//   node tools/contrast.mjs '#1a8f3a/#000' '#555/#000' several pairs, fg/bg
//   node tools/contrast.mjs --audit [css-file] [bg]    scan a stylesheet's `color:` hex
//                                                      values against one background
//
// Exit code is 1 when any checked pair is below 4.5:1 (AA for normal text).

import { readFileSync } from 'node:fs';

const AA = 4.5;

export function parseHex(input) {
  let hex = String(input).trim().replace(/^#/, '');
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error(`Not a hex color: ${input}`);
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

export function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(fg, bg) {
  const a = luminance(parseHex(fg));
  const b = luminance(parseHex(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function report(fg, bg) {
  const ratio = contrast(fg, bg);
  const pass = ratio >= AA;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${ratio.toFixed(2).padStart(5)}:1  ${fg} on ${bg}`);
  return pass;
}

function audit(file, bg) {
  const css = readFileSync(file, 'utf8');
  const seen = new Map();
  for (const match of css.matchAll(/(?<![-\w])color:\s*(#[0-9a-fA-F]{3,6})\b/g)) {
    const color = match[1].toLowerCase();
    seen.set(color, (seen.get(color) ?? 0) + 1);
  }
  let failed = 0;
  for (const [color, count] of [...seen].sort((x, y) => contrast(x[0], bg) - contrast(y[0], bg))) {
    const ratio = contrast(color, bg);
    const flag = ratio >= AA ? 'ok  ' : 'LOW ';
    if (ratio < AA) failed++;
    console.log(`${flag} ${ratio.toFixed(2).padStart(5)}:1  ${color}  (${count}x) on ${bg}`);
  }
  console.log(`\n${failed} of ${seen.size} distinct colors are below ${AA}:1 on ${bg}.`);
  console.log('Context matters: a low value is only a defect if the text really sits on that background.');
  return failed === 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('usage: contrast.mjs <fg> <bg> | <fg/bg>... | --audit [css] [bg]');
    process.exit(2);
  }
  let ok = true;
  if (args[0] === '--audit') {
    ok = audit(args[1] ?? 'sites/fsociety00/public/styles.css', args[2] ?? '#000');
  } else if (args.every((a) => a.includes('/'))) {
    for (const pair of args) {
      const [fg, bg] = pair.split('/');
      ok = report(fg, bg) && ok;
    }
  } else {
    ok = report(args[0], args[1] ?? '#000');
  }
  process.exit(ok ? 0 : 1);
}
