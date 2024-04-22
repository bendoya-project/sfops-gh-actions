const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { MetadataResolver } = require("@salesforce/source-deploy-retrieve");

// Command-line arguments
const [prDetailsPath] = process.argv.slice(2);

if (!prDetailsPath) {
  console.error("Usage: node script.js <path_to_prDetails.json>");
  process.exit(1);
}

// Function to checkout PR branch using GitHub CLI
function checkoutPR(issueNumber) {
  try {
    execSync(`gh pr checkout ${issueNumber}`, { stdio: "ignore" });
    console.log(`✅ Checked out PR #${issueNumber}`);
  } catch (error) {
    console.error(`❌ Failed to checkout PR #${issueNumber}: ${error}`);
  }
}

function checkoutCommitId(commitId) {
  try {
    execSync(`git checkout ${commitId}`, { stdio: "ignore" });
    console.log(`✅ Checked out commit id #${commitId}`);
  } catch (error) {
    console.error(`❌ Failed to checkout commit id #${commitId}: ${error}`);
  }
}

// Read the sfdx-project.json to get package directories
const sfdxProjectJson = JSON.parse(
  fs.readFileSync("sfdx-project.json", "utf8")
);
const packageDirectories = sfdxProjectJson.packageDirectories;

// Function to find package name by file path
function findPackageName(filePath) {
  filePath = path.normalize(filePath); // Normalize the filePath

  for (const packageDir of packageDirectories) {
    const normalizedPackagePath = path.normalize(packageDir.path);
    if (filePath.includes(normalizedPackagePath)) {
      return packageDir.package || "Unknown Package"; // Use the package name or a default
    }
  }
  return "Unknown Package"; // Default if no package is matched
}

// Function to process files and categorize by type (added, modified, deleted)
function processFiles(files, status) {
  const resolver = new MetadataResolver();
  return files.reduce((acc, file) => {
    const filePath = file;
    try {
      if (!filePath.includes(`sfdx-project.json`)) {
        const metadataComponents = resolver.getComponentsFromPath(filePath);
        metadataComponents.forEach((component) => {
          const packageName = findPackageName(filePath);
          if (!acc[packageName]) {
            acc[packageName] = { added: [], modified: [], deleted: [] };
          }
          const componentExists = acc[packageName][status].some(
            (c) =>
              c.name === component.fullName && c.type === component.type.name
          );
          if (!componentExists) {
            acc[packageName][status].push({
              name: component.fullName,
              type: component.type.name,
              conflicts: [] // Initialize conflicts array for each component
            });
          }
        });
      }
    } catch (error) {
      console.error(`ℹ️   Error processing file ${filePath}: ${error}`);
    }
    return acc;
  }, {});
}

// Global mapping for component types and names to colors
const componentColorMapping = {};

// Function to detect and record conflicts directly within components
function detectAndRecordConflicts(prDetails) {
  const allPrs = { ...prDetails.openPrs, ...prDetails.closedPrs };

  Object.entries(allPrs).forEach(([currentPrNumber, currentPr]) => {
    Object.entries(allPrs).forEach(([otherPrNumber, otherPr]) => {
      if (currentPrNumber !== otherPrNumber) {
        compareAndRecordComponentConflicts(currentPr, otherPr, otherPrNumber);
      }
    });
  });
}

function compareAndRecordComponentConflicts(currentPr, otherPr, otherPrNumber) {
  Object.keys(currentPr.metadata).forEach((packageName) => {
    if (otherPr.metadata[packageName]) {
      ['added', 'modified'].forEach(status => {
        currentPr.metadata[packageName][status].forEach(component => {
          const otherComponents = otherPr.metadata[packageName].added.concat(otherPr.metadata[packageName].modified);
          const conflictComponent = otherComponents.find(otherComponent =>
            otherComponent.name === component.name && otherComponent.type === component.type
          );

          if (conflictComponent) {
            const componentKey = `${component.type}:${component.name}`;
            if (!componentColorMapping[componentKey]) {
              componentColorMapping[componentKey] = getNextColor();
            }

            component.conflicts.push({
              prNumber: otherPrNumber,
              color: componentColorMapping[componentKey] // Assign the color from the mapping
            });
          }
        });
      });
    }
  });
}

// Function to get the next available color for a new conflict
const colorPalette = [
  "#e6194B", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#46f0f0", "#f032e6", "#bcf60c", "#fabebe",
  "#008080", "#e6beff", "#9a6324", "#fffac8", "#800000", "#aaffc3", "#808000", "#ffd8b1", "#000075", "#808080",
  "#ffffff", "#000000", "#faebd7", "#00ffff", "#7fffd4", "#f0ffff", "#f5f5dc", "#ffe4c4", "#ffebcd", "#8a2be2",
  "#a52a2a", "#deb887", "#5f9ea0", "#7fff00", "#d2691e", "#ff7f50", "#6495ed", "#dc143c", "#00ffff", "#00008b",
  "#008b8b", "#b8860b", "#a9a9a9", "#006400", "#a9a9a9", "#bdb76b", "#8b008b", "#556b2f", "#ff8c00", "#9932cc",
  "#8b0000", "#e9967a", "#8fbc8f", "#483d8b", "#2f4f4f", "#00ced1", "#9400d3", "#ff1493", "#00bfff", "#696969",
  "#1e90ff", "#d19275", "#b22222", "#fffaf0", "#228b22", "#ff00ff", "#dcdcdc", "#f8f8ff", "#ffd700", "#daa520",
  "#808080", "#008000", "#adff2f", "#f0fff0", "#ff69b4", "#cd5c5c", "#4b0082", "#fffff0", "#f0e68c", "#e6e6fa",
  "#fff0f5", "#7cfc00", "#fffacd", "#add8e6", "#f08080", "#e0ffff", "#fafad2", "#d3d3d3", "#90ee90", "#ffb6c1",
  "#ffa07a", "#20b2aa", "#87cefa", "#778899", "#b0c4de", "#ffffe0", "#00ff00", "#32cd32", "#faf0e6", "#ff00ff"
];

let colorIndex = 0;

function getNextColor() {
  const color = colorPalette[colorIndex];
  colorIndex = (colorIndex + 1) % colorPalette.length; // Cycle through the color palette
  return color;
}


// Main function to enhance PR details with metadata information
async function enhancePRDetails() {
  const prDetails = JSON.parse(fs.readFileSync(prDetailsPath, "utf8"));

  Object.entries(prDetails.openPrs).forEach(([issueNumber, pr]) => {
    checkoutPR(issueNumber); // Checkout the PR branch

    pr.metadata = {
      ...processFiles(pr.files.added, "added"),
      ...processFiles(pr.files.modified, "modified"),
    };
  });

  checkoutCommitId("main");  // Checkout main branch after processing open PRs

  Object.entries(prDetails.closedPrs).forEach(([issueNumber, pr]) => {
    // Assuming files are relative to PR details JSON, derive basePath
    const basePath = path.dirname(prDetailsPath);
    pr.metadata = {
      ...processFiles(pr.files.added, "added"),
      ...processFiles(pr.files.modified, "modified"),
    };
  });

  // Detect and record conflicts
  detectAndRecordConflicts(prDetails);

  fs.writeFileSync(prDetailsPath, JSON.stringify(prDetails, null, 2));
  console.log(`✅ Enhanced PR details written to ${prDetailsPath}`);
}

enhancePRDetails().catch(console.error);
