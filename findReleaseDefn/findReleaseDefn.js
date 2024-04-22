const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const yargs = require('yargs');

const argv = yargs
  .option('releaseDefn', {
    alias: 'r',
    description: 'Comma-separated list of domain:releaseDefn pairs',
    type: 'string',
  })
  .option('branchname', {
    alias: 'b',
    description: 'The branch name where release defns are stored',
    type: 'string',
  })
  .option('workspace', {
    alias: 'w',
    description: 'Workspace where the definitions have to be written',
    type: 'string',
  })
  .demandOption(['releaseDefn', 'branchname', 'workspace'])
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
        console.error(`✅  Located ${domain} in ${fullPath}`);
        console.error(`👀  Searching for ${fileName} in ${fullPath}`);
        const foundFiles = fs.readdirSync(fullPath, { withFileTypes: true })
          .filter(file => file.isFile() && file.name.startsWith(fileName))
          .map(file => path.join(fullPath, file.name));
        results.push(...foundFiles);
      } else {
        searchDomainDirectories(fullPath, domain, fileName, results);
      }
    }
  });
  return results;
};

const main = () => {

  console.error(`----------------------------------------------------`);
  console.error(`🤖  sfops github actions                            `);
  console.error(`🚧  Action: findReleaseDefn`);
  console.error(`----------------------------------------------------`);
  console.error();
  console.error(`ℹ️  ReleaseDefn: ${argv.releaseDefn}`);
  console.error(`ℹ️  Branch: ${argv.branchname}`);
  console.error();


  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-'));
  execSync(`git worktree add --detach ${tempDir} origin/${argv.branchname}`, { stdio: 'ignore' });
  console.error(`ℹ️  Checked out a detached branch  ${argv.branchname} at ${tempDir}`);

  const releaseDefns = argv.releaseDefn.split(',').map(defn => {
    const [domain, releaseDefn] = defn.split(':');
    return { domain, releaseDefn };
  });

  const copiedFilesPaths = releaseDefns.map(({ domain, releaseDefn }) => {
    const fileNameWithoutExtension = getFileNameWithoutExtension(releaseDefn);
    console.error(`👀 Searching in ${tempDir} for directories named ${domain} containing files named ${fileNameWithoutExtension}`);
    const foundFiles = searchDomainDirectories(tempDir, domain, fileNameWithoutExtension);

    if (foundFiles.length === 0) {
      console.error(`❌ Release definition file not found in any '${domain}' directories.`);
      process.exit(1);
    } else {
      const targetPath = path.join(argv.workspace, `${domain}_${releaseDefn}.yml`);
      fs.copyFileSync(foundFiles[0], targetPath);
      console.error(`ℹ️   Copied to ${targetPath}`);
      return targetPath;
    }
  }).filter(Boolean);

  execSync(`git worktree remove ${tempDir}`,{ stdio: 'ignore' });
  console.error();
  console.error();
  console.log(copiedFilesPaths.join(', '));
};

main();
