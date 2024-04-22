const { Octokit } = require("@octokit/rest");
const { retry } = require("@octokit/plugin-retry");
const { execSync } = require("child_process");

const OctokitEnhancedByRetry = Octokit.plugin(retry);

// Extracting command line arguments for owner, repo, and token
const [owner, repo, token] = process.argv.slice(2);

// Setting date to the provided argument or to today's date in UTC if not provided
let date = process.argv[5];
if (!date) {
  const today = new Date();
  // Format the date as "YYYY-MM-DD" in UTC
  date = today.toISOString().substring(0, 10);
}

const octokit = new OctokitEnhancedByRetry({
  auth: token,
  request: {
    retries: 3,
  },
});

console.log(`----------------------------------------------------`);
console.log(`🤖  sfops github actions                            `);
console.log(`🚧  Action: ghmetrics`);
console.log(`----------------------------------------------------`);
console.log();
console.log(`ℹ️  Repo: ${owner}/${repo}`);
console.log(`ℹ️  Date: ${date}`);
console.log();

if (!owner || !repo || !token) {
  console.log("Usage: node ghmetrics.js <owner> <repo> <token> [date]");
} else {
  computeElapsedTime(owner, repo, date).then(() =>
    computeOpenPRs(owner, repo, date)
  );
}

async function computeElapsedTime(owner, repo, date) {
  console.log(`ℹ️ Computing Elapsed Time for date: ${date}`);
  try {
    const sinceDate = new Date(date);
    sinceDate.setUTCHours(0, 0, 0, 0);

    const { data: prs } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: "closed",
      sort: "updated",
      direction: "desc",
      since: sinceDate.toISOString()
    });

    const mergedPRs = prs.filter(
      (pr) =>
        pr.merged_at && new Date(pr.merged_at).toISOString().startsWith(date)
    );

    if (mergedPRs.length == 0) {
      console.log(`✔️  No PRs merged on ${date}`);
      return;
    }

    for (const pr of mergedPRs) {
      const prDetails = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pr.number,
      });

      const createdAt = new Date(pr.created_at);
      const mergedAt = new Date(pr.merged_at);
      const elapsedTime = mergedAt - createdAt;

      console.log(
        `✔️ Elapsed time for PR #${pr.number}: ${
          elapsedTime / 1000 / 60
        } minutes`
      );
      console.log(
        `✔️ Changed files for PR #${pr.number}: ${prDetails.data.changed_files}`
      );

      // Post metrics using sfp
      try {
        runCommand(
          `sfp metrics:report -m 'pr.elapsed.time' -t 'timer' -v '${elapsedTime}'`
        );
        runCommand(
          `sfp metrics:report -m 'pr.files.impacted' -t 'gauge' -v '${prDetails.data.changed_files}'`
        );
      } catch (error) {
        console.log(
          `❌ Skipping posting metric.. Check whether datadog env variable is properly configued`
        );
      }
    }
  } catch (err) {
    console.error(`❌ Error fetching PRs: ${err}`)
  }
}

async function computeOpenPRs(owner, repo, date) {
  console.log(`ℹ️ Computing Open PRs for date: ${date}`);
  try {
    const sinceDate = new Date(date);
    sinceDate.setUTCHours(0, 0, 0, 0);

    const { data: prs } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: "open",
      sort: "created",
      direction: "desc",
      since: sinceDate.toISOString(),
    });

    const createdPRs = prs.filter((pr) =>
      new Date(pr.created_at).toISOString().startsWith(date)
    );

    console.log(`✔️  PRs created on ${date}: ${createdPRs.length}`);

    try {
      runCommand(
        `sfp metrics:report -m 'pr.open' -t 'gauge' -v '${createdPRs.length}'`
      );
    } catch (error) {
      console.log(
        ` ❌ Skipping posting metric.. Check whether datadog env variable is properly configued`
      );
    }
  } catch (err) {
    console.error(`❌ Error fetching PRs: ${err}`);
  }
}

const runCommand = (command, ignoreError = false) => {
  try {
    return execSync(command, { encoding: "utf8", timeout: 300000 }).toString();
  } catch (err) {
    if (!ignoreError) throw Error(err.stderr.toString());
  }
};
