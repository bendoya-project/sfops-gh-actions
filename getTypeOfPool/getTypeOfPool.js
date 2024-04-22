const Ajv = require('ajv');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

let poolFound = false;
let scratchOrgSchema, sandboxSchema;

// Download schemas only once
async function downloadSchemas() {
  scratchOrgSchema = await axios.get('https://raw.githubusercontent.com/flxbl-io/json-schemas/main/scratchorg-pool-definition.schema.json').then((res) => res.data);
  sandboxSchema = await axios.get('https://raw.githubusercontent.com/flxbl-io/json-schemas/main/sandbox-pool-definition.schema.json').then((res) => res.data);
}

// Function to validate JSON data against a given schema
function validateSchema(schema, jsonData) {
  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  return validate(jsonData);
}

// Function to process a JSON file and check against given 'name'
async function processJson(filePath, name) {
    const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const lowerName = name.toLowerCase(); // Convert name to lower case for case-insensitive matching
  
    if (validateSchema(scratchOrgSchema, jsonData) && jsonData.tag.toLowerCase() === lowerName) {
      console.log(`Pool: ${name}, Type: scratchorg`);
      writeToFile({ pool: name, type: 'scratchorg' });
      poolFound = true;
      return;
    }
  
    if (validateSchema(sandboxSchema, jsonData)) {
      for (const obj of jsonData) {
        if (obj.pool.toLowerCase() === lowerName) {  // Convert pool to lower case for case-insensitive matching
          console.log(`Pool: ${name.toUpperCase()}, Type: sandbox`);
          writeToFile({ pool: name.toUpperCase(), type: 'sandbox' });
          poolFound = true;
          return;
        }
      }
    }
  }
  
  
// Function to write output to pool.json
function writeToFile(jsonOutput) {
  fs.writeFileSync('pool.json', JSON.stringify(jsonOutput, null, 2));
}

// Main function to read arguments and initiate processing
async function main() {
  const [folderPath, name] = process.argv.slice(2);
  if (!folderPath || !name) {
    console.log('Both folderPath and name should be provided');
    return;
  }

  await downloadSchemas();  // Download schemas before processing

  let files;
  try {
    files = fs.readdirSync(folderPath);
  } catch (err) {
    console.log(`Error reading directory: ${err}`);
    return;
  }

  for (const file of files) {
    if (path.extname(file) === '.json') {
      await processJson(path.join(folderPath, file), name);
    }
  }

  if (!poolFound) {
    console.log(`No matching pools found for: ${name}`);
    writeToFile({});
  }
}

main().catch((err) => console.log(`Error: ${err}`));
