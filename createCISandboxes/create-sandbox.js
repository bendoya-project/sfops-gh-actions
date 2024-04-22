#!/usr/bin/env node

const { spawn } = require("child_process");
const fs = require("fs");
const crypto = require("crypto");

function generateName() {
  let randomBytes = crypto.randomBytes(4);
  let randomInt = randomBytes.readUInt32BE(0);
  let random9DigitNumber = (randomInt % 900000000) + 100000000;
  return random9DigitNumber;
}

function createPromiseHandler(resolve, reject) {
  let called = false;

  return {
    resolveOnce: (result) => {
      if (!called) {
        called = true;
        resolve(result);
      }
    },
    rejectOnce: (error) => {
      if (!called) {
        called = true;
        reject(error);
      }
    }
  };
}

async function createSandbox(
  name,
  domain,
  sourceForSandbox,
  devhubUserName,
  apexClassId,
) {
  return new Promise((resolve, reject) => {

    const { resolveOnce, rejectOnce } = createPromiseHandler(resolve, reject);

    // Create Sandbox Definition File
    let sandboxDefinition = {
      sandboxName: name,
      autoActivate: true,
      description: `CI Sandboxes Auto Provisioned for ${domain}`,
    };

    if (sourceForSandbox == "production") {
      sandboxDefinition["licenseType"] = "DEVELOPER";
    } else {
      sandboxDefinition["SourceSandboxName"] = sourceForSandbox;
    }

    if (apexClassId && apexClassId != "null") {
      // JQ might set null as a string
      sandboxDefinition["apexClassId"] = apexClassId;
    }

    fs.writeFileSync(`${name}.json`, JSON.stringify(sandboxDefinition));

    console.log(`ℹ️  Sandbox Definition File Created for ${name}`);
    console.log(JSON.stringify(sandboxDefinition));

    let sfdxCommand;

    // Hack to get around the issue with sfdx org create sandbox command
    if (!sandboxDefinition.SourceSandboxName)
      sfdxCommand = spawn("sf", [
        "org",
        "create",
        "sandbox",
        "--async",
        "-f",
        `${name}.json`,
        "-a",
        name,
        "-o",
        `${devhubUserName}`,
        "--no-prompt",
        "--json",
      ]);
    else
      sfdxCommand = spawn("sf", [
        "org",
        "create",
        "sandbox",
        "--async",
        "-f",
        `${name}.json`,
        "-a",
        name,
        "-o",
        `${devhubUserName}`,
        "-c",
        `${sourceForSandbox}`,
        "--no-prompt",
        "--json",
      ]);

    console.log(`ℹ️  Requested sandbox creation for ${name}`);

    sfdxCommand.stdout.on("data", (data) => {
      console.log(`::group:: ℹ️ Displaying output from sf cli for ${name}`);
      console.log(`${data}`);
      console.log(`::endgroup::`);
      if (data.messsage?.includes(`Lock file is already being held`)) {
       
        console.log("✅ Sandbox creation request submitted successfully.");
        fs.unlinkSync(`${name}.json`);
        resolveOnce(name);
      }
      else if(data.includes(`Attempt to add sandbox of type Developer failed because but you have reached your provisioned limit of 1`))
      {
        console.log(`❌  Attempt to add sandbox of type Developer failed because but you have reached your provisioned limit of 1`);
        rejectOnce(`Failed to create sandbox: ${name}`);
      }
     
    });

    sfdxCommand.stderr.on("data", (data) => {
      if (data.messsage?.includes(`Lock file is already being held`)) {
        console.log("✅ Sandbox creation request submitted successfully.");
        fs.unlinkSync(`${name}.json`);
        resolveOnce(name);
      }
      else
      {
        console.log(`❌  Displaying output from sf cli for ${name}`);
        console.error(`  Error: ${data}`);
        rejectOnce(`Failed to create sandbox: ${name}`);
      }
    });

    sfdxCommand.on("close", (code) => {
      if (code == 68 || code == 0) {
        console.log(`✅ Sandbox requested submitted successfully for ${name}`);
        fs.unlinkSync(`${name}.json`);
        resolveOnce(name);
      } else {
        console.log(`❌  sf cli request exited with code ${code} for ${name}, Please contact sfops support`);
        rejectOnce(`Failed to create sandbox: ${name}`);
      }
    });
  });
}

async function main() {
  let domain = process.argv[2];
  let count = process.argv[3];
  if (!process.argv[4]) {
    throw new Error("❌  No Source Sandbox provided");
  }
  let sourceForSandbox = process.argv[4];
  let devHubUserName = process.argv[5];
  let apexClassId = process.argv[6];

  let sandboxPromises = [];

  for (let i = 0; i < count; i++) {
    let name = generateName();
    sandboxPromises.push(
      createSandbox(
        name,
        domain,
        sourceForSandbox,
        devHubUserName,
        apexClassId,
      ),
    );
  }

  let results = await Promise.allSettled(sandboxPromises);

  let successfullSandboxes = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);

  fs.writeFileSync(`${domain}.json`, JSON.stringify(successfullSandboxes));
}

main().catch((error) => console.error("❌  An error occurred during the request:", error));
