const { Octokit } = require("@octokit/core");
const { retry } = require("@octokit/plugin-retry");
const fs = require('fs');

const envInfos = [];

async function getEnvironments(owner, repo, client) {
  let environmentResponse = await client.request(
    `GET /repos/${owner}/${repo}/environments`,
    {
      owner: owner,
      repo: repo,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );
  return environmentResponse;
}

async function getEnvironmentVariables(owner, repo, environment, client) {
  let environmentVariableResponse = await client.request(
    `GET /repos/${owner}/${repo}/environments/${environment}/variables`,
    {
      owner: owner,
      repo: repo,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );
  return environmentVariableResponse;
}

async function getLastDeploymentData(owner, repo, environment, client) {
  let deploymentsResponse = await client.request(
    `GET /repos/${owner}/${repo}/deployments`,
    {
      owner: owner,
      repo: repo,
      environment: environment,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  const deployments = deploymentsResponse.data;
  return deployments[0];
}

async function processEnvironment(environment, owner, repo, client) {
  let envVariableResponse = await getEnvironmentVariables(
    owner, repo, environment.name, client
  );
  let envDetails = {};
  envDetails["name"] = environment.name.toLowerCase();
  envDetails["branch"] = envVariableResponse.data.variables.find(
    ({ name }) => name === "BRANCH"
  )?.value;
  envDetails["sbx_name"] = envVariableResponse.data.variables.find(
    ({ name }) => name === "SBXNAME"
  )?.value.toLowerCase();
  envDetails["type"] = envVariableResponse.data.variables.find(
    ({ name }) => name === "TYPE"
  )?.value;
  envDetails["testrun"] = envVariableResponse.data.variables.find(
    ({ name }) => name === "TESTRUN"
  )?.value;
  if (!envDetails["sbx_name"]) {
    envDetails["sbx_name"] = envDetails["name"];
  }
  let lastDeployment = await getLastDeploymentData(
    owner, repo, environment.name, client
  );
  envDetails["latestDeployment"] = {};
  if (envDetails["type"] != "release") {
    if(lastDeployment?.sha)
    envDetails["latestDeployment"]["sha"] = lastDeployment?.sha?.slice(0,8);
    if(lastDeployment?.sha){
    envDetails["latestDeployment"]["url"] =
      `http://github.com/${owner}/${repo}` + `/commit/${lastDeployment?.sha}`;
    }
  }
  envDetails["latestDeployment"]["creator"] = lastDeployment?.creator.login;
  //If no type.. its not a sfops environment
  if (envDetails.type) {
    envInfos.push(envDetails);
  }
}

async function exec(owner, repo, client) {
  let environmentResponse = await getEnvironments(owner, repo, client);
  const environments = environmentResponse.data.environments;

  // Separate prod or production environments
  const prodEnvironments = environments.filter(env => 
    ['prod', 'production'].includes(env.name.toLowerCase()));
  const otherEnvironments = environments.filter(env => 
    !['prod', 'production'].includes(env.name.toLowerCase()));

  // Process non-prod environments first
  for (const environment of otherEnvironments) {
    await processEnvironment(environment, owner, repo, client);
  }

  // Process prod environments last
  for (const environment of prodEnvironments) {
    await processEnvironment(environment, owner, repo, client);
  }
}

// Call start
(async () => {
  const [githubRepo, ghToken, filePath] = process.argv.slice(2);
  const OctokitEnhanced = Octokit.plugin(retry);
  const client = new OctokitEnhanced({ auth: ghToken });
  const owner = githubRepo.split("/")[0];
  const repo = githubRepo.split("/")[1];
  await exec(owner, repo, client);
  console.log(envInfos);
  if(filePath)
    fs.writeFileSync(filePath, JSON.stringify(envInfos, null, 2));
})();


