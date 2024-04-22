/**
 * Usage:
 *
 * This script is used to check the status of sandboxes in Salesforce and perform necessary actions.
 *
 * 1. Ensure that Salesforce CLI is installed and authenticated with the necessary orgs.
 * 2. Run this script using Node.js. For example: `node checkSandboxStatus.js`
 *
 * This script will:
 * - Fetch the list of all sandboxes.
 * - Check the status of each sandbox.
 * - If a sandbox is completed, it will be marked as "Available" or "Assigned" based on its type.
 * - If a sandbox is still in progress, it will be ignored.
 * - For each completed sandbox, necessary actions will be performed such as setting alias, activating users, etc.
 *
 */

const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");
import * as github from "@actions/github";
const { octokitRetry } = import("@octokit/plugin-retry");
import dedent from "dedent-js";

const [
  SCRIPT_PATH,
  TOKEN,
  GITHUB_REPO_OWNER,
  GITHUB_REPO_NAME,
  DEVHUB_USERNAME,
  PATH_TO_POOL_CONFIG,
] = process.argv.slice(2);

const GITHUB_REPO = `${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`;

// Function to run shell commands synchronously
const runCommand = (command, ignoreError = false) => {
  try {
    return execSync(command, { encoding: "utf8", timeout: 300000 }).toString();
  } catch (err) {
    if (!ignoreError) throw Error(err.toString());
  }
};

// Function to find matching pool configuration
const findPoolConfig = (variableName, configJson) => {
  return configJson.find((config) => {
    const poolBranchPattern = `${config.pool
      .toString()
      .toUpperCase()}_${config.branch.toString().toUpperCase()}`;
    return variableName.includes(poolBranchPattern);
  });
};

// Main function to process each sandbox
const processReviewSandbox = async (
  variableName,
  sandboxName,
  poolConfig,
  allSandboxDetails,
) => {
  try {
    console.log(`🚧  Processing Sandbox ${sandboxName}`);
    let sandboxStatus = "InProgress";

    for (const fetchedSandboxDetail of allSandboxDetails) {
      if (sandboxName == fetchedSandboxDetail.SandboxName) {
        sandboxStatus = fetchedSandboxDetail.Status;
        break;
      }
    }

    console.log(`${sandboxName}:${sandboxStatus}`);
    if (sandboxStatus === "Completed") {

      let loginDetails = JSON.parse(
        runCommand(
          `sfp org login sandbox --name ${sandboxName} -v ${DEVHUB_USERNAME} -a  ${sandboxName} --json`,
        ),
      );


      const usersToBeActivated = poolConfig?.usersToBeActivated;
      if (usersToBeActivated) {
        console.log(`🚧  Attempting to activate/deactivate users in  ${sandboxName}`);
        const usersArray = usersToBeActivated
          .split(",")
          .map((user) => `${user}@${sandboxName}`);
        const usersString = usersArray.join(",");

        execSync(
          `node ${path.join(
            SCRIPT_PATH,
            "dist/deactivate-all-users/index.js",
          )} ${usersString} ${sandboxName}`,
        );
      }

      const value = JSON.stringify({
        name: sandboxName,
        status: "Available",
        isActive: "true",
        createdAt: Date.now(),
      });
      // runCommand(
      //   `gh variable set ${variableName} -b '${value}' --repo ${GITHUB_REPO}`
      // );

      runCommand(
        `gh api \
      --method PATCH \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      /repos/${GITHUB_REPO}/actions/variables/${variableName} \
      -f name='${variableName}' \
      -f value='${value}' `,
      );

      console.log(
        `✅ Sandbox ${sandboxName} is  marked as available at ${variableName}`,
      );
      try {
        runCommand(
          `sfp metrics:report -m "sandbox.created" -t counter -g '{\"type\":\"review\"}'`,
        );
      } catch (error) {
        console.log(
          `Skipping posting metric.. Check whether datadog env variable is properly configued`,
        );
      }
    }
  } catch (err) {
    console.error(`Error processing sandbox ${sandboxName}:`, err);
  }
};

