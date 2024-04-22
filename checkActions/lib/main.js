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
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const inputs_1 = require("./inputs");
const checks_1 = require("./checks");
const isCreation = (inputs) => {
    return !!inputs.name && !inputs.checkID;
};
// prettier-ignore
const prEvents = [
    'pull_request',
    'pull_request_review',
    'pull_request_review_comment',
    'pull_request_target',
];
const getSHA = (inputSHA) => {
    let sha = github.context.sha;
    if (prEvents.includes(github.context.eventName)) {
        const pull = github.context.payload.pull_request;
        if (pull === null || pull === void 0 ? void 0 : pull.head.sha) {
            sha = pull === null || pull === void 0 ? void 0 : pull.head.sha;
        }
    }
    if (inputSHA) {
        sha = inputSHA;
    }
    return sha;
};
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            core.debug(`Parsing inputs`);
            const inputs = (0, inputs_1.parseInputs)(core.getInput);
            core.debug(`Setting up OctoKit`);
            const octokit = github.getOctokit(inputs.token);
            const ownership = {
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
            };
            const sha = getSHA(inputs.sha);
            if (inputs.repo) {
                const repo = inputs.repo.split('/');
                ownership.owner = repo[0];
                ownership.repo = repo[1];
            }
            if (isCreation(inputs)) {
                core.debug(`Creating a new Run on ${ownership.owner}/${ownership.repo}@${sha}`);
                const id = yield (0, checks_1.createRun)(octokit, inputs.name, sha, ownership, inputs);
                core.setOutput('check_id', id);
            }
            else {
                let id = inputs.checkID;
                if (id == -1) {
                    //Figure out the valid check 
                    id = yield (0, checks_1.getRun)(octokit, sha, ownership, inputs.name);
                    if (id == -1) {
                        core.debug(`Unable to find run id on the sha ${sha}`);
                        return;
                    }
                }
                core.debug(`Updating a Run on ${ownership.owner}/${ownership.repo}@${sha} (${id})`);
                yield (0, checks_1.updateRun)(octokit, id, ownership, inputs);
            }
            core.debug(`Done`);
        }
        catch (e) {
            const error = e;
            core.debug(error.toString());
        }
    });
}
void run();
