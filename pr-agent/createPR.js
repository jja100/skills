#!/usr/bin/env node
// createPR.js - CLI for creating Bitbucket PR via prAgent.js

const prAgent = require('./prAgent');
const fs = require('fs');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const raw = token.slice(2);
    const eqIndex = raw.indexOf('=');
    if (eqIndex !== -1) {
      const key = raw.slice(0, eqIndex);
      const value = raw.slice(eqIndex + 1);
      args[key] = value;
      continue;
    }
    const key = raw;
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i++;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = ['project', 'repoSlug', 'title', 'fromRef', 'toRef'];
  for (const key of required) {
    if (!args[key]) {
      process.stderr.write(`Missing required argument --${key}\n`);
      process.exit(1);
    }
  }

  const hasInlineDescription = typeof args.description === 'string';
  const hasDescriptionFile = typeof args['description-file'] === 'string';
  const hasDescriptionStdin = !!args['description-stdin'];

  const descriptionSourceCount = [hasInlineDescription, hasDescriptionFile, hasDescriptionStdin].filter(Boolean).length;
  if (descriptionSourceCount > 1) {
    process.stderr.write('Use only one description source: --description, --description-file, or --description-stdin\n');
    process.exit(1);
  }

  let description = args.description;
  if (args['description-file']) {
    try {
      description = fs.readFileSync(args['description-file'], 'utf8');
    } catch (err) {
      process.stderr.write(`Failed to read description file: ${err.message}\n`);
      process.exit(1);
    }
  } else if (args['description-stdin']) {
    try {
      description = fs.readFileSync(0, 'utf8');
    } catch (err) {
      process.stderr.write(`Failed to read description from stdin: ${err.message}\n`);
      process.exit(1);
    }
  }

  const reviewers = typeof args.reviewers === 'string'
    ? args.reviewers.split(',').map((r) => r.trim()).filter(Boolean)
    : [];

  try {
    const result = await prAgent.create_pr({
      project: args.project,
      repoSlug: args.repoSlug,
      title: args.title,
      description,
      fromRef: args.fromRef,
      toRef: args.toRef,
      reviewers,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (err) {
    process.stderr.write(err.message + '\n');
    process.exit(1);
  }
}

main();
