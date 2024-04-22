const fs = require("fs");
const path = require("path");
const { MetadataResolver } = require("@salesforce/source-deploy-retrieve");
const util = require("util");

const readFileAsync = util.promisify(fs.readFile);

async function readPackageDirectories(filePath) {
  const data = JSON.parse(await readFileAsync(filePath, "utf8"));
  return data.packageDirectories
    .filter((dir) => !dir.aliasfy)
    .map((dir) => ({
      path: dir.path,
      aliasfy: !!dir.aliasfy,
    }));
}

function findFilesInFolder(
  folderPath,
  files = [],
  basePath = "",
  existingKeys = new Set()
) {
  const items = fs.readdirSync(folderPath, { withFileTypes: true });

  items.forEach((item) => {
    const resolver = new MetadataResolver();
    const itemPath = path.join(folderPath, item.name);
    const relativePath = basePath ? path.join(basePath, item.name) : item.name;

    if (item.isDirectory()) {
      findFilesInFolder(itemPath, files, relativePath, existingKeys);
    } else if (item.isFile()) {
      try {
        const metadata = resolver.getComponentsFromPath(itemPath);
        if (metadata) {
          let key = `${metadata[0].type.id}-${metadata[0].name}`;
          if (metadata[0].parent?.name) {
            key += `-${metadata[0].parent.name}`;
          }

          const extendedKey = `${key}-path-${extractFolderPathKey(
            itemPath,
            metadata[0].type.directoryName
          )}`;

          if (!existingKeys.has(extendedKey)) {
            files.push({ path: itemPath, relativePath, key, extendedKey });
            existingKeys.add(extendedKey);
          }
        }
      } catch (error) {
        console.log(
          `ℹ️ Ignoring file ${itemPath} as it's not recognized metadata type`
        );
      }
    }
  });

  return files;
}

function extractFolderPathKey(filePath, typeDir) {
  const parts = filePath.split(path.sep);
  const index = parts.indexOf(typeDir);
  if (index > -1) {
    return parts.slice(0, index + 1).join(path.sep);
  }
  return "";
}

function compareDirectoriesAndFindDuplicates(directories) {
  const allFiles = {};
  const aliasfyNotes = [];

  directories.forEach(({ path: dir, aliasfy }) => {
    const files = findFilesInFolder(dir, [], dir);
    files.forEach(({ path: filePath, relativePath, key, extendedKey }) => {
      if (!allFiles[key]) {
        allFiles[key] = { paths: [], extendedKeys: new Set() };
      }
      if (!allFiles[key].extendedKeys.has(extendedKey)) {
        allFiles[key].paths.push(relativePath);
        allFiles[key].extendedKeys.add(extendedKey);
      }

      if (aliasfy) {
        aliasfyNotes.push(
          `Note: File "${relativePath}" is in an 'aliasfy' directory.`
        );
      }
    });
  });

  const duplicates = Object.entries(allFiles)
    .filter(
      ([_, { paths, extendedKeys }]) =>
        extendedKeys.size > 1 && paths.length > 1
    )
    .map(([key, { paths }]) => ({ key, paths }));

  return { duplicates, aliasfyNotes };
}

function createMarkdownFile({ duplicates, aliasfyNotes }, outputFile) {
  let markdownContent = `### 📄 Metadata Scanning Report\n\n`;

  if (duplicates.length === 0) {
    markdownContent += `✅ **No duplicate metadata components found.**\n\n`;
  } else {
    markdownContent += `⚠️ **Warning: Duplicate Components observed:**\n\n`;
    duplicates.forEach(({ key, paths }) => {
      markdownContent += `- **${key}**:\n`;
      paths.forEach((path) => (markdownContent += `  - \`${path}\`\n`));
    });
    markdownContent += "\n";
  }

  // if (aliasfyNotes.length > 0) {
  //   markdownContent += `ℹ️ **Aliasfy Directories Notes:**\n`;
  //   aliasfyNotes.forEach(note => markdownContent += `- ${note}\n`);
  //   markdownContent += "\n"; // Add a newline for spacing after notes section
  // }

  fs.writeFileSync(outputFile, markdownContent);
}

async function main() {
  const sfdxProjectPath = "./sfdx-project.json"; // Adjust path as necessary
  const outputFile = "./metadata-report.md"; // Markdown report file

  console.log("🔄 Reading package directories from sfdx-project.json...");
  const packageDirectories = await readPackageDirectories(sfdxProjectPath);

  console.log("🔄 Comparing directories...");
  const { duplicates, aliasfyNotes } =
    compareDirectoriesAndFindDuplicates(packageDirectories);

  console.log("🔄 Creating markdown report...");
  createMarkdownFile({ duplicates, aliasfyNotes }, outputFile);

  console.log(`✅ Done. Check the report at ${outputFile}`);
}

main().catch(console.error);
