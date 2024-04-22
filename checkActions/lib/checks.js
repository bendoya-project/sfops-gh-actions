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
exports.getRun = exports.updateRun = exports.createRun = void 0;
const core = __importStar(require("@actions/core"));
const Inputs = __importStar(require("./namespaces/Inputs"));
const unpackInputs = (title, inputs) => {
    var _a;
    let output;
    if (inputs.output) {
        output = {
            title: (_a = inputs.output.title) !== null && _a !== void 0 ? _a : title,
            summary: inputs.output.summary,
            text: inputs.output.text_description,
            actions: inputs.actions,
            annotations: inputs.annotations,
            images: inputs.images,
        };
    }
    let details_url;
    if (inputs.conclusion === Inputs.Conclusion.ActionRequired ||
        inputs.actions) {
        if (inputs.detailsURL) {
            const reasonList = [];
            if (inputs.conclusion === Inputs.Conclusion.ActionRequired) {
                reasonList.push(`'conclusion' is 'action_required'`);
            }
            if (inputs.actions) {
                reasonList.push(`'actions' was provided`);
            }
            const reasons = reasonList.join(" and ");
            core.info(`'details_url' was ignored in favor of 'action_url' because ${reasons} (see documentation for details)`);
        }
        details_url = inputs.actionURL;
    }
    else if (inputs.detailsURL) {
        details_url = inputs.detailsURL;
    }
    return {
        status: inputs.status.toString(),
        output,
        actions: inputs.actions,
        conclusion: inputs.conclusion ? inputs.conclusion.toString() : undefined,
        completed_at: inputs.status === Inputs.Status.Completed ? formatDate() : undefined,
        details_url,
    };
};
const formatDate = () => {
    return new Date().toISOString();
};
const createRun = (octokit, name, sha, ownership, inputs) => __awaiter(void 0, void 0, void 0, function* () {
    const { data } = yield octokit.rest.checks.create(Object.assign(Object.assign(Object.assign({}, ownership), { head_sha: sha, name: name, started_at: formatDate() }), unpackInputs(name, inputs)));
    return data.id;
});
exports.createRun = createRun;
const updateRun = (octokit, id, ownership, inputs) => __awaiter(void 0, void 0, void 0, function* () {
    const previous = yield octokit.rest.checks.get(Object.assign(Object.assign({}, ownership), { check_run_id: id }));
    yield octokit.rest.checks.update(Object.assign(Object.assign(Object.assign({}, ownership), { check_run_id: id }), unpackInputs(previous.data.name, inputs)));
});
exports.updateRun = updateRun;
const getRun = (octokit, sha, ownership, name) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!name)
            return -1;
        const matchedChecks = yield octokit.rest.checks.listForRef(Object.assign(Object.assign({}, ownership), { ref: sha }));
        console.log(`Found checks`, (_b = (_a = matchedChecks === null || matchedChecks === void 0 ? void 0 : matchedChecks.data) === null || _a === void 0 ? void 0 : _a.check_runs) === null || _b === void 0 ? void 0 : _b.length);
        let matchedCheckRunId = -1;
        for (const check of matchedChecks.data.check_runs) {
            console.log(`Analysing checks`, check.name);
            if (check.name.includes(name)) {
                console.log(`Matched check`, check.id);
                matchedCheckRunId = check.id;
            }
        }
        return matchedCheckRunId;
    }
    catch (error) {
        return -1;
    }
});
exports.getRun = getRun;
