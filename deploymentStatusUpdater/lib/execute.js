"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
function listDeployments(client, { owner, repo, environment, ref = "" }, page = 0) {
    return __awaiter(this, void 0, void 0, function* () {
        core.debug(`Getting list of deployments in environment ${environment}`);
        const { data } = yield client.request("GET /repos/{owner}/{repo}/deployments", {
            owner,
            repo,
            environment,
            ref,
            per_page: 100,
            page,
        });
        const deploymentRefs = data.map((deployment) => ({
            deploymentId: deployment.id,
            ref: deployment.ref,
            description: deployment.description,
        }));
        core.debug(`Getting total of ${deploymentRefs.length} deployments on page ${page} `);
        if (deploymentRefs.length === 100)
            return deploymentRefs.concat(yield listDeployments(client, { owner, repo, environment, ref }, page + 1));
        return deploymentRefs;
    });
}
function setDeploymentInactive(client, { owner, repo, deploymentId }) {
    return __awaiter(this, void 0, void 0, function* () {
        yield client.request("POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses", {
            owner,
            repo,
            deployment_id: deploymentId,
            state: "inactive",
        });
    });
}
function setDeploymentSucess(client, { owner, repo, deploymentId }) {
    return __awaiter(this, void 0, void 0, function* () {
        yield client.request("POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses", {
            owner,
            repo,
            deployment_id: deploymentId,
            state: "success",
        });
    });
}
function setDeploymentFailure(client, { owner, repo, deploymentId }) {
    return __awaiter(this, void 0, void 0, function* () {
        yield client.request("POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses", {
            owner,
            repo,
            deployment_id: deploymentId,
            state: "failure",
        });
    });
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function processInBatches(items, batchSize, actionFn, client, context) {
    return __awaiter(this, void 0, void 0, function* () {
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            yield Promise.all(batch.map((item) => actionFn(client, Object.assign(Object.assign({}, context.repo), { deploymentId: item }))));
            yield sleep(2000); // Sleep for 1 second (1000 ms)
        }
    });
}
function deleteDeploymentById(client, { owner, repo, deploymentId }) {
    return __awaiter(this, void 0, void 0, function* () {
        yield client.request("DELETE /repos/{owner}/{repo}/deployments/{deployment_id}", {
            owner,
            repo,
            deployment_id: deploymentId,
        });
    });
}
function deleteTheEnvironment(client, environment, { owner, repo }) {
    return __awaiter(this, void 0, void 0, function* () {
        let existingEnv = false;
        try {
            const getEnvResult = yield client.request("GET /repos/{owner}/{repo}/environments/{environment_name}", {
                owner,
                repo,
                environment_name: environment,
            });
            existingEnv = typeof getEnvResult === "object";
        }
        catch (err) {
            if (err.status !== 404) {
                core.error("Error deleting environment");
                throw err;
            }
        }
        if (existingEnv) {
            core.info(`deleting environment ${environment}`);
            yield client.request("DELETE /repos/{owner}/{repo}/environments/{environment_name}", {
                owner,
                repo,
                environment_name: environment,
            });
            core.info(`environment ${environment} deleted`);
        }
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        let deleteDeployment = false;
        let deleteEnvironment = false;
        let markDeploymentAsSuccess = true;
        let markDeploymentAsFailure = true;
        const { context } = github;
        const token = core.getInput("token", { required: true });
        const environment = core.getInput("environment", { required: true });
        const onlyRemoveDeployments = core.getInput("onlyRemoveDeployments", {
            required: false,
        });
        const onlyDeactivateDeployments = core.getInput("onlyDeactivateDeployments", {
            required: false,
        });
        const setDeploymentAsSuccess = core.getInput("setDeploymentAsSuccess", {
            required: false,
        });
        const descriptionFilter = core.getInput("descriptionFilter", {
            required: false,
        });
        const setDeploymentAsFailure = core.getInput("setDeploymentAsFailure", {
            required: false,
        });
        const ref = core.getInput("ref", { required: false });
        const client = github.getOctokit(token, {
            throttle: {
                onRateLimit: (retryAfter = 0, options) => {
                    console.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
                    if (options.request.retryCount === 0) {
                        // only retries once
                        console.log(`Retrying after ${retryAfter} seconds!`);
                        return true;
                    }
                },
                onAbuseLimit: (retryAfter = 0, options) => {
                    console.warn(`Abuse detected for request ${options.method} ${options.url}`);
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
        }
        else if (onlyRemoveDeployments === "true") {
            deleteDeployment = true;
            deleteEnvironment = false;
        }
        else if (setDeploymentAsSuccess === "true") {
            deleteEnvironment = false;
            deleteDeployment = false;
            markDeploymentAsSuccess = true;
            markDeploymentAsFailure = false;
        }
        else if (setDeploymentAsFailure === "true") {
            deleteEnvironment = false;
            deleteDeployment = false;
            markDeploymentAsSuccess = false;
            markDeploymentAsFailure = true;
        }
        core.debug(`Try to list deployments`);
        try {
            const deploymentRefs = yield listDeployments(client, Object.assign(Object.assign({}, context.repo), { environment,
                ref }));
            core.info(`Found ${deploymentRefs.length} deployments`);
            let deploymentIds = [];
            if (ref.length > 0 && descriptionFilter.length > 0) {
                deploymentIds = deploymentRefs
                    .filter((deployment) => {
                    var _a;
                    return deployment.ref === ref &&
                        ((_a = deployment.description) === null || _a === void 0 ? void 0 : _a.includes(descriptionFilter));
                })
                    .map((deployment) => deployment.deploymentId);
                core.info(`Filtered  ${deploymentIds.length} deployments after applying ref ${ref} & ${descriptionFilter}`);
            }
            else if (ref.length > 0) {
                deploymentIds = deploymentRefs
                    .filter((deployment) => deployment.ref === ref)
                    .map((deployment) => deployment.deploymentId);
                core.info(`Filtered  ${deploymentIds.length} deployments after applying ref ${ref}`);
            }
            else {
                deploymentIds = deploymentRefs.map((deployment) => deployment.deploymentId);
                core.info(`No Filter applied`);
            }
            let count = 0;
            if (markDeploymentAsFailure) {
                yield processInBatches(deploymentIds, 30, setDeploymentFailure, client, context);
            }
            else if (markDeploymentAsSuccess) {
                yield processInBatches(deploymentIds, 30, setDeploymentSucess, client, context);
            }
            if (deleteDeployment) {
                yield processInBatches(deploymentIds, 30, setDeploymentInactive, client, context);
                yield processInBatches(deploymentIds, 30, deleteDeploymentById, client, context);
                core.info(`Deleted deployments`);
            }
            if (deleteEnvironment) {
                yield processInBatches(deploymentIds, 30, setDeploymentInactive, client, context);
                yield deleteTheEnvironment(client, environment, context.repo);
            }
            core.info("done");
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
exports.main = main;
//# sourceMappingURL=execute.js.map