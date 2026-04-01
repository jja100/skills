const fs = require('fs');
const cp = require('child_process');
const JiraHelper = require('./jiraHelper');

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function unique(values) {
  const seen = new Set();

  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }

    seen.add(value);
    return true;
  });
}

function getKeysFromGit(repoPath, count, lookback) {
  const output = cp.execFileSync(
    'git',
    ['-C', repoPath, 'log', '--format=%s', '-n', String(lookback)],
    { encoding: 'utf8' }
  );

  const keys = [];
  for (const line of output.split(/\r?\n/)) {
    const matches = line.match(/[A-Z]+-\d+/g);
    if (!matches) {
      continue;
    }

    for (const match of matches) {
      keys.push(match);
    }
  }

  return unique(keys).slice(0, count);
}

function getKeysFromArgs(args) {
  if (args.keys) {
    return unique(args.keys.split(',').map((key) => key.trim()));
  }

  if (args['keys-file']) {
    const fileContent = fs.readFileSync(args['keys-file'], 'utf8');
    return unique(fileContent.split(/\r?\n|,/).map((key) => key.trim()));
  }

  if (args['git-repo']) {
    const count = Number.parseInt(args.count || '20', 10);
    const lookback = Number.parseInt(args.lookback || '200', 10);
    return getKeysFromGit(args['git-repo'], count, lookback);
  }

  return [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jira = new JiraHelper(args.domain, args.token || process.env.JIRA_TOKEN || process.env.PERSONAL_TOKEN);

  let keys = getKeysFromArgs(args);
  if (args.jql) {
    const response = await jira.searchIssues(args.jql, {
      maxResults: Number.parseInt(args.count || '20', 10),
      includeAcceptanceCriteria: true,
    });
    keys = unique((response.issues || []).map((issue) => issue.key));
  }

  if (keys.length === 0) {
    throw new Error('No Jira issues resolved. Provide --jql, --keys, --keys-file, or --git-repo.');
  }

  const issues = [];
  for (const key of keys) {
    issues.push(await jira.getIssueDetails(key));
  }

  process.stdout.write(`${JSON.stringify(issues, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});