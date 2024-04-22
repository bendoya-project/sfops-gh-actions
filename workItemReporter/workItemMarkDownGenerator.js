const fs = require("fs");
const path = require("path");

function validateInput() {
  if (process.argv.length < 6) {
    console.log(
      "Please provide the path to the JSON file, workItemBaseURL, gitHubRepoURL, domain, and orgName as command line arguments.",
    );
    process.exit(1);
  }
}

function readChangelogData(pathToJSON) {
  return JSON.parse(fs.readFileSync(pathToJSON, "utf8"));
}

function groupReleases(changelogData) {
  changelogData.releases.reverse();
  changelogData.releases = changelogData.releases.slice(0, 30);

  let groupedReleases = {};
  let lastReleaseCommits = null;
  changelogData.releases.forEach((release, index) => {
    const commonName = release.names[0].split("-").slice(0, 4).join("-");
    if (!groupedReleases[commonName]) {
      groupedReleases[commonName] = [];
    }

    let releaseCommits = {};
    release.artifacts.forEach((artifact) => {
      artifact.commits.forEach((commit) => {
        releaseCommits[commit.commitId] = commit;
      });
    });

    if (Object.keys(releaseCommits).length === 0 && lastReleaseCommits) {
      release.artifacts.forEach((artifact) => {
        artifact.commits = lastReleaseCommits;
      });
    } else {
      lastReleaseCommits = Object.values(releaseCommits);
    }

    const existingReleaseIndex = groupedReleases[commonName].findIndex(
      (groupedRelease) => groupedRelease.release.names[0] === release.names[0],
    );

    if (existingReleaseIndex !== -1) {
      groupedReleases[commonName][existingReleaseIndex].buildNumbers.push(
        release.buildNumber,
      );
    } else {
      groupedReleases[commonName].push({
        release,
        index,
        buildNumbers: [release.buildNumber],
      });
    }
  });

  return groupedReleases;
}

function getLatestReleases(changelogData, requestedOrgName) {
  let latestReleases = {};
  changelogData.orgs.forEach((org) => {
    if (org.name == requestedOrgName)
      latestReleases[org.name] = { latestRelease: org.latestRelease };
  });
  return latestReleases;
}

function buildOrgReleaseChanges(
  orgName,
  latestRelease,
  changelogData,
  workItemBaseURL,
) {
  let markdown = `## Incoming changes to ${orgName}:\n\n`;

  const currentDeployedIndex = changelogData.releases.findIndex(
    (release) => release.names[0] === latestRelease.names[0],
  );

  let totalIncomingWorkItems = new Set();

  if (currentDeployedIndex == 0) {
    markdown += `No changes.\n`;
  } else {
    for (let i = 0; i < currentDeployedIndex; i++) {
      const release = changelogData.releases[i];
      Object.keys(release.workItems).forEach((workItem) =>
        totalIncomingWorkItems.add(workItem),
      );
    }
    for (const entry of totalIncomingWorkItems) {
      markdown += `- [${entry}](${workItemBaseURL}/${entry})\n`;
    }
  }

  return markdown;
}

function buildReleaseChangesContent(
  latestReleases,
  changelogData,
  workItemBaseURL,
  requestedOrgName,
) {
  let markdown = "\n# Changelog\n\n";
  Object.entries(latestReleases).forEach(([orgName, { latestRelease }]) => {
    if (orgName == requestedOrgName)
      markdown += buildOrgReleaseChanges(
        orgName,
        latestRelease,
        changelogData,
        workItemBaseURL,
      );
  });
  return markdown;
}

function writeMarkdownToFile(markdown, domain) {
  fs.writeFileSync(`changelog-${domain}.md`, markdown);
  console.log("The Markdown file has been saved!");
}

async function generateMarkdown() {
  try {
    validateInput();

    const pathToJSON = process.argv[2];
    const domain = process.argv[3];
    const orgName = process.argv[4];
    const workItemBaseURL = process.argv[5];

    const changelogData = readChangelogData(pathToJSON);
    const groupedReleases = groupReleases(changelogData);
    const latestReleases = getLatestReleases(changelogData, orgName);
    const markdown = buildReleaseChangesContent(
      latestReleases,
      changelogData,
      workItemBaseURL,
      orgName,
    );

    writeMarkdownToFile(markdown, domain);
  } catch (err) {
    console.error(err);
  }
}

generateMarkdown();
