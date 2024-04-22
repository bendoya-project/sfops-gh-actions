const { Octokit } = require("@octokit/rest");
const yargs = require("yargs");

// Parse command-line arguments
const argv = yargs
  .option('token', {
    describe: 'GitHub token',
    type: 'string',
    demandOption: true
  })
  .option('owner', {
    describe: 'Repository owner',
    type: 'string',
    demandOption: true
  })
  .option('repo', {
    describe: 'Repository name',
    type: 'string',
    demandOption: true
  })
  .option('label', {
    describe: 'Label to filter issues',
    type: 'string',
    default: 'ops-accesslevel-escalation'
  })
  .option('default', {
    describe: 'Default threshold value for closing issues',
    type: 'number',
    default: 30 // Default value remains 30
  })
  .option('unit', {
    describe: 'Unit of time for the default threshold (mins, hours, days)',
    type: 'string',
    default: 'mins' // Default unit is minutes
  })
  .option('parseString', {
    describe: 'String to look for in issue body for parsing the custom threshold value',
    type: 'string',
    demandOption: true
  })
  .help()
  .alias('help', 'h')
  .argv;

// Initialize Octokit with the provided token
const octokit = new Octokit({ auth: argv.token });

// Function to convert the default threshold value to minutes based on the provided unit
function convertToMinutes(value, unit) {
  switch (unit.toLowerCase()) {
    case 'days':
      return value * 1440; // 1 day = 1440 minutes
    case 'hours':
      return value * 60; // 1 hour = 60 minutes
    case 'mins':
    default:
      return value; // Assume value is already in minutes if unit is 'mins' or unrecognized
  }
}

async function closeStaleIssues(owner, repo, label, defaultValue, unit, parseString) {

console.error(`----------------------------------------------------`);
console.error(`🤖  sfops github actions                            `);
console.error(`🚧  Action: closeStaleIssuesAfterThresholdMins`);
console.error(`----------------------------------------------------`);
console.error();
console.error(`ℹ️  label: ${label}`);
console.error(`ℹ️  default: ${defaultValue}`);
console.error(`ℹ️  parseString: ${parseString}`);
console.error(`ℹ️  unit: ${unit}`);
console.error();


  const now = new Date();
  const defaultMins = convertToMinutes(defaultValue, unit);

  console.log(`ℹ️ Fetching issues with label #${label} and status is open...`);

  for await (const response of octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
    owner: owner,
    repo: repo,
    state: 'open',
    labels: label,
  })) {
    for (const issue of response.data) {
      console.log(`ℹ️ Processing issue #${issue.number}...`);
      const issueCreatedAt = new Date(issue.created_at);
      const minsSpent = Math.ceil((now - issueCreatedAt) / (1000 * 60)); // Calculate the time spent in minutes

      const lines = issue.body.split("\n");
      const questionIndex = lines.findIndex(line => line.includes(parseString));
      if (questionIndex !== -1 && lines.length > questionIndex + 2) {
        console.log(`ℹ️  Found the parse string at index ${questionIndex}...`);
        let thresholdMins = parseInt(lines[questionIndex + 2].trim(), 10);
        thresholdMins = isNaN(thresholdMins) || thresholdMins < 1 ? defaultMins : convertToMinutes(thresholdMins, unit);

        console.log(`ℹ️  Threshold mins: ${thresholdMins}... Mins spent: ${minsSpent}... Issue #${issue.number}`);
        if (minsSpent > thresholdMins) {
          try {
            await octokit.rest.issues.update({
              owner: owner,
              repo: repo,
              issue_number: issue.number,
              state: 'closed'
            });
            console.log(`✅   Closed issue #${issue.number}`);
          } catch (error) {
            console.error(`❌  Error closing issue #${issue.number}: ${error}`);
          }
        }
      }
    }
  }
}

// Run the script with the provided arguments
closeStaleIssues(argv.owner, argv.repo, argv.label, argv.default, argv.unit, argv.parseString);
