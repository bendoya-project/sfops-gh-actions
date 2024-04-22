const { execSync } = require("child_process");
const octokit = require("@octokit/rest");
const dedent = require("dedent-js");
const fs = require("fs");
const path = require('path');

async function checkInUseSandbox(githubRepo, devhubUserName, token) {
  const sandboxDetailsCollection = {};
  const sandboxVariables = getGithubVariables(githubRepo);

  if (sandboxVariables.length === 0 || sandboxVariables[0] === "") {
    console.log(`No Sandboxes found..Exiting`);
    process.exit(1);
  }

  // Figure out assigned  sandboxes
  for (const sandboxVariable of sandboxVariables) {
    try {
      const sandbox  = JSON.parse(sandboxVariable.value);
      console.log(
        `🔄 Checking Sandbox Variable :${sandbox.name}..Status:${sandbox.status}...IsActive:${sandbox.isActive}...Issue:${
          sandbox.issue ? sandbox.issue : "N/A"
        }.`
      );

      // Check if the sandbox is associated with the issue
      if (sandbox.issue && sandbox.status === "Available" && sandbox.isActive) {
        console.log(`ℹ️  Sandbox ${sandbox.name } is assigned for issue ${sandbox.issue}, ...`);
        try {
          console.log(`ℹ️  Authenticating to   ${sandbox.name}`);
          const sandboxDetails = JSON.parse(
            execSync(`sfp org login sandbox -n ${sandbox.name} -v ${devhubUserName} --json`, {
              timeout: 10000,
            })
          );
          sandboxDetailsCollection[sandbox.name] = {
            url: sandboxDetails.frontDoorUrl,
            username: sandboxDetails.username,
            orgId: sandboxDetails.sandboxName,
            issue: sandbox.issue,
          };
        } catch (error) {
          console.log(
            `❌  Skipping Sandbox  ${sandbox.name} authentication due to error during authentication`
          );
          console.error(error.toString());
        }
      
      } else {
        console.log(
          `ℹ️  Sandbox ${sandbox.name} is not assigned for any issue or is in use by an issue, skipping ...`
        );
      }
    } catch (error) {
      console.log(`❌  Skipping Sandbox Variable ${sandboxVariable.name} due to error`);
      console.error(error.message);
    }
  }

  return sandboxDetailsCollection;
}

async function handleSandboxComment(
  client,
  githubRepo,
  sandboxDetailsCollection
) {
  for (const [sandboxVariable, sandboxDetails] of Object.entries(
    sandboxDetailsCollection
  )) {
    try {
      //Check Issue Status in github
      let issueDetails = null;
      try {
        issueDetails = JSON.parse(
          execSync(
            `gh api /repos/${githubRepo}/issues/${sandboxDetails.issue}`,
            {
              timeout: 10000,
            }
          ).toString()
        );
      } catch (error) {
        console.error(
          `❌ Unable to process issue ${sandboxDetails.issue} details from github..Skipping due to \n ${error.message}`
        );
        continue;
      }

      if (issueDetails && issueDetails.state == "closed") {
        continue;
      }

      const message = dedent(`
            <!--Org Details-->

            Please find the updated authentication details of the review org associated with this issue.

            | Org Details      |                                                                                                                                                                                                               |
            | :--------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
            | Org Id           | ${sandboxDetails.orgId}                                                                                                                                                                                            |
            | Username         | ${sandboxDetails.username}                                                                                                                                                                         |
            | Login to the org | [Click Here](${sandboxDetails.url}) |

            ℹ️ This comment will be updated automatically in the next 30 mins. This is to provide you with an updated frontdoor url to your review environment
          `);

      let commentDetails = await getExistingComment(
        client,
        githubRepo.split("/")[0],
        githubRepo.split("/")[1],
        sandboxDetails.issue,
        "<!--Org Details-->"
      );

      if (commentDetails) {
        console.log(`✅ Refresh comment for Sandbox ${sandboxVariable}`);
        await deleteComment(
          client,
          githubRepo.split("/")[0],
          githubRepo.split("/")[1],
          commentDetails.id
        );
        await createComment(
          client,
          githubRepo.split("/")[0],
          githubRepo.split("/")[1],
          sandboxDetails.issue,
          message
        );
      } else {
        console.log(`✅ Creating comment for Sandbox ${sandboxVariable}`);
        await createComment(
          client,
          githubRepo.split("/")[0],
          githubRepo.split("/")[1],
          sandboxDetails.issue,
          message
        );
      }
    } catch (error) {
      console.log(`❌ Skipping Sandbox ${sandboxVariable} due to error`);
      console.error(error.message);
    }
  }
}

