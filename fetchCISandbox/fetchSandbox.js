const { execSync } = require("child_process");

async function findAvailableSandbox(
  githubRepo,
  domain,
  branch,
  issueNumber,
  timeoutMinutes,
  exitOnTimeout
) {
  domain = domain.toUpperCase();
  branch = branch.toUpperCase();
  const end = Date.now() + timeoutMinutes * 60000;

  console.error(`----------------------------------------------------`);
  console.error(`🤖  sfops github actions                            `);
  console.error(`🚧  Action: fetchCISandbox`);  
  console.error(`----------------------------------------------------`);
  console.error();
  console.error(`ℹ️  Pool: ${domain}`);
  console.error(`ℹ️  Branch: ${branch}`);
  


  while (true) {
    const output = execSync(
      `gh api /repos/${githubRepo}/actions/variables --paginate --jq ".variables[] | select(.name | test(\\"^${domain}_${branch}_[^_]*_SBX$\\")).name"`
    ).toString();
    const sandboxes = output.trim().split("\n");

    if (sandboxes.length === 0 || sandboxes[0] === "") {
      console.error(`❌ No Sandbox pools found for domain: ${domain}...Exiting`);
      process.exit(1);
    }


    let firstInUseSandbox = "";
    let firstExpiredSandbox;
    let availableSandbox;
    let isIssueAssigned = false;
    let assignedSandboxInfo;

    // Figure out earlier used sandboxes
    for (const sandboxName of sandboxes) {
      if (sandboxName.trim() === "") continue;

      const sandbox = JSON.parse(
        execSync(
          `gh api /repos/${githubRepo}/actions/variables/${sandboxName.trim()} --jq ".value"`
        ).toString()
      );
      const { status, isActive, name, issue, isExtended, isImmortal } = sandbox;
      console.error(`🔄 Processing Sandbox   name:${name} status:${status} isActive:${isActive} issue:${issue?issue:'N/A'}.`);

      // Check if the sandbox is associated with the issue
      if (issue === issueNumber) {
        if (status === "InUse" && isActive) {
          isIssueAssigned = true;
          console.error(
            `🔄 Sandbox ${name} is in use for issue ${issueNumber}, waiting for 30 seconds...`
          );
          firstInUseSandbox = name;
          break;
        } else if (status === "Available" && isActive) {
          isIssueAssigned = true;
          console.error(
            `✅ Found available sandbox assigned to issue ${issueNumber}: ${name}`
          );
          assignedSandboxInfo = sandbox
          availableSandbox = name;
          break;
        }else if (status == 'Expired')
        {
          if(!firstExpiredSandbox)
              firstExpiredSandbox = name;
        }
      }
    }

    //Issue is not assigned to any sandbox
    //Get first available one
    if(!isIssueAssigned)
    {
      for (const sandboxName of sandboxes) {
        if (sandboxName.trim() === "") continue;
  
        const sandbox = JSON.parse(
          execSync(
            `gh api /repos/${githubRepo}/actions/variables/${sandboxName.trim()} --jq ".value"`
          ).toString()
        );
        const { status, isActive, name, issue } = sandbox;
        console.error(`🔄 Processing Sandbox   name:${name} status:${status} isActive:${isActive} issue:${issue?issue:'N/A'}.`);
        if (!issue && status === "Available" && isActive) {
          console.error(
            `✅ Found an available sandbox at ${sandbox.name} `
          );
          assignedSandboxInfo = sandbox
          assignedSandboxInfo.assignedAt = Date.now(); // Set clock to 24 hours from the time of assignment
          availableSandbox = name;
          break;
        }

      }
    }


    if (availableSandbox) {
      // Update the sandbox status to 'InUse' and assign the issue number
      const updatedSandboxDetails = JSON.stringify({
        ...assignedSandboxInfo,
        issue: issueNumber,
        status: "InUse",
      });
      // execSync(
      //   `gh variable set "${domain}_${branch}_${availableSandbox}_SBX" -b  ${JSON.stringify(
      //     updatedSandboxDetails
      //   )} --repo ${githubRepo}`
      // );
      execSync(
        `gh api \
        --method PATCH \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        /repos/${githubRepo}/actions/variables/${domain}_${branch}_${availableSandbox}_SBX \
        -f name='${domain}_${branch}_${availableSandbox}_SBX' \
        -f value='${updatedSandboxDetails}' `
        )
      console.error(
        `✅ Assigned sandbox ${availableSandbox} to issue ${issueNumber} and marked as InUse.`
      );
      console.log(availableSandbox);
      process.exit(0);
    } else if(isIssueAssigned) {
      const current = Date.now();
      if (current >= end) {
        if (exitOnTimeout === "--exit-on-timeout") {
          console.error(
            `❌ No available sandboxes found within ${timeoutMinutes} minutes. Exiting.`
          );
          process.exit(1);
        } else {
          if(firstExpiredSandbox)
          {
            console.error(`ℹ️ We ran out of time and no sandbox was found, So returning you an expire done temporarily : ${firstExpiredSandbox}`);
            console.log(firstExpiredSandbox);
          }
          else
          {
            console.error(`❌ The sandbox is not unassigned in time,Please try again later!`);
            process.exit(1);
          }
          process.exit(0);
        }
      }

      console.error(
        "🔄 Assigned Sandbox is in use. Waiting for 60 seconds before checking again..."
      );
      await new Promise((resolve) => setTimeout(resolve, 60000));
    } else {
      console.error(`❌ No sandboxes available, nothing to be provided to you!!`);
      process.exit(1);
    }
  }
}

const [
  githubRepo,
  domain,
  branch,
  issueNumber,
  timeoutMinutesStr,
  exitOnTimeout,
] = process.argv.slice(2);
const timeoutMinutes = parseInt(timeoutMinutesStr, 10);

findAvailableSandbox(
  githubRepo,
  domain,
  branch,
  issueNumber,
  timeoutMinutes,
  exitOnTimeout
);
