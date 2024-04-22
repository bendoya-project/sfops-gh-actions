const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const yargs = require('yargs');

const argv = yargs
  .option('branchname', {
    alias: 'b',
    description: 'The branch name',
    type: 'string',
  })
  .option('domain', {
    alias: 'd',
    description: 'The name of the domain',
    type: 'string',
  })
  .option('patchDirectory', {
    alias: 'p',
    description: 'Directory to copy release  changelog files to ',
    type: 'string',
  })
  .demandOption(['domain', 'branchname', 'patchDirectory'])
  .help()
  .alias('help', 'h')
  .argv;


const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-'));

execSync(`git worktree add --detach ${tempDir} origin/${argv.branchname}`);

// Copy the changelog files to the patch directory if specified
if (argv.patchDirectory) {
  fs.mkdirSync(argv.patchDirectory, { recursive: true });
  const sourceDir = path.join(tempDir, argv.domain);
  const changelogMdPath = path.join(sourceDir, 'Release-Changelog.md');
  const changelogJsonPath = path.join(sourceDir, 'releasechangelog.json');

  if (fs.existsSync(changelogMdPath)) {
    fs.copyFileSync(changelogMdPath, path.join(argv.patchDirectory, 'Release-Changelog.md'));
  } else {
    console.error('Release-Changelog.md not found in the source directory.');
  }

  if (fs.existsSync(changelogJsonPath)) {
    fs.copyFileSync(changelogJsonPath, path.join(argv.patchDirectory, 'releasechangelog.json'));
  } else {
    console.error('releasechangelog.json not found in the source directory.');
  }
}

execSync(`git worktree remove ${tempDir}`);
