const csv = require("csv-parser");
const fs = require("fs");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const util = require("util");
const pipeline = util.promisify(require("stream").pipeline);
const exec = util.promisify(require("child_process").exec);

const usernameStr = process.argv[2];
const usernames = usernameStr.split(",");
const targetOrg = process.argv[3];

async function generateCsvFiles() {
  const queries = [
    `sfdx data:query -r csv -q "Select Id, Username,Name,Email, IsActive, ProfileId From User WHERE IsActive=true" -w 300 -o ${targetOrg} > User.csv`,
  ];

  for (const query of queries) {
    console.log(`Executing query: ${query}`);
    await exec(query);
  }
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

async function main() {
  await generateCsvFiles();

  let users = await readCsv("User.csv");

  users = users.map((user) => {
    if (usernames.includes(user.Username)) {
      console.log(`Activate ${user.Username}  `);
      user.IsActive = "true";
    } else {
      console.log(`DeActivate ${user.Username}  `);
      user.IsActive = "false";
    }
    return user;
  });

  await writeCsv("UpdatedUser.csv", users);
  await updateRecords("UpdatedUser.csv", "User", ["IsActive"]);
  console.log("The records were updated successfully");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
