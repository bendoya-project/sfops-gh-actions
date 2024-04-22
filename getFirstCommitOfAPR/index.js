const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    const token = core.getInput('github_token', { required: true });
    const octokit = github.getOctokit(token);

    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds

    let retryCount = 0;
    let commits = [];

    while (retryCount < maxRetries) {
      try {
        const { data } = await octokit.rest.pulls.listCommits({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          pull_number: github.context.payload.pull_request.number,
        });

        commits = data;
        break;
      } catch (error) {
        retryCount++;
        if (retryCount === maxRetries) {
          throw error;
        }
        console.log(`Attempt ${retryCount} failed. Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    if (commits.length === 0) {
      core.setFailed('No commits found in the pull request.');
      return;
    }

    const firstCommitSha = commits[commits.length - 1].sha;
    core.setOutput('first_commit_sha', firstCommitSha);
    console.log(`First commit SHA of the PR branch is ${firstCommitSha}`);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();