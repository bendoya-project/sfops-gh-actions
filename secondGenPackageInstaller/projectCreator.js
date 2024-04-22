const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs');

// Parsing arguments using yargs
const argv = yargs
  .option('packages', {
    alias: 'p',
    description: 'Comma-separated package string (format: packageA:04t...,packageB:04t...)',
    type: 'string',
  })
  .option('projectName', {
    alias: 'n',
    description: 'The name of the Salesforce project',
    type: 'string',
  })
  .option('directory', {
    alias: 'd',
    description: 'Directory to create the project in',
    type: 'string',
  })
  .demandOption(['projectName'], 'Please provide all required arguments')
  .help()
  .alias('help', 'h')
  .argv;

// Function to generate a new Salesforce project
function generateProject(projectName, directory) {

 if(!directory) {
   directory = process.cwd();
 }

  const projectPath = path.join(directory, projectName);

  //Create directory if it doesn't exist
  if(!fs.existsSync(directory)) {
   fs.mkdirSync(directory,{recursive: true});
  }

  execSync(`sf project generate --name ${projectName}`, { cwd: directory });
  return projectPath;
}

// Function to add package dependencies to sfdx-project.json
// Function to add package dependencies to sfdx-project.json
function addDependencies(projectPath, packages) {
  const projectFile = path.join(projectPath, 'sfdx-project.json');
  let projectJson = JSON.parse(fs.readFileSync(projectFile, 'utf8'));

  if (!projectJson.packageDirectories[0].package) {
    projectJson.packageDirectories[0].package = "tempPackage"; 
  }
  if (!projectJson.packageDirectories[0].versionNumber) {
    projectJson.packageDirectories[0].versionNumber = "1.0.0.NEXT"; 
  }

  // Adding dependencies in the specified format
  projectJson.packageDirectories[0].dependencies = packages.map(pkg => ({
    package: pkg.name
  }));

  // Adding packageAliases
  if (!projectJson.packageAliases) {
    projectJson.packageAliases = {};
  }

  packages.forEach(pkg => {
    projectJson.packageAliases[pkg.name] = pkg.id;
  });

  fs.writeFileSync(projectFile, JSON.stringify(projectJson, null, 2), 'utf8');
}



// Function to parse and validate package input
function parsePackages(packageString) {
    return packageString.split(',').map(pkg => {
      const [name, id] = pkg.split(':').map(part => part.trim());
      if (!name || !id) {
        throw new Error(`Invalid package format: '${pkg}'. Expected format 'packageName:packageId'.`);
      }
      if (!id.startsWith('04t')) {
        throw new Error(`Invalid package ID: '${id}'. Package IDs should start with '04t'.`);
      }
      return { name, id };
    });
  }
  


// Main function
function main() {
  const { packages, projectName, directory } = argv;
 
  try {

   

    console.log('🔨 Generating project...');
    const projectPath = generateProject(projectName, directory);
    console.log(`✅ Project generated successfully at ${projectPath}`);

    if(packages){
      console.log('📦  Adding dependencies...');
      const packageArray = parsePackages(packages);
      addDependencies(projectPath, packageArray);
      console.log('✅ Dependencies added successfully.');
    }

    console.log();
    console.log(`🎉 Find the sfdx project json!`);
    console.log(JSON.stringify(JSON.parse(fs.readFileSync(path.join(projectPath, 'sfdx-project.json'), 'utf8')), null, 2));
  } catch (error) {
    console.error(`❌ An error occurred: ${error}`);
    return 1;
  }
}

main();
