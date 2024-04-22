const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

// Parse command line arguments using yargs
const argv = yargs(hideBin(process.argv))
  .option("gh_token", { type: "string", demandOption: true })
  .option("github_repo_url", { type: "string", demandOption: true })
  .option('dir_to_copy', { type: 'string', demandOption: true })
  .option('target_dir', { type: 'string', demandOption: true })
  .option("commit_message", { type: "string", demandOption: true }).argv;

const retries = 10;

async function cloneAndPrepareRepository(githubRepoUrl, dirToCopy, targetDir) {
  try {
    // Create a temporary directory
    const tempDir = fs.mkdtempSync(
      `ci-${new Date().toISOString().slice(0, 10)}-`
    );

    // Clone the repository
    execSync(`gh repo clone ${githubRepoUrl} ${tempDir}`);

    // Checkout tempDir to a releaedefns branch
    execSync(`git checkout releasedefns`, {
      stdio: "inherit",
      cwd: tempDir,
    });

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

async function gitOperations(tempDir, target_dir, commitMessage) {
  try {
    process.chdir(tempDir);
    execSync(`git config --global user.email sfopsbot@flxbl.io`);
    execSync(`git config --global user.name sfopsbot`);
    execSync(
      `git remote add remote_origin https://sfops:${argv.gh_token}@github.com/${argv.github_repo_url}.git`
    );
    execSync(`git add ${target_dir} `, { stdio: "inherit" });
    execSync(`git commit -m  "${commitMessage}"`, { stdio: "inherit" });
  } catch (error) {
    console.error(`Error in gitOperations: ${error}`);
    process.exit(0);
  }
}

async function pushChanges(tempDir, maxRetries) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      execSync(
        `git pull --rebase remote_origin releasedefns && git push remote_origin releasedefns`
      );
      console.log("Successfully pushed the changes.");
      return;
    } catch (error) {
      console.error(
        `Error occurred during push attempt ${attempt + 1}: ${error}`
      );
      attempt++;
      await new Promise((resolve) => setTimeout(resolve, 15000)); // Retry after 15 seconds
    }
  }
  console.error("Exceeded maximum retry attempts.");
  process.exit(1);
}

async function main() {
  const tempDir = await cloneAndPrepareRepository(
    argv.github_repo_url,
    argv.dir_to_copy,
    argv.target_dir
  );

  await gitOperations(tempDir, argv.target_dir, argv.commit_message);
  await pushChanges(tempDir, retries);

  // Cleanup
  process.chdir("..");
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("Cleanup completed.");
}

main().catch((error) => {
  console.error(`An error occurred: ${error}`);
  process.exit(1);
});
