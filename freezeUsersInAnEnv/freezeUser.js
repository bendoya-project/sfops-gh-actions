const csv = require("csv-parser");
const fs = require("fs");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const util = require("util");
const pipeline = util.promisify(require("stream").pipeline);
const exec = util.promisify(require("child_process").exec);

const targetOrg = process.argv[2];
const profileStr = process.argv[3];
let profiles = profileStr?.split(",");
if (profiles && !profiles.includes("System Administrator")) {
  profiles.push("System Administrator");
} else {
  profiles = new Array();
  profiles.push("System Administrator");
}

async function readCsv(file) {
  const results = [];
  await pipeline(
    fs.createReadStream(file),
    csv(),
    new require("stream").Writable({
      objectMode: true,
      write: (data, _, done) => {
        results.push(data);
        done();
      },
    }),
  );
  return results;
}

async function writeCsv(file, data) {
  const csvWriter = createCsvWriter({
    path: file,
    header: Object.keys(data[0]).map((id) => ({ id, title: id })),
  });
  return csvWriter.writeRecords(data);
}

async function updateRecords(file, sObject, fieldsToUpdate) {
  let success = 0,
    error = 0,
    totalRecords = 0;
  const data = await readCsv(file);

  for (const record of data) {
    totalRecords++;
    const values = fieldsToUpdate
      .map((field) => `${field}="${record[field]}"`)
      .join(" ");
    const cmd = `sfdx data update record -o ${targetOrg} -s ${sObject} -v "${values}" -i "${record.Id}"`;

    try {
      const result = await exec(cmd);
      success++;
    } catch (err) {
      error++;
      console.log(
        `Skip modification of ${sObject} record ${
          record.Name || record.Username || record.Id
        } due to error ${err}`,
      );
    }
  }

  console.log(`Total records: ${totalRecords}`);
  console.log(`Successfully updated records: ${success}`);
  console.log(`Failures: ${error}`);
}

async function generateCsvFiles() {
  const userQuery = `sfdx data:query -r csv -q "SELECT Id,Username,Name,Email, IsActive, Profile.Name FROM User" -w 300 -o ${targetOrg} > User.csv`;
  const userLoginQuery = `sfdx data:query -r csv -q "SELECT Id, UserId, IsFrozen FROM UserLogin" -w 300 -o ${targetOrg} > UserLogin.csv`;

  console.log(`Executing query: ${userQuery}`);
  await exec(userQuery);

  console.log(`Executing query: ${userLoginQuery}`);
  await exec(userLoginQuery);
}

async function main() {
  await generateCsvFiles();

  let users = await readCsv("User.csv");
  let userLogins = await readCsv("UserLogin.csv");

  userLogins = userLogins.map((userLogin) => {
    const correspondingUser = users.find(
      (user) => user.Id === userLogin.UserId,
    );
    if (
      correspondingUser &&
      !profiles?.includes(correspondingUser["Profile.Name"])
    ) {
      console.log(
        `Freeze ${correspondingUser["Username"]} with ${correspondingUser["Profile.Name"]}`,
      );
      userLogin.IsFrozen = "true";
    } else {
      userLogin.IsFrozen = "false";
    }
    return userLogin;
  });

  await writeCsv("UpdatedUserLogin.csv", userLogins);
  await updateRecords("UpdatedUserLogin.csv", "UserLogin", ["IsFrozen"]);
  console.log("The UserLogin records were updated successfully");

  fs.unlinkSync("User.csv");
  fs.unlinkSync("UserLogin.csv");
  fs.unlinkSync("UpdatedUserLogin.csv");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
