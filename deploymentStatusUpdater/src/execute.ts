import * as core from "@actions/core";
import * as github from "@actions/github";
import { Octokit } from "@octokit/core";
import { RequestError } from "@octokit/request-error";

interface ListDeploymentIDs {
  owner: string;
  repo: string;
  environment: string;
  ref: string;
}

interface Deployment {
  owner: string;
  repo: string;
  deploymentId: number;
}

interface Context {
  owner: string;
  repo: string;
}

export interface DeploymentRef {
  deploymentId: number;
  ref: string;
  description: string | null;
}

async function listDeployments(
  client: Octokit,
  { owner, repo, environment, ref = "" }: ListDeploymentIDs,
  page = 0
): Promise<DeploymentRef[]> {
  core.debug(`Getting list of deployments in environment ${environment}`);
  const { data } = await client.request(
    "GET /repos/{owner}/{repo}/deployments",
    {
      owner,
      repo,
      environment,
      ref,
      per_page: 100,
      page,
    }
  );
  const deploymentRefs: DeploymentRef[] = data.map((deployment) => ({
    deploymentId: deployment.id,
    ref: deployment.ref,
    description: deployment.description,
  }));
  core.debug(
    `Getting total of ${deploymentRefs.length} deployments on page ${page} `
  );

  if (deploymentRefs.length === 100)
    return deploymentRefs.concat(
      await listDeployments(client, { owner, repo, environment, ref }, page + 1)
    );

  return deploymentRefs;
}

async function setDeploymentInactive(
  client: Octokit,
  { owner, repo, deploymentId }: Deployment
): Promise<void> {
  await client.request(
    "POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses",
    {
      owner,
      repo,
      deployment_id: deploymentId,
      state: "inactive",
    }
  );
}

async function setDeploymentSucess(
  client: Octokit,
  { owner, repo, deploymentId }: Deployment
): Promise<void> {
  await client.request(
    "POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses",
    {
      owner,
      repo,
      deployment_id: deploymentId,
      state: "success",
    }
  );
}

async function setDeploymentFailure(
  client: Octokit,
  { owner, repo, deploymentId }: Deployment
): Promise<void> {
  await client.request(
    "POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses",
    {
      owner,
      repo,
      deployment_id: deploymentId,
      state: "failure",
    }
  );
}

function sleep(ms: number | undefined) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processInBatches(items:any, batchSize:any, actionFn:any, client:any, context:any) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map((item: any) => actionFn(client, { ...context.repo, deploymentId: item })));
    await sleep(2000); // Sleep for 1 second (1000 ms)
  }
}


async function deleteDeploymentById(
  client: Octokit,
  { owner, repo, deploymentId }: Deployment
): Promise<void> {
  await client.request(
    "DELETE /repos/{owner}/{repo}/deployments/{deployment_id}",
    {
      owner,
      repo,
      deployment_id: deploymentId,
    }
  );
}

async function deleteTheEnvironment(
  client: Octokit,
  environment: string,
  { owner, repo }: Context
): Promise<void> {
  let existingEnv = false;
  try {
    const getEnvResult = await client.request(
      "GET /repos/{owner}/{repo}/environments/{environment_name}",
      {
        owner,
        repo,
        environment_name: environment,
      }
    );
    existingEnv = typeof getEnvResult === "object";
  } catch (err) {
    if ((err as RequestError).status !== 404) {
      core.error("Error deleting environment");
      throw err;
    }
  }

  if (existingEnv) {
    core.info(`deleting environment ${environment}`);
    await client.request(
      "DELETE /repos/{owner}/{repo}/environments/{environment_name}",
      {
        owner,
        repo,
        environment_name: environment,
      }
    );
    core.info(`environment ${environment} deleted`);
  }
}

