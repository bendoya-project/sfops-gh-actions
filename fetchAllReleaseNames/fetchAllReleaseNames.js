#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function isYAML(fileContent) {
  try {
    yaml.load(fileContent);
    return true;
  } catch (e) {
    return false;
  }
}

function getAllReleaseDefns(configDir, outputDir = null) {
  const allReleaseNames = [];

  fs.readdirSync(configDir).forEach((file) => {
    const filePath = path.join(configDir, file);
    const fileContent = fs.readFileSync(filePath, "utf8");

    if (isYAML(fileContent)) {
      const releaseConfig = yaml.load(fileContent);
      if (releaseConfig.releaseName) {
        allReleaseNames.push(releaseConfig.releaseName);

        if (outputDir) {
          // Copy file to user-provided directory with renaming
          const outputFilePath = path.join(
            outputDir,
            `${releaseConfig.releaseName}.yaml`,
          );
          fs.copyFileSync(filePath, outputFilePath);
        }
      }
    }
  });

  const output = {
    include: allReleaseNames,
  };

  const outputPath = path.join(process.cwd(), "all-releases.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.error(`Identified release defns written to ${outputPath}`);
  return output.include;
}

function main() {
  if (process.argv.length < 3) {
    console.error(
      "Usage: fetchAllReleaseNames.js <config_directory> [output_directory]",
    );
    process.exit(1);
  }

  const configDir = process.argv[2];
  const outputDir = process.argv.length > 3 ? process.argv[3] : null;

  if (outputDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let output = getAllReleaseDefns(configDir, outputDir);
  console.error(`Found ${output.length} releases.`);
  console.log(output);
}

main();
