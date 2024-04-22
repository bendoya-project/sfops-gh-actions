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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseInputs = void 0;
const Inputs = __importStar(require("./namespaces/Inputs"));
const fs_1 = __importDefault(require("fs"));
const parseJSON = (getInput, property) => {
    const value = getInput(property);
    if (!value) {
        return;
    }
    try {
        return JSON.parse(value);
    }
    catch (e) {
        const error = e;
        throw new Error(`invalid format for '${property}: ${error.toString()}`);
    }
};
const parseInputs = (getInput) => {
    const repo = getInput('repo');
    const sha = getInput('sha');
    const token = getInput('token', { required: true });
    const output_text_description_file = getInput('output_text_description_file');
    const name = getInput('name');
    const checkIDStr = getInput('check_id');
    const status = getInput('status', { required: true });
    let conclusion = getInput('conclusion');
    const actionURL = getInput('action_url');
    const detailsURL = getInput('details_url');
    if (repo && repo.split('/').length != 2) {
        throw new Error('repo needs to be in the {owner}/{repository} format');
    }
    const checkID = checkIDStr ? parseInt(checkIDStr) : undefined;
    if (!Object.values(Inputs.Status).includes(status)) {
        throw new Error(`invalid value for 'status': '${status}'`);
    }
    if (conclusion) {
        conclusion = conclusion.toLowerCase();
        if (!Object.values(Inputs.Conclusion).includes(conclusion)) {
            if (conclusion.toString() === 'stale') {
                throw new Error(`'stale' is a conclusion reserved for GitHub and cannot be set manually`);
            }
            throw new Error(`invalid value for 'conclusion': '${conclusion}'`);
        }
    }
    if (status === Inputs.Status.Completed) {
        if (!conclusion) {
            throw new Error(`'conclusion' is required when 'status' is 'completed'`);
        }
    }
    else {
        if (conclusion) {
            throw new Error(`can't provide a 'conclusion' with a non-'completed' 'status'`);
        }
    }
    const output = parseJSON(getInput, 'output');
    const annotations = parseJSON(getInput, 'annotations');
    const images = parseJSON(getInput, 'images');
    const actions = parseJSON(getInput, 'actions');
    if (!actionURL && (conclusion === Inputs.Conclusion.ActionRequired || actions)) {
        throw new Error(`missing value for 'action_url'`);
    }
    if (output && output_text_description_file) {
        output.text_description = fs_1.default.readFileSync(output_text_description_file, 'utf8');
    }
    if ((!output || !output.summary) && (annotations || images)) {
        throw new Error(`missing value for 'output.summary'`);
    }
    return {
        repo,
        sha,
        name,
        token,
        status,
        conclusion,
        checkID,
        actionURL,
        detailsURL,
        output,
        annotations,
        images,
        actions,
    };
};
exports.parseInputs = parseInputs;
