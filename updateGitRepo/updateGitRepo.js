const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Parse command line arguments using yargs
const argv = yargs(hideBin(process.argv))
  .option('gh_token', { type: 'string', demandOption: true })
  .option('source_repo_url', { type: 'string', demandOption: true })
  .option('current_branch', { type: 'string', demandOption: true })
  .option('github_repo_url', { type: 'string', demandOption: true })
  .option('dir_to_copy', { type: 'string', demandOption: true })
  .option('target_dir', { type: 'string', demandOption: true })
  .option('commit_message', { type: 'string', demandOption: true })
  .option('isToUpdateReleaseNames', { type: 'string', default: 'false' })
  .option('allReleaseJSONPath', { type: 'string', default: '' })
  .option('fileNameToDelete', { type: 'string', default: '' })
  .argv;

const retries = 10;

async function cloneAndPrepareRepository(githubRepoUrl, dirToCopy, targetDir) {
    try {
        // Create a temporary directory
        const tempDir = fs.mkdtempSync(`ci-${new Date().toISOString().slice(0,10)}-`);

        // Clone the repository
        execSync(`gh repo clone ${githubRepoUrl} ${tempDir}`,{ timeout: 1000*60*10 });

        // Copy the provided directory to the cloned repository
        const destDir = path.join(tempDir, targetDir);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        fs.cpSync(dirToCopy, destDir, { recursive: true });

        return tempDir;
    } catch (error) {
        console.error(`Error in cloneAndPrepareRepository: ${error}`);
        process.exit(1);
    }
}

async function getRepoVariable(repo, variable) {
    try {
      // Constructing the gh CLI command
      const command = `gh api repos/${repo}/actions/variables/${variable} --jq '.value'`;
      // Executing the command and capturing the output
      const output = execSync(command,{ timeout: 1000*60*2 }).toString();
      output.trim();
      return JSON.parse(output);
    } catch (error) {
      console.error('Error occurred:', error.message);
      return current_branch;
    }
  }

async function updateDomains(tempDir, allReleasesJSONPath) {
    try {
        // Read and update domains.json
        const domainsJsonPath = path.join(tempDir, '_data', 'domains.json');
        let domains = JSON.parse(fs.readFileSync(domainsJsonPath, 'utf8'));
        const newDomainsArray = JSON.parse(fs.readFileSync(allReleasesJSONPath, 'utf8')).include;

        newDomainsArray.forEach(domain => {
            if (!domains.includes(domain)) {
                domains.push(domain);
            }
        });

        fs.writeFileSync(domainsJsonPath, JSON.stringify(domains, null, 2));
    } catch (error) {
        console.error(`Error in updateDomains: ${error}`);
        process.exit(1);
    }
}


async function updateBranches(tempDir, branches) {
    try {
        // Read and update domains.json
        const branchesJSONPath = path.join(tempDir, '_data', 'branches.json');
        fs.writeFileSync(branchesJSONPath, JSON.stringify(branches, null, 2));
    } catch (error) {
        console.error(`Error in updateBranches: ${error}`);
    }
}


async function gitOperations(tempDir,target_dir, commitMessage) {
    try {
        process.chdir(tempDir);
        execSync(`git config --global user.email sfopsbot@flxbl.io`);
        execSync(`git config --global user.name sfopsbot`);
        execSync(`git remote add remote_origin https://sfops:${argv.gh_token}@github.com/${argv.github_repo_url}.git`);
        execSync(`git add ${target_dir} `, {stdio: 'inherit'} );
        execSync(`git commit -m  "${commitMessage}"`, {stdio: 'inherit'})
    } catch (error) {
        console.error(`Error in gitOperations: ${error}`);
        process.exit(0);
    }
}



async function pushChanges(tempDir, maxRetries) {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            execSync(`git pull --rebase remote_origin main && git push remote_origin main`);
            console.log("Successfully pushed the changes.");
            return;
        } catch (error) {
            console.error(`Error occurred during push attempt ${attempt + 1}: ${error}`);
            attempt++;
            await new Promise(resolve => setTimeout(resolve, 15000)); // Retry after 15 seconds
        }
    }
    console.error("Exceeded maximum retry attempts.");
    process.exit(1);
}


async function main() {
    const branches = await getRepoVariable(argv.source_repo_url, 'BRANCHES');
    const tempDir = await cloneAndPrepareRepository(argv.github_repo_url, argv.dir_to_copy, argv.target_dir);

    if (argv.fileNameToDelete) {
        await deleteFileFromRepo(tempDir, argv.fileNameToDelete);
    }
    if (branches)
        await updateBranches(tempDir, branches);
    if (argv.isToUpdateReleaseNames == 'true')
        await updateDomains(tempDir, argv.allReleaseJSONPath);

    await gitOperations(tempDir, argv.target_dir, argv.commit_message);
    await pushChanges(tempDir, retries);

    // Cleanup
    process.chdir('..');
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log("Cleanup completed.");
}

main().catch(error => {
    console.error(`An error occurred: ${error}`);
    process.exit(1);
});

