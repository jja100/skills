#!/usr/bin/env node
// getFileDiff.js - CLI for fetching a single file diff from a Bitbucket PR via prAgent.js

const prAgent = require('./prAgent');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
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
  const required = ['project', 'repoSlug', 'pullRequestId', 'filePath'];
  for (const key of required) {
    if (!args[key]) {
      process.stderr.write(`Missing required argument --${key}\n`);
      process.exit(1);
    }
  }
  try {
    const result = await prAgent.get_single_file_diff({
      project: args.project,
      repoSlug: args.repoSlug,
      pullRequestId: args.pullRequestId,
      filePath: args.filePath,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (err) {
    process.stderr.write(err.message + '\n');
    process.exit(1);
  }
}

main();
