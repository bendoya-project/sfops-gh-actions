const fs = require("fs");
const yaml = require("js-yaml");

const releaseDefnPaths = process.argv[2]
  ? process.argv[2].split(",").map((path) => path.trim())
  : [];
const packagesToUpdate = process.argv[3];


console.error(`----------------------------------------------------`);
console.error(`🤖  sfops github actions                            `);
console.error(`🚧  Action: overridePackageVersionInReleaseDefns`);
console.error(`----------------------------------------------------`);
console.error();
console.error(`ℹ️  Release Definitions: ${process.argv[2]}`);
console.error(`ℹ️  Packages To Update: ${packagesToUpdate}`);
console.error();



if (releaseDefnPaths.length === 0) {
  console.error("❌  Please provide the path(s) to the YAML file(s)");
  process.exit(1);
}

if (packagesToUpdate) {
  const packages = parsePackages(packagesToUpdate);

  releaseDefnPaths.forEach((path) => {
    fs.readFile(path, "utf8", (err, data) => {
      if (err) {
        console.error(`❌  Error reading the YAML file ${path}:`, err);
        process.exit(1);
      }

      const releaseDefn = yaml.load(data);

      Object.entries(packages).forEach(([packageName, versionNumber]) => {
        if (releaseDefn.artifacts && releaseDefn.artifacts[packageName]) {
          releaseDefn.artifacts[packageName] = versionNumber;
          console.log(`✅  Updated ${packageName} to version ${versionNumber} in ${path}`);
        } else {
          console.log(`ℹ️  Package ${packageName} not found in ${path}`);
        }
      });

      const updatedYaml = yaml.dump(releaseDefn);
      fs.writeFile(path, updatedYaml, (err) => {
        if (err) {
          console.error(`❌  Error writing updated YAML to ${path}:`, err);
          process.exit(1);
        }
        console.log(`✅  YAML file ${path} updated successfully`);
      });
    });
  });
} else {
  console.log("ℹ️  No packages provided for update, ignoring!");
}


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