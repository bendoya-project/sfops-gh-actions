const { Octokit } = require("@octokit/rest");
const { retry } = require("@octokit/plugin-retry");
const fs = require("fs");
const path = require("path");

const RetryEnhancedOctokit = Octokit.plugin(retry);
const [owner, repo, pathToFile, token] = process.argv.slice(2);

if (!owner || !repo || !pathToFile || !token) {
  console.error("Usage: node prStatusReporter.js <owner> <repo> <pathToFile> <github_token>");
  process.exit(1);
}

const octokit = new RetryEnhancedOctokit({ auth: token });

async function fetchCommitDifference(owner, repo, base, head) {
  try {
    const { data } = await octokit.repos.compareCommits({
      owner,
      repo,
      base,
      head,
    });

    return {
      behind: data.behind_by,
      ahead: data.ahead_by,
    };
  } catch (error) {
    console.error(`Error fetching commit difference: ${error}`);
    return null;
  }
}

async function fetchPullRequests(owner, repo, state) {
  const pullRequestsMap = {};
  const thresholdDate = state === "closed" ? new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) : null;
  let page = 1;
  let shouldContinue = true;

  while (shouldContinue) {
    const { data: prs } = await octokit.pulls.list({
      owner,
      repo,
      state,
      sort: "created",
      direction: "desc",
      per_page: 100,
      page,
    });

    for (const pr of prs) {
      const prCreatedAt = new Date(pr.created_at);

      if (state === "closed" && prCreatedAt < thresholdDate) {
        shouldContinue = false;
        break;
      }


      let commitDiff;
      if(state!== "closed") {
       commitDiff = await fetchCommitDifference(owner, repo, pr.base.ref, pr.head.ref);
      }

      let mergeActionRunUrl = "";
      let mergeActionConclusion = undefined;
      let mergeActionStatus = undefined;

      if (pr.merged_at && pr.merge_commit_sha) {
        const { data: workflowRuns } = await octokit.actions.listWorkflowRunsForRepo({
          owner,
          repo,
          branch: pr.base.ref,
          event: "push",
          sha: pr.merge_commit_sha,
        });

        const specificWorkflowRun = workflowRuns.workflow_runs.find(
          (run) => run.head_sha === pr.merge_commit_sha && run.name.includes("sfops - On Push to Branch")
        );

        mergeActionStatus = specificWorkflowRun?.status;
        mergeActionConclusion = specificWorkflowRun?.conclusion;
        mergeActionRunUrl = specificWorkflowRun?.html_url || "";
      }

      const { data: commits } = await octokit.pulls.listCommits({
        owner,
        repo,
        pull_number: pr.number,
      });

      const latestCommitSha = commits[commits.length - 1].sha;
      const { data: checks } = await octokit.checks.listForRef({
        owner,
        repo,
        ref: latestCommitSha,
      });

      const statusCheck = checks.check_runs.find((check) => check.name.includes("Status Check - Validate Domain"));

      let filesMap = undefined;
      try {
        filesMap = await fetchFilesMapForPR(owner, repo, pr.number);
      } catch (error) {
        console.error(`ℹ️ Error fetching files for PR ${pr.number}..ignoring: ${error}`);
      }

      pullRequestsMap[pr.number] = {
        issueTitle: pr.title,
        branch: pr.head.ref,
        author: pr.user.login,
        authorAvatarUrl: pr.user.avatar_url,
        labels: pr.labels.map((label) => ({
          key: label.name,
          description: label.description,
        })),
        elapsedTime: new Date() - prCreatedAt,
        linkToIssue: pr.html_url,
        merged: !!pr.merged_at,
        mergeCommitSha: pr.merge_commit_sha,
        mergeActionStatus: mergeActionStatus,
        mergeActionConclusion: mergeActionConclusion,
        buildActionLink: mergeActionRunUrl,
        checkStatus: statusCheck?.status,
        checkConclusion: statusCheck?.conclusion,
        validationActionLink: statusCheck ? statusCheck.html_url : undefined,
        files: filesMap,
        commitsAhead: commitDiff ? commitDiff.ahead : undefined,
        commitsBehind: commitDiff ? commitDiff.behind : undefined,
      };
    }

    if (prs.length < 100 || (state === "open" && !shouldContinue)) {
      shouldContinue = false;
    }

    page++;
  }

  return pullRequestsMap;
}

function writeJSONDetailsToFile(details, filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(details, null, 2), "utf8");
}

async function fetchFilesMapForPR(owner, repo, pull_number) {
  let filesMap = {
    added: [],
    deleted: [],
    modified: [],
  };

  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number,
  });

  files.forEach((file) => {
    if (file.status === "added") {
      filesMap.added.push(file.filename);
    } else if (file.status === "deleted") {
      filesMap.deleted.push(file.filename);
    } else if (file.status === "modified") {
      filesMap.modified.push(file.filename);
    }
  });
  return filesMap;
}

async function main() {
  console.log(`----------------------------------------------------`);
  console.log(`🤖  sfops github actions`);
  console.log(`🚧  Action: prStatusReporter`);
  console.log(`----------------------------------------------------`);
  console.log(`ℹ️  output file: ${pathToFile}`);
  console.log();
  const openPRsMap = await fetchPullRequests(owner, repo, "open");
  const closedPRsMap = await fetchPullRequests(owner, repo, "closed");
  const combinedPRsMap = { openPrs: openPRsMap, closedPrs: closedPRsMap };
  writeJSONDetailsToFile(combinedPRsMap, pathToFile);
  console.log(`✅ Issue status written to ${pathToFile}`);
}

main();
