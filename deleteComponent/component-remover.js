const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const child_process = require("child_process");
const uuid = require("uuid");

async function run() {
  // Process arguments
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error(
      "Usage: node script.js metadatatype:name1,metadatatype:name2... source_org target_devhub",
    );
    process.exit(1);
  }

  const metadata = args[0].split(",");
  const source_org = args[1];
  const target_devhub = args[2];

  // Prepare temp directory
  const tempDir = path.join(os.tmpdir(), "component_remover");
  console.log(`Preparing temporary directory: ${tempDir}`);
  await fs.remove(tempDir); // Remove directory if it exists
  await fs.ensureDir(tempDir); // Create directory

  let packageCreated = false;
  let packageId;
  let subscriberPackageVersionId;
  try {
    // Change working directory and execute commands

    child_process.execSync("sf plugins install packaging", { stdio: "ignore" });

    console.log(`Generating project...`);
    process.chdir(tempDir);
    child_process.execSync(
      "sf project generate -n component-remover --api-version=58.0",
      { stdio: "ignore" },
    );

    console.log(`Retrieving project...`);
    process.chdir(path.join(tempDir, "component-remover"));
    child_process.execSync(
      `sf project retrieve start ${metadata
        .map((m) => `-m ${m}`)
        .join(" ")} -o ${source_org}`,
      { stdio: "inherit" },
    );

    console.log(`Creating package...`);
    const packageCommand = `sf package create -n delete-package-${uuid
      .v4()
      .slice(
        0,
        5,
      )} -v ${target_devhub} --org-dependent -r force-app -t Unlocked --json`;
    const packageOutput = JSON.parse(
      child_process.execSync(packageCommand).toString(),
    );

    packageId = packageOutput.result.Id;
    console.log(`Created package with ID: ${packageId}`);

    console.log(`Creating version...`);
    const versionCommand = `sf package version create -p ${packageId} -v ${target_devhub} -x -d force-app -w 10 --json`;
    const versionOutput = JSON.parse(
      child_process.execSync(versionCommand).toString(),
    );

    subscriberPackageVersionId =
      versionOutput.result.SubscriberPackageVersionId;
    console.log(
      `Created version with SubscriberPackageVersionId: ${subscriberPackageVersionId}`,
    );

    console.log(`Promoting package...`);
    child_process.execSync(
      `sf package version promote  -v ${target_devhub}  -n -p ${subscriberPackageVersionId}`,
      { stdio: "inherit" },
    );

    packageCreated = true;

    console.log(`Installing package...`);
    child_process.execSync(
      `sf package install -o ${source_org} -r -w 90 -b 10 -a package -p ${subscriberPackageVersionId}`,
      { stdio: "inherit" },
    );

    console.log(`Uninstalling package...`);
    child_process.execSync(
      `sf package uninstall -o ${source_org} -p ${subscriberPackageVersionId} -w 90`,
      { stdio: "inherit" },
    );

    console.log(`Deleting version...`);
    child_process.execSync(
      `sf package version delete -n -p ${subscriberPackageVersionId} -v ${target_devhub}`,
      { stdio: "ignore" },
    );

    console.log(`Deleting package...`);
    child_process.execSync(
      `sf package delete -n -p ${packageId} -v ${target_devhub}`,
      { stdio: "ignore" },
    );

    console.log("All tasks completed successfully.");
  } catch (err) {
    throw new Error(`Unable to delete due to ${err}`);
  } finally {
    if (packageCreated) {
      console.log(`Deleting version...`);
      child_process.execSync(
        `sf package version delete -n -p ${subscriberPackageVersionId} -v ${target_devhub}`,
        { stdio: "ignore" },
      );

      console.log(`Deleting package...`);
      child_process.execSync(
        `sf package delete -n -p ${packageId} -v ${target_devhub}`,
        { stdio: "ignore" },
      );
    }
    // Always cleanup temp directory
    console.log("Cleaning up temp directory...");
    await fs.remove(tempDir);
    console.log("Temp directory cleaned up.");
  }
}

run();
