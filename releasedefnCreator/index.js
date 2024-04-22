const fs = require("fs");
const yaml = require("js-yaml");

function parsePackages(packagesString) {
  return packagesString
    .split(",")
    .map((item) => {
      const [packageName, versionNumber] = item.trim().split(/\s*:\s*/);
      if (!/^(\d+\.\d+\.\d+\.\d+|\d+\.\d+\.\d+-\d+)$/.test(versionNumber)) {
        console.log(
          `Ignoring ${packageName}: version format ${versionNumber} is invalid`,
        );
        return null;
      }
      const formattedVersionNumber = versionNumber.replace(
        /(\d+\.\d+\.\d+)\.(\d+)/,
        "$1-$2",
      );
      return [packageName, formattedVersionNumber];
    })
    .reduce((acc, item) => {
      if (item) {
        const [packageName, versionNumber] = item;
        acc[packageName] = versionNumber;
      }
      return acc;
    }, {});
}

function generateYaml(releaseName, packagesString) {
  const parsedPackages = parsePackages(packagesString);

  const releaseDefinition = {
    release: releaseName,
    skipIfAlreadyInstalled: true,
    skipArtifactUpdate: false,
    artifacts: parsedPackages,
  };

  const yamlStr = yaml.dump(releaseDefinition);

  fs.writeFileSync("release_definition.yaml", yamlStr, "utf8");

  console.log("Generated release_definition.yaml with the following contents:");
  console.log(yamlStr);
}

// Get arguments from command line
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log("Usage: node script.js <release_name> <packages_string>");
  process.exit(1);
}

const [releaseName, packagesString] = args;

generateYaml(releaseName, packagesString);
