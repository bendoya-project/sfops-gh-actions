/**
 * Usage:
 * 
 * This script is used to expire old sandboxes in Salesforce.
 * 
 * 1. Ensure that Salesforce CLI is installed and authenticated with the necessary orgs.
 * 2. Ensure that GitHub CLI is installed and authenticated with the necessary repositories.
 * 3. Ensure ' gh extension install heaths/gh-merge-json' is installed.
 * 4. Run this script using Node.js. For example: `node <full_path>/expireOldSandboxes.js in the salesforce repository`
 * 
 * This script will:
 * - Fetch the list of all sandboxes.
 * - Determine the age of each sandbox.
 * - If a sandbox is older than a certain threshold, it will be marked as "expired".
 * - Expired sandboxes will be deleted.
 * 
 */



const { execSync } = require("child_process");
const fs = require("fs");

const GITHUB_REPO = process.argv[2];
const CONFIG_FILE = process.argv[3];

//Make default expiry of 28 hours, which gives usable time of 24 hours
const AVG_SANDBOX_CREATION_TIME = 2;
const DEFAULT_EXPIRATION_HOURS = 24;
const EXTENDED_EXPIRATION_HOURS = 48;

// Fetch the variables
const VARIABLES = JSON.parse(
  execSync(
    `gh api "/repos/${GITHUB_REPO}/actions/variables" --paginate | gh merge-json`
  ).toString()
);

// Read the domains and counts from the config file
const POOLS_AND_COUNTS = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));

for (const {
  pool: POOL_NAME,
  count: COUNT,
  branch: BRANCH,
} of POOLS_AND_COUNTS) {
  const pattern = new RegExp(
    `${POOL_NAME.toUpperCase()}_${BRANCH.toUpperCase()}_[0-9]+_SBX`
  );
  const MATCHING_VARIABLES = VARIABLES.variables
    .filter((v) => pattern.test(v.name))
    .filter((v) => {
      console.log(`\n🚧 Checking ${v.name}`);
      const sandbox = JSON.parse(v.value);
      if (sandbox.status === "InProgress" || sandbox.status === "Expired") {
        console.log(`ℹ️  Status: ${sandbox.status}`);
        console.log(`❓  Proceeding to Expiration?`, false);
        return false;
      }

      console.log(`ℹ️  Status: ${sandbox.status}`);
      let calculationTimeMode = "assignment";
      let assignedDate = new Date();
      if (sandbox.assignedAt) {
        assignedDate = new Date(Number.parseInt(sandbox.assignedAt));
        calculationTimeMode = "assignment";
      } else if (sandbox.createdAt) {
        assignedDate = new Date(Number.parseInt(sandbox.createdAt));
        calculationTimeMode = "creation";
      } else {
        assignedDate = new Date(v.created_at);
        calculationTimeMode = "creation";
      }
      const hoursSinceCreation = (Date.now() - assignedDate) / (1000 * 60 * 60);
      let isExpirationEligible = true;

      if (sandbox.isImmortal) {
        const hoursSinceCreation =
          (Date.now() - assignedDate) / (1000 * 60 * 60);
        console.log(`Hours since ${calculationTimeMode}: ${hoursSinceCreation}`);
        console.log(
          `ℹ️  Immortal Sandboxes are not eligible for expiration, skipping`
        );
        isExpirationEligible = false;
      } else if (sandbox.isExtended) {
        const hoursSinceExtension =
          (Date.now() - assignedDate) / (1000 * 60 * 60);
        console.log(`🔄 Hours since extension: ${hoursSinceExtension}`);
        if (hoursSinceExtension < EXTENDED_EXPIRATION_HOURS) {
          isExpirationEligible = false;
        }
      }

      console.log(`🔄 Hours since  ${calculationTimeMode}: ${hoursSinceCreation}`);
      console.log(`❓  isExpirationEligible : ${isExpirationEligible}`);
      console.log(
        `❓ Proceeding to Expiration?`,
        sandbox.status !== "Expired" &&
          sandbox.status !== "InProgress" &&
          hoursSinceCreation >= DEFAULT_EXPIRATION_HOURS &&
          isExpirationEligible
      );
      return (
        sandbox.status !== "Expired" &&
        sandbox.status !== "InProgress" &&
        hoursSinceCreation >= DEFAULT_EXPIRATION_HOURS &&
        isExpirationEligible
      );
    });

  const CURRENT_COUNT = MATCHING_VARIABLES.length;

  console.log(`\n⛑️ Finalized Details:`);
  console.log(`Pool: ${POOL_NAME}`);
  console.log(`Branch: ${BRANCH.toUpperCase()}`);
  console.log(`Desired available count: ${COUNT}`);
  console.log(`Sandboxes to Expire: ${CURRENT_COUNT}`);

  // Loop through the variables to expire
  for (const variable of MATCHING_VARIABLES) {
    try {
      let valueOfVar = JSON.parse(variable.value);
      console.log(
        `ℹ️  Expiring ${variable.name} due to policy: ${
          valueOfVar.isExtended
            ? `${
                EXTENDED_EXPIRATION_HOURS - AVG_SANDBOX_CREATION_TIME
              }-hour expiry with extension`
            : `${
                DEFAULT_EXPIRATION_HOURS - AVG_SANDBOX_CREATION_TIME
              }-hour minimum age`
        }`
      );
      const value = JSON.stringify({
        ...valueOfVar,
        status: "Expired",
        isActive: "false",
      });

      console.log(`🔄 Expiring ${variable.name}`);
      // Set the GitHub Action variable with updated status
      // execSync(
      //   `gh variable set "${variable.name}" -b '${value}' --repo ${GITHUB_REPO}`,
      // );
      execSync(
        `gh api \
        --method PATCH \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        /repos/${GITHUB_REPO}/actions/variables/${variable.name} \
        -f name='${variable.name}' \
       -f value='${value}' `
      );
      console.log(`✅ Expired sandbox with variable name ${variable.name}`);
    } catch (e) {
      console.log(`❌ Error while expiring ${variable.name}`);
      console.log(e);
    }
  }
}
