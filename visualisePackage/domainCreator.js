const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function readYamlFiles(directoryPath) {
  let mappings = {};

  // Read all files in the directory
  fs.readdirSync(directoryPath).forEach(file => {
    if (path.extname(file) === '.yaml' || path.extname(file) === '.yml') {
      const filePath = path.join(directoryPath, file);
      const fileContents = fs.readFileSync(filePath, 'utf8');
      const data = yaml.load(fileContents);

      if (data && data.includeOnlyArtifacts) {
        data.includeOnlyArtifacts.forEach(artifact => {
          mappings[artifact] = data.releaseName;
        });
      }
    }
  });

  return mappings;
}

function writeDomainJson(directoryPath) {
  const mappings = readYamlFiles(directoryPath);
  console.log(`Written to`, process.cwd());
  console.log(`Mappings identified:`, JSON.stringify(mappings, null, 2));
  fs.writeFileSync('domain.json', JSON.stringify(mappings, null, 2));
}

// Command line argument for directory path
const directoryPath = process.argv[2];

if (!directoryPath) {
  console.log("Please provide a directory path");
} else {
  writeDomainJson(directoryPath);
}
