/**
 * Usage:
 * 
 * This script is used to delete expired sandboxes in Salesforce.
 * 
 * 1. Ensure that Salesforce CLI is installed and authenticated with the necessary orgs.
 * 2. Ensure that GitHub CLI is installed and authenticated with the necessary repositories.
 * 3. Ensure ' gh extension install heaths/gh-merge-json' is installed.
 * 4. Run this script using Node.js. For example: `node deleteExpiredSandboxes.js <GITHUB_REPO> <DEVHUB_USERNAME>`
 * 
 * This script will:
 * - Delete the sandbox using sfp org sandbox delete comand
 */


const { execSync } = require("child_process");


// Function to run shell commands synchronously
const runCommand = (command, ignoreError=false) => {
  try {
    return execSync(command).toString();
  } catch (err) {
    console.error(err.stderr.toString());
    if (!ignoreError) throw Error(err.stderr.toString());
  }
};

/**
 * Deletes a sandbox.
 * @param {string} devHubUserName - The username of the Dev Hub org.
 * @param {string} sandboxName - The name of the sandbox to be deleted.
 * @returns {boolean} - Returns true if the sandbox is successfully deleted, false otherwise.
 */


function deleteSandbox(devHubUserName, sandboxName) {
  console.log(`Deleting sandbox: ${sandboxName}`);
  try {
    let output=runCommand(`sfp sandbox delete -n ${sandboxName} -v ${devHubUserName} --json || true`);
    console.log(output);
    let result = JSON.parse(output);
    if (result.error) {
      if (result.error.name === 'SandboxProcessResultLengthError') {
        console.log('Sandbox already deleted from backend, so returning success');
        return true;
      } else {
        console.error(`An error occurred: ${result.error.name}`);
        return false;
      }
    } else if (result.deleted) {
      console.log(`Successfully deleted sandbox: ${sandboxName}`);
      return true;
    } else {
      console.error('An unexpected response was received.');
      return false;
    }
  } catch (error) {
    console.error(`Error deleting sandbox: ${sandboxName}`, error.message);
    return false;
  }
}


function getGithubVariables(githubRepo) {
  try {
      const command = `gh api /repos/${GITHUB_REPO}/actions/variables --paginate | gh merge-json | jq '[.variables[] | select(.name |  test("_SBX")) | {name: .name, value: .value}]'`
      const output = execSync(command).toString();
      return JSON.parse(output);
  } catch (error) {
      console.error('Error getting GitHub variables:', error);
      return [];
  }
}



const GITHUB_REPO = process.argv[2]; // GitHub Repository
const devHubUserName = process.argv[3]; // DevHub Username



console.log('\nInitiating Sandbox deletion process for expired Orgs...');

// Filter variables marked for expiry
const variablesForDeletion = getGithubVariables().filter(variable => {
  console.log(`Checking Sandbox`,variable.name,`with value`, variable.value);
  const value = JSON.parse(variable.value);
  return value.status === 'Expired';

});

variablesForDeletion.forEach(variable => {
  const sandboxName = JSON.parse(variable.value).name;
  const variableName = variable.name;
  console.log(`\n\nDeleting...`,sandboxName);
  if (deleteSandbox(devHubUserName, sandboxName)) {
    console.log(`Deleting GitHub variable: ${variableName}`);
    try {
      runCommand(`gh variable delete ${variableName} --repo ${GITHUB_REPO}`);
      console.log(`Successfully deleted GitHub variable: ${variableName}`);
    } catch (error) {
      console.error(`Error deleting GitHub variable: ${variableName}`, error.message);
    }
  }
});

console.log('Sandbox deletion process completed.');
