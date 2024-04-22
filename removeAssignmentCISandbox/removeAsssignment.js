const { execSync } = require("child_process");

function markSandboxAsExpiredOrAvailable(githubRepo, issueNumber,returnBackToPool) {
  // Function to update sandbox status to 'Expired'
  function updateSandboxStatus(sandboxVariableName, sandboxData) {
    const updatedSandboxData = {
      ...sandboxData,
      isActive: returnBackToPool=='true'? true : false,
      assignedAt : returnBackToPool=='true'?Date.now():sandboxData.assignedAt,
      status: returnBackToPool=='true'? "Available" : "Expired",
      issue: returnBackToPool=='true'? undefined : sandboxData.issue,
    };

    // Update the sandbox variable
    execSync(
      `gh api \
      --method PATCH \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      /repos/${githubRepo}/actions/variables/${sandboxVariableName} \
      -f name='${sandboxVariableName}' \
      -f value='${JSON.stringify(updatedSandboxData)}' `,
    );
    if(!returnBackToPool)
     console.error(`✅ Marked sandbox ${sandboxData.name} as expired.`);
    else 
      console.error(`✅ Marked sandbox ${sandboxData.name} as available.`);

    console.error(`✅ Values updated for ${sandboxData.name} to ${JSON.stringify(updatedSandboxData)}`);
    console.log(sandboxData.name);
  }

  // Fetch all variables
  let variables;
  try {
    const output = execSync(
      `gh api /repos/${githubRepo}/actions/variables --paginate | gh merge-json`,
    ).toString();
    variables = JSON.parse(output).variables;
  } catch (e) {
    console.error(`❌ Error fetching variables: ${e.message}`);
    return;
  }

  // Filter for sandboxes assigned to the specified issue
  const sandboxPattern = new RegExp(`_SBX$`);
  for (const variable of variables) {
    if (sandboxPattern.test(variable.name)) {
      console.error(`Checking Sandbox`, JSON.stringify(JSON.parse(variable.value)));
      const sandboxData = JSON.parse(variable.value);
      if (
        sandboxData.issue === issueNumber &&
        sandboxData.status != "Expired"
      ) {
        // Mark the sandbox as expired or return to pool
        isSandboxFound = true;
        updateSandboxStatus(variable.name, sandboxData,returnBackToPool);
      } else if (
        sandboxData.issue === issueNumber &&
        sandboxData.status === "Expired"
      ) {
        isSandboxFound = true;
        console.error(`✅ Sandbox ${sandboxData.name} is already expired.`);
        updateSandboxStatus(variable.name, sandboxData);
      }
    }
  }
}

const [githubRepo, issueNumber,returnBackToPool] = process.argv.slice(2);

console.error(`----------------------------------------------------`);
console.error(`🤖  sfops github actions                            `);
console.error(`🚧  Action: removeAssignment`);
console.error(`📦  Repo: ${githubRepo}`);
console.error(`🔖  Issue: ${issueNumber}`);
console.error(`🔙  Return to Pool: ${returnBackToPool}`);
console.error(`----------------------------------------------------`);
console.error();

let isSandboxFound = false;


// Display argument
console.error(`ℹ️  Issue Number: ${issueNumber}`);

markSandboxAsExpiredOrAvailable(githubRepo, issueNumber,returnBackToPool);

if (!isSandboxFound) {
  throw new Error(`❌ No Sandbox found to remove assignment for issue ${issueNumber}`);
}

console.error(`✅ Done.`);
