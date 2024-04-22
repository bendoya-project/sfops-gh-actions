const { execSync } = require("child_process");

async function checkInUseSandbox(
  githubRepo,
  domain,
  branch,
  issueNumber,
) {
  domain = domain.toUpperCase();
  branch = branch.toUpperCase();

    const output = execSync(
      `gh api /repos/${githubRepo}/actions/variables --paginate --jq ".variables[] | select(.name | test(\\"^${domain}_${branch}_[^_]*_SBX$\\")).name"`
    ).toString();
    const sandboxes = output.trim().split("\n");

    if (sandboxes.length === 0 || sandboxes[0] === "") {
      console.error(`No Sandbox pools found for domain: ${domain}...Exiting`);
      process.exit(1);
    }

    let firstInUseSandbox = "";

    // Figure out earlier used sandboxes
    for (const sandboxName of sandboxes) {
      if (sandboxName.trim() === "") continue;

      const sandbox = JSON.parse(
        execSync(
          `gh api /repos/${githubRepo}/actions/variables/${sandboxName.trim()} --jq ".value"`
        ).toString()
      );
      const { status, isActive, name, issue } = sandbox;
      console.error(`Checking Name:${name}..Status:${status}...IsActive:${isActive}...Issue:${issue?issue:'N/A'}.`);

      // Check if the sandbox is associated with the issue
      if (issue === issueNumber) {
        if (isActive) {
          isIssueAssigned = true;
          console.error(
            `Sandbox ${name} is in use for issue ${issueNumber}, ...`
          );
          firstInUseSandbox = name;
          console.log(firstInUseSandbox);
          break;
        } 
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

checkInUseSandbox(
  githubRepo,
  domain,
  branch,
  issueNumber
);
