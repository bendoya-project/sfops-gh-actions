const csv = require("csv-parser");
const fs = require("fs");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const util = require("util");
const pipeline = util.promisify(require("stream").pipeline);
const exec = util.promisify(require("child_process").exec);
const { faker } = require("@faker-js/faker");
const path = require("path");
const { execSync } = require("child_process");

const profileName = process.argv[2];
const email = process.argv[3];
const targetOrg = process.argv[4];
const appendTargetOrg = process.argv[5];

async function generateCsvFiles() {
  const queries = [
    `sf data query -r csv  -q "Select Id,UserLicenseId,Name From Profile" -w 300 -o ${targetOrg} > Profile.csv`,
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

async function createUser(profileId, email) {
  const firstName = faker.person.firstName().replace(/\s/g, "_");
  const lastName = faker.hacker.noun().replace(/\s/g, "_");
  const alias = faker.hacker.noun().replace(/\s/g, "_").slice(0, 8);
  let userName = faker.internet.exampleEmail({
    firstName: firstName,
    lastName: lastName,
  });
  if (appendTargetOrg === "true") {
    userName += "." + targetOrg;
  }
  const values = `Alias="${alias}" FirstName="${firstName}" UserName="${userName}" LastName="${lastName}" Email=${email} LocaleSidKey="en_AU" LanguageLocaleKey="en_US" EmailEncodingKey="ISO-8859-1" TimeZoneSidKey="Australia/Melbourne" ProfileId="${profileId}" IsActive="true"`;

  const cmd = `sf data record create --json -s User  -v "${values}" -o ${targetOrg}`;

  try {
    const result = await exec(cmd);
    console.log(`Created User record ${userName} successfully `);

    const outputFilePath = path.resolve("username.output");
    fs.writeFileSync(outputFilePath, userName);

    return JSON.parse(result.stdout).result.id;
  } catch (err) {
    console.log(
      `Failed to create User record ${userName} due to error: ${err}`,
    );
    throw err;
  }
}

async function getUserIdOfDefaultUser() {
  let queryOputput = execSync(
    `sf data query -r csv  -q "SELECT Id, Username, Email FROM User WHERE Username='${targetOrg}'" -w 300 -o ${targetOrg} --json`,
  );
  let userId = JSON.parse(queryOputput.toString()).result.records[0].Id;
  let userName = JSON.parse(queryOputput.toString()).result.records[0].Username;
  const outputFilePath = path.resolve("username.output");
  fs.writeFileSync(outputFilePath, userName);
  return userId;
}

function updateEmailOfDefaultUser(userId, emailId) {
  execSync(
    `sf data update record --sobject User --record-id ${userId} --values "Email=${emailId}" -o ${targetOrg}`,
  );
}

async function main() {
  await generateCsvFiles();

  let profiles = await readCsv("Profile.csv");
  const profile = profiles.find((profile) => profile.Name === profileName);
  if (!profile) {
    throw new Error(`Profile not found: ${profileName}`);
  }
  let profileId = profile.Id;

  let userId = null;
  // specify the count of users to be created
  try {
    userId = await createUser(profileId, email);
    console.log(`Created User record ${userId} successfully `);
  } catch (error) {
    console.log(
      `Proceeding to reset password and email for default user account`,
    );
    userId = await getUserIdOfDefaultUser();
    updateEmailOfDefaultUser(userId, email);
  }

  let anoymousApex = `
        // get the user
        User u = [SELECT Id, Username, Email FROM User WHERE Id = '${userId}' LIMIT 1];

        // reset password
        System.resetPassword(u.Id, true);
  `;

  fs.writeFileSync("resetPassword.apex", anoymousApex);
  const cmd = ` sf apex run -f resetPassword.apex  -o ${targetOrg}`;
  const result = await exec(cmd);
  console.log(`Reset password for User record ${userId} successfully `);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