const processDevSandbox = async (variableName, sandbox, allSandboxDetails) => {
  try {
    console.log(`ℹ️  Processing Developer Sandbox ${sandbox.name}`);
    let sandboxStatus;

    for (const fetchedSandboxDetail of allSandboxDetails) {
      if (sandbox.name == fetchedSandboxDetail.SandboxName) {
        sandboxStatus = fetchedSandboxDetail.Status;
        break;
      }
    }

    if (sandboxStatus === "Completed") {
      console.log(
        `🚧  Attempting to login to sandbox ${sandbox.name} to set it to pool`,
      );

      try {
        let loginDetails = JSON.parse(
          runCommand(
            `sfp org login sandbox --name ${sandbox.name} -v ${DEVHUB_USERNAME} -a  ${sandbox.name} --json`,
          ),
        );
      } catch (error) {
        console.log(`Error logging into sandbox ${sandbox.name}`, error);
        return;
      }

      //login succesful , now create user

      console.log(`🚧  Attempting to create a user in  ${sandbox.name}`);

      let userDetails = JSON.parse(
        runCommand(
          `sfp dev create -o ${sandbox.name} -e ${sandbox.email}  -r --json`,
        ),
      );

      console.log(
        `✅ User succesfully created in  ${sandbox.name} with username ${userDetails.username}`,
      );

      // Create an octokit client with the retry plugin
      const octokit = github.getOctokit(TOKEN, {
        additionalPlugins: [octokitRetry],
      });

      //Set default expiry
      const expiry = sandbox.expiry ? sandbox.expiry : 15;

      let message = "";
      if (!userDetails?.isTargetUserPasswordReset) {
        message = dedent(
          `Hello @${sandbox.requester} :wave:     
      Your sandbox has been created successfully. 
      
      Please find the details below

      - Sandbox Name: ${sandbox.name}
      - UserName: ${userDetails.username}
      - Expiry In: ${expiry}  days

      Please check your email for details, on how to reset your password and get access to this org.
      Please note this sandbox would get automatically deleted when the number of days mentioned above expires.

      __Please note closing this issue will delete the sandbox__

      If you are asked for a password hint for any reason type in __San Francisco__ or ask your admin for details
                      
      This issue was processed by [sfops 🤖]`,
        );
      } else {
        message = dedent(
          `Hello @${sandbox.requester} :wave:      
        Your sandbox has been created successfully. However, sfops was not able to provision a user
        sucessfully. So you would need to reach your admin to get your acess sorted out

        Please provide the below details to the administrator

        - Sandbox Name: ${sandbox.name}
        - UserName:  ${userDetails.username}
        - Expiry In: ${expiry} days

        __Please note closing this issue will delete the sandbox__

        If you are asked for a password hint for any reason type in __San Francisco__ or ask your admin for details
      
                          
        This issue was processed by [sfops 🤖]`,
        );
      }

      await octokit.rest.issues.createComment({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_REPO_NAME,
        issue_number: sandbox.issueNumber,
        body: message,
      });

      const value = JSON.stringify({
        ...sandbox,
        createdAt: Date.now(),
        status: "Assigned",
      });

      runCommand(
        `gh api \
        --method PATCH \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        /repos/${GITHUB_REPO}/actions/variables/${variableName} \
        -f name='${variableName}' \
       -f value='${value}' `,
      );
      console.log(
        `✅ Sandbox ${sandbox.name} is  marked as assigned at ${variableName}`,
      );

      //Add source tracking reset
      runCommand(
        `sf project reset tracking --target-org ${sandbox.name}`,
        true,
      );

      console.log(
        `✅  Sandbox ${sandbox.name} is  marked as available at ${variableName}`,
      );
      try {
        runCommand(
          `sfp metrics:report -m "sandbox.created" -t counter -g '{\"type\":\"dev\"}'`,
        );
      } catch (error) {
        console.log(
          `Skipping posting metric.. Check whether datadog env variable is properly configued`,
        );
      }
    }
  } catch (err) {
    console.error(`Error processing sandbox ${sandbox.name}:`, err);
  }
};

// Main execution
(async () => {
  //Fetch all sandbox details
  console.log(`🚧  Fetching all sandbox details.. `);
  runCommand(`sfp status sandbox -v ${DEVHUB_USERNAME} --json`);
  const allSandboxDetails = JSON.parse(
    fs.readFileSync(".sfops/status_sandbox.json", "utf8"),
  );

  //Handle Dev Sandboxes
  console.log(`🚧  Checking status of  Developer Sandboxes.. `);
  const devSandboxesList = runCommand(
    `gh api "/repos/${GITHUB_REPO}/actions/variables" --paginate | gh merge-json | jq '[.variables[] | select(.name | test("_DEVSBX"))]'`,
  );

  if (devSandboxesList) {
    const devSandboxVariables = JSON.parse(devSandboxesList);

    for (const devSandboxVariable of devSandboxVariables) {
      const variableName = devSandboxVariable.name;
      const sandboxDetails = JSON.parse(devSandboxVariable.value);
      if (sandboxDetails.status === "InProgress") {
        console.log(`Processing variable ${variableName}`);
        await processDevSandbox(
          variableName,
          sandboxDetails,
          allSandboxDetails,
        );
      }
    }
  }

  //Handle CI Sandboxes
  console.log(`🚧  Processing CI Sandboxes.. `);
  const configJson = JSON.parse(fs.readFileSync(PATH_TO_POOL_CONFIG, "utf8"));
  const sandboxesList = runCommand(
    `gh api "/repos/${GITHUB_REPO}/actions/variables" --paginate | gh merge-json | jq '[.variables[] | select(.name | test("_SBX"))]'`,
  );

  console.log(`::group:: Fetched CI Sandboxes`);
  console.log(sandboxesList);

  if (!sandboxesList) return;

  const ciSandboxVariables = JSON.parse(sandboxesList);
  console.log(`Fetched Sandboxes: `, ciSandboxVariables.length);
  console.log(`::endgroup::`);

  for (const ciSandboxVariable of ciSandboxVariables) {
    try {
      const variableName = ciSandboxVariable.name;
      const poolConfig = findPoolConfig(variableName, configJson);
      if (poolConfig) {
        const sandboxDetails = JSON.parse(ciSandboxVariable.value);
        console.log(`::group:: Processing Sandbox ${sandboxDetails.name}`);
        console.log(sandboxDetails);
        console.log(`::endgroup::`);
        if (sandboxDetails.status === "InProgress") {
          console.log(`Processing variable ${variableName}`);
          await processReviewSandbox(
            variableName,
            sandboxDetails.name,
            poolConfig,
            allSandboxDetails,
          );
        }
      }
    } catch (error) {
      console.log(`Error processing variable ${ciSandboxVariable}`, error);
    }
  }
})();