function writeSandboxDetailsToFile(details, filePath) {
   // Ensure the directory exists
   const dir = path.dirname(filePath);
   if (!fs.existsSync(dir)){
     fs.mkdirSync(dir, { recursive: true });
   }
 
   // Write the file
   fs.writeFileSync(filePath, JSON.stringify(details, null, 2), 'utf8');
}

async function getExistingComment(
  octokit,
  owner,
  repo,
  issueNumber,
  messageContent
) {
  const parameters = {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  };

  let found;

  for await (const comments of octokit.paginate.iterator(
    octokit.rest.issues.listComments,
    parameters
  )) {
    found = comments.data.find(({ body }) => {
      return (body?.search(messageContent) ?? -1) > -1;
    });

    if (found) {
      break;
    }
  }

  if (found) {
    const { id, body } = found;
    return { id, body };
  }

  return;
}

async function updateComment(octokit, owner, repo, existingCommentId, body) {
  const updatedComment = await octokit.rest.issues.updateComment({
    comment_id: existingCommentId,
    owner,
    repo,
    body,
  });

  return updatedComment.data;
}

async function deleteComment(octokit, owner, repo, existingCommentId) {
  const deletedComment = await octokit.rest.issues.deleteComment({
    comment_id: existingCommentId,
    owner,
    repo,
  });

  return deletedComment.data;
}

async function createComment(octokit, owner, repo, issueNumber, body) {
  const createdComment = await octokit.rest.issues.createComment({
    issue_number: issueNumber,
    owner,
    repo,
    body,
  });

  return createdComment.data;
}

function getGithubVariables(githubRepo) {
  try {
    const command = `gh api /repos/${githubRepo}/actions/variables --paginate --jq ".variables[] | select(.name | test(\\"_SBX$\\")) | {name: .name, value: .value}"`;
    const output = execSync(command, {
      encoding: "utf8",
      timeout: 10000,
    }).toString();
    return JSON.parse(`[${output.trim().split("\n").join(",")}]`);
  } catch (error) {
    console.error("Error getting GitHub variables:", error);
    return [];
  }
}

// Main execution flow
(async () => {
  console.log(`----------------------------------------------------`);
  console.log(`🤖  sfops github actions                            `);
  console.log(`🚧  Action: refreshFrontDoorUrl`);
  console.log(`----------------------------------------------------`);

  const [githubRepo, devhubUserName, ghToken, pathToFile] =
    process.argv.slice(2);
  const client = new octokit.Octokit({ auth: ghToken });
  if (client === undefined || this.client === null) {
    throw new Error("Unable to create GitHub client");
  }

  console.log();
  console.log(`ℹ️  devhub:      ${devhubUserName}`);
  console.log(`ℹ️  output file: ${pathToFile}`);
  console.log();

  const sandboxDetailsCollection = await checkInUseSandbox(
    githubRepo,
    devhubUserName,
    ghToken
  );
  console.log();
  console.log(`✅ Fetched new frontdoor urls for assigned sandboxes`);
  writeSandboxDetailsToFile(sandboxDetailsCollection, pathToFile);
  await handleSandboxComment(client, githubRepo, sandboxDetailsCollection);
  console.log(`✅ FrontDoorUrl details written to ${pathToFile}`);
  console.log(
    `✅ Updated comment with new frontdoor urls for assigned sandboxes`
  );
})();
