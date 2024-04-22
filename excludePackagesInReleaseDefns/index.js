const fs = require("fs");
const yaml = require("js-yaml");


// Function to process each YAML file
function processYamlFile(yamlPath) {
  if (!fs.existsSync(yamlPath)) {
    console.error(`YAML file ${yamlPath} does not exist.`);
    return;
  }

  const yamlContent = fs.readFileSync(yamlPath, "utf8");
  const parsedYaml = yaml.load(yamlContent);

  packagesToComment.forEach((packageName) => {
    if (parsedYaml.artifacts && parsedYaml.artifacts[packageName] !== undefined) {
      delete parsedYaml.artifacts[packageName];
      console.log(`✅  Package ${packageName} commented out in ${yamlPath}.`);
    } else {
      console.log(`ℹ️  Package ${packageName} not found in ${yamlPath}.`);
    }
  });

  const newYamlContent = yaml.dump(parsedYaml, {
    noCompatMode: true,
    noRefs: true,
  });
  fs.writeFileSync(yamlPath, newYamlContent);

  console.log(`Updated YAML content for ${yamlPath}:\n`, newYamlContent);
}

console.error(`----------------------------------------------------`);
console.error(`🤖  sfops github actions                            `);
console.error(`🚧  Action: excludePackagesInReleaseDefns`);
console.error(`----------------------------------------------------`);
console.error();
console.error(`ℹ️  Release Definitions: ${process.argv[2]}`);
console.error(`ℹ️  Packages To Exclude: ${process.argv[3]}`);
console.error();


// Split the input YAML paths into an array
const yamlPaths = process.argv[2]
  ? process.argv[2].split(",").map((path) => path.trim())
  : [];
const packagesToComment = process.argv[3]
  ? process.argv[3].split(",").map((pkg) => pkg.trim())
  : [];



// Iterate over each YAML path and process it
yamlPaths.forEach(processYamlFile);
