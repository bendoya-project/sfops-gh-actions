const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const yargs = require('yargs');

const argv = yargs
  .option('releaseDefn', {
    alias: 'r',
    description: 'The release definition file name',
    type: 'string',
  })
  .option('domain', {
    alias: 'd',
    description: 'The domain name',
    type: 'string',
  })
  .option('branchname', {
    alias: 'b',
    description: 'The branch name',
    type: 'string',
  })
  .option('workspace', {
    alias: 'w',
    description: 'Workspace where the definition has to be written',
    type: 'string',
  })
  .option('patchDirectory', {
    alias: 'p',
    description: 'Directory to copy release  changelog files to ',
    type: 'string',
  })
  .demandOption(['releaseDefn', 'domain', 'branchname','workspace'])
  .help()
  .alias('help', 'h')
  .argv;

const getFileNameWithoutExtension = (fileName) => {
  let reversedFileName = fileName.split('').reverse().join('');
  if (reversedFileName.includes('.lmy.')) {
    return reversedFileName.split('.lmy.')[1].split('').reverse().join('');
  } else if (reversedFileName.includes('.lmay.')) {
    return reversedFileName.split('.lmay.')[1].split('').reverse().join('');
  }
  return fileName;
};

const searchDomainDirectories = (dir, domain, fileName, results = []) => {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      if (dirent.name === domain) {
        // If the directory matches the domain, search for the file
        console.error(`Located ${domain} in ${dirent.path}`);
        console.error(`Searching for ${fileName} in ${dirent.path}` )
        const foundFiles = fs.readdirSync(fullPath, { withFileTypes: true })
          .filter(file => file.isFile() && file.name.startsWith(fileName))
          .map(file => path.join(fullPath, file.name));
        results.push(...foundFiles);
      } else {
        // Continue searching in subdirectories
        searchDomainDirectories(fullPath, domain, fileName, results);
      }
    }
  });
  return results;
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-'));

execSync(`git worktree add --detach ${tempDir} origin/${argv.branchname}`);

const fileNameWithoutExtension = getFileNameWithoutExtension(argv.releaseDefn);

console.error(`Searching in ${tempDir} for directories named ${argv.domain} containing files named ${fileNameWithoutExtension}`);

const foundFiles = searchDomainDirectories(tempDir, argv.domain, fileNameWithoutExtension);

if (foundFiles.length === 0) {
  console.error(`Release definition file not found in any '${argv.domain}' directories.`);
  process.exit(1);
} else {
 
    console.error(`Found ReleaseDefn: ${foundFiles[0]}`);
    fs.copyFileSync(foundFiles[0], path.join(argv.workspace, `${argv.releaseDefn}.yml`));
    console.log(path.join(argv.workspace, `${argv.releaseDefn}.yml`));
    console.error(`Copied to ${path.join(argv.workspace, argv.releaseDefn)}`);
}


// Copy the changelog files to the patch directory if specified
if (argv.patchDirectory) {
  fs.mkdirSync(argv.patchDirectory, { recursive: true });
  const sourceDir = path.dirname(foundFiles[0]);
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
