const { execSync } = require("child_process");

function extendSandbox(githubRepo, issueNumber) {

  // Function to extend TTL of sandbox
  function updateSandboxStatus(sandboxVariableName, sandboxData) {
    const updatedSandboxData = {
      ...sandboxData,
      isActive: true,
      status: "Available",
      isExtended: true,
    };

    // execSync(
    //   `gh variable set "${sandboxVariableName}" -b '${JSON.stringify(
    //     updatedSandboxData
    //   )}' --repo ${githubRepo}`
    // );

    execSync(
      `gh api \
      --method PATCH \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      /repos/${githubRepo}/actions/variables/${sandboxVariableName} \
      -f name='${sandboxVariableName}' \
      -f value='${JSON.stringify(updatedSandboxData)}' `
      )
    
    console.error(`Marked sandbox ${sandboxData.name} for last extension.`);
    console.log(sandboxData.name);
  }

  // Fetch all variables
  let variables;
  try {
    const output = execSync(
      `gh api /repos/${githubRepo}/actions/variables --paginate | gh merge-json`
    ).toString();
    variables = JSON.parse(output).variables;
  } catch (e) {
    console.error(`Error fetching variables: ${e.message}`);
    return;
  }

  // Filter for sandboxes assigned to the specified issue
  const sandboxPattern = new RegExp(`_SBX$`);

  for (const variable of variables) {
    if (sandboxPattern.test(variable.name)) {
      console.error(`Checking Sandbox`,JSON.parse(variable.value))
      const sandboxData = JSON.parse(variable.value);
      if (sandboxData.issue === issueNumber && ( !sandboxData.isExtended )) {
        // Mark the sandbox as expired
        isSandboxFound=true;
        updateSandboxStatus(variable.name, sandboxData);
      }
      else if( sandboxData.issue === issueNumber && sandboxData.isExtended )
      {
        throw new Error(`Sandbox is already extended, Unable to extend further`)
      }
    }
  }

}

let isSandboxFound=false;
const [githubRepo, issueNumber] = process.argv.slice(2);
extendSandbox(githubRepo,issueNumber);

if(!isSandboxFound)
{
 throw new Error(`No Sandbox found to extend for issue ${issueNumber}`)
}
