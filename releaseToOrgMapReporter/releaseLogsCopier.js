const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');



// Parse command line arguments
const args = process.argv.slice(2);
const sourceBranchPrefix = args[0];
const environments = args[1].split(',');
const domains = args[2].split(',');


console.log(`----------------------------------------------------`);
console.log(`🤖  sfops github actions                            `);
console.log(`🚧  Action: releaseToOrgMapReporter`);
console.log(`----------------------------------------------------`);
console.log(`ℹ️  Source Branch Prefix: ${sourceBranchPrefix}`);
console.log(`ℹ️  Environments: ${environments}`);
console.log(`ℹ️  Domains: ${domains}`);


// Fetch the latest changes from the remote repository
console.log('ℹ️  Fetching latest changes from the remote repository...');
execSync('git fetch --all',{stdio: 'ignore',maxBuffer: 20 * 1024 * 1024});

// Function to fetch and save release changelog for a domain in an environment
const fetchAndSaveChangelog = (env, domain) => {
  const dataDir = path.join('_data', 'releaselogs', env);
  fs.mkdirSync(dataDir, { recursive: true });

  try {
    const changelogPath = `${domain}/releasechangelog.json`;
    const gitShowCommand = `git --no-pager show  origin/${sourceBranchPrefix}-${env}:${changelogPath}`;
    console.log(`ℹ️  Fetching release changelog for ${domain} in ${env} environment...`);
    console.log(`🔍  Running command: ${gitShowCommand}`)
    const changelogContent = execSync(gitShowCommand,{maxBuffer: 20 * 1024 * 1024}).toString();
    fs.writeFileSync(path.join(dataDir, `${domain}.json`), changelogContent);
    console.log(`✅  Release changelog for ${domain} in ${env} environment saved to ${dataDir}/${domain}.json`);
  } catch (error) {
    console.error(`❌  Release changelog for ${domain} in ${env} environment not found, skipping.`);
  }
};

// Loop through environments and domains to fetch and save changelogs
environments.forEach(env => {
  domains.forEach(domain => {
    fetchAndSaveChangelog(env, domain);
  });
});