export async function main(): Promise<void> {
  let deleteDeployment = false;
  let deleteEnvironment = false;
  let markDeploymentAsSuccess = true;
  let markDeploymentAsFailure = true;

  const { context } = github;
  const token: string = core.getInput("token", { required: true });
  const environment: string = core.getInput("environment", { required: true });
  const onlyRemoveDeployments: string = core.getInput("onlyRemoveDeployments", {
    required: false,
  });
  const onlyDeactivateDeployments: string = core.getInput(
    "onlyDeactivateDeployments",
    {
      required: false,
    }
  );

  const setDeploymentAsSuccess: string = core.getInput(
    "setDeploymentAsSuccess",
    {
      required: false,
    }
  );
  const descriptionFilter: string = core.getInput("descriptionFilter", {
    required: false,
  });
  const setDeploymentAsFailure: string = core.getInput(
    "setDeploymentAsFailure",
    {
      required: false,
    }
  );

  const ref: string = core.getInput("ref", { required: false });

  const client: Octokit = github.getOctokit(token, {
    throttle: {
      onRateLimit: (retryAfter = 0, options: any) => {
        console.warn(
          `Request quota exhausted for request ${options.method} ${options.url}`
        );
        if (options.request.retryCount === 0) {
          // only retries once
          console.log(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
      onAbuseLimit: (retryAfter = 0, options: any) => {
        console.warn(
          `Abuse detected for request ${options.method} ${options.url}`
        );
        if (options.request.retryCount === 0) {
          // only retries once
          console.log(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
    },
    previews: ["ant-man"],
  });

  if (onlyDeactivateDeployments === "true") {
    deleteDeployment = false;
    deleteEnvironment = false;
  } else if (onlyRemoveDeployments === "true") {
    deleteDeployment = true;
    deleteEnvironment = false;
  } else if (setDeploymentAsSuccess === "true") {
    deleteEnvironment = false;
    deleteDeployment = false;
    markDeploymentAsSuccess = true;
    markDeploymentAsFailure = false;
  } else if (setDeploymentAsFailure === "true") {
    deleteEnvironment = false;
    deleteDeployment = false;
    markDeploymentAsSuccess = false;
    markDeploymentAsFailure = true;
  }
  core.debug(`Try to list deployments`);
  try {
    const deploymentRefs = await listDeployments(client, {
      ...context.repo,
      environment,
      ref,
    });
    core.info(`Found ${deploymentRefs.length} deployments`);

    let deploymentIds: number[]=[];
    if (ref.length > 0 && descriptionFilter.length > 0) {
      deploymentIds = deploymentRefs
        .filter(
          (deployment) =>
            deployment.ref === ref &&
            deployment.description?.includes(descriptionFilter)
        )
        .map((deployment) => deployment.deploymentId);
        core.info(`Filtered  ${deploymentIds.length} deployments after applying ref ${ref} & ${descriptionFilter}`);
    }
    else if (ref.length > 0) {
      deploymentIds = deploymentRefs
        .filter((deployment) => deployment.ref === ref)
        .map((deployment) => deployment.deploymentId);

        core.info(`Filtered  ${deploymentIds.length} deployments after applying ref ${ref}`);
    } else {
      deploymentIds = deploymentRefs.map(
        (deployment) => deployment.deploymentId
      );

      core.info(`No Filter applied`);
    }

    let count=0;
    if (markDeploymentAsFailure) {
      await processInBatches(deploymentIds, 30, setDeploymentFailure, client, context);
    }
    else if(markDeploymentAsSuccess)
    {
      await processInBatches(deploymentIds, 30, setDeploymentSucess, client, context);
    }
    
    if (deleteDeployment) {
      await processInBatches(deploymentIds, 30, setDeploymentInactive, client, context);
      await processInBatches(deploymentIds, 30, deleteDeploymentById, client, context);
      core.info(`Deleted deployments`);
    }

    if (deleteEnvironment) {
      await processInBatches(deploymentIds, 30, setDeploymentInactive, client, context);
      await deleteTheEnvironment(client, environment, context.repo);
    }

    core.info("done");
  } catch (error) {
    core.setFailed((error as RequestError).message);
  }
}
