#!/usr/bin/env node
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 81:
/***/ ((module) => {

"use strict";
module.exports = require("child_process");

/***/ }),

/***/ 147:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {

const { spawn } = __nccwpck_require__(81);
const { execSync } = __nccwpck_require__(81);
const fs = __nccwpck_require__(147);

if (process.argv.length < 4) {
  console.error("No sbx name and ORG_NAME provided");
  process.exit(1);
}

let name = process.argv[2];

// Run sfdx org create sandbox command
console.error(`Creating sandbox...${name}`);

//Create Sandbox Definition File
let sandboxDefinition = {
  sandboxName: name,
  autoActivate: true,
  description: "Developer Sandbox Auto Provisioned",
};

let sfdxCommand;

if (!process.argv[4]) {
  throw new Error("No Source Sandbox  provided");
} else if (
  process.argv[4].toLocaleLowerCase() == "production" ||
  process.argv[4].toLocaleLowerCase() == "prod"
) {
  sandboxDefinition["licenseType"] = "DEVELOPER";
} else {
  sandboxDefinition["SourceSandboxName"] = process.argv[4];
}

if (process.argv[5]) {
  apexClassId = process.argv[5];
  sandboxDefinition["apexClassId"] = apexClassId;
}

fs.writeFileSync("sandboxDefinition.json", JSON.stringify(sandboxDefinition));

console.error("Sandbox Definition File Created...");
console.error(JSON.stringify(sandboxDefinition));
//Hack to get around the issue with sfdx org create sandbox command
if (!sandboxDefinition.SourceSandboxName)
  sfdxCommand = spawn("sf", [
    "org",
    "create",
    "sandbox",
    "--async",
    "-f",
    "sandboxDefinition.json",
    "-a",
    name,
    "-o",
    process.argv[3],
    "--no-prompt",
    "--json",
  ]);
else
  sfdxCommand = spawn("sfdx", [
    "org",
    "create",
    "sandbox",
    "--async",
    "-f",
    "sandboxDefinition.json",
    "-a",
    name,
    "-o",
    process.argv[3],
    "-c",
    process.argv[4],
    "--no-prompt",
    "--json",
  ]);

sfdxCommand.stdout.on("data", (data) => {
  console.error(`${data}`);
});

sfdxCommand.stderr.on("data", (data) => {
  console.error(`${data}`);
});

sfdxCommand.on("close", (code) => {
  if (code == 68) {
    console.error("Sandbox requested submitted successfully.");
  } else if (code == 0) {
    console.error("Sandbox created successfully.");
  } else {
    console.error(`sfdx command exited with code ${code}`);
    throw new error(`Failed to create sandbox: ${name}`);
  }
});

})();

module.exports = __webpack_exports__;
/******/ })()
;