const { execSync } = require("child_process");
const fs = require("fs");

async function getSandboxStatus(githubRepo) {
  console.error(`🔄 Fetching all github variables  from ${githubRepo}...`);

  const output = execSync(
    `gh api /repos/${githubRepo}/actions/variables --paginate | gh merge-json | jq -r .variables[].name`
  ).toString();

  const sandboxNames = output.trim().split("\n");
  if (sandboxNames.length === 0 || sandboxNames[0] === "") {
    console.error("❌ No variables found...");
    process.exit(1);
  }

  let devSandboxes = [];
  let ciSandboxes = [];

  for (let sandboxName of sandboxNames) {
    if (sandboxName.trim() === "") continue;

    // Determine type and extract domain
    let type = sandboxName.endsWith("_DEVSBX")
      ? "Developer"
      : sandboxName.endsWith("_SBX")
      ? "CI"
      : null;
    if (!type) continue;
    let domain = sandboxName.split("_").slice(0, -3).join("_");

    const sandboxVariable = JSON.parse(
      execSync(
        `gh api /repos/${githubRepo}/actions/variables/${sandboxName.trim()}`
      ).toString()
    );

    let sandbox = JSON.parse(sandboxVariable.value);
    //Insert Requested At TimeStamp
    sandbox['requested_at'] =  sandboxVariable.created_at;

    //Update Assgined At time
    if(type!== "Developer") {
      if(sandbox.assignedAt) {     
        sandbox['assigned_at'] = new Date(Number.parseInt(sandbox.assignedAt)).toISOString();
      }
    }
    sandbox.domain = domain;
    if (sandbox.createdAt) {
      try {
        sandbox.created_at = new Date(Number.parseInt(sandbox.createdAt)).toISOString();
      } catch (error) {
        console.error(
          `❌ Error parsing date ${sandbox.createdAt} for sandbox ${sandboxName}`
        );
        console.error(error);
        //Assign to variable created time
        sandbox.created_at = new Date(sandboxVariable.created_at).getTime()
      }
    } else {
      //Use variable creation time only for develoment sandboxes
      if (type === "Developer") {
        sandbox.created_at = sandboxVariable.created_at;
      }
    }

    sandbox.type = type;

    if (type === "Developer") {
      devSandboxes.push(sandbox);
    } else {
      ciSandboxes.push(sandbox);
    }
  }

  return { devSandboxes, ciSandboxes };
}

function writeSandboxDetailsToFile(sandboxes, filename) {
  fs.writeFileSync(filename, JSON.stringify(sandboxes, null, 2));
  console.log(`✅ Sandbox details written to ${filename}`);
}

const [githubRepo] = process.argv.slice(2);

console.log(`ℹ️  Executing sandboxStatus.js`);
getSandboxStatus(githubRepo)
  .then(({ devSandboxes, ciSandboxes }) => {
    writeSandboxDetailsToFile(devSandboxes, "developer_sandboxes.json");
    writeSandboxDetailsToFile(ciSandboxes, "ci_sandboxes.json");
  })
  .catch((err) => console.error("❌ Error fetching sandbox status:", err));
