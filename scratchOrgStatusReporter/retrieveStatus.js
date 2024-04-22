const { execSync } = require('child_process');
const fs = require('fs');

function getSfpPoolList(devHub) {
    try {
        const output = execSync(`sfp pool:list -v ${devHub} -a --json`).toString();
        return JSON.parse(output);
    } catch (error) {
        console.error('Error executing sfp pool:list:', error);
        return null;
    }
}

function getGithubVariables(githubRepo) {
    try {
        const command = `gh api /repos/${githubRepo}/actions/variables --paginate --jq ".variables[] | select(.name | test(\\\"^SO_\\\")) | {name: .name, value: .value}"`
        console.error(`Executing Command ${command}`)
        const output = execSync(command,{ encoding: 'utf8', timeout: 10000 }).toString();
        return JSON.parse(`[${output.trim().split("\n").join(",")}]`);
    } catch (error) {
        console.error('Error getting GitHub variables:', error);
        return [];
    }
}

function correlateAndAugment(sfpData, githubVariables) {
    const foundOrgIds = new Set();

    if (!sfpData || !sfpData.scratchOrgDetails) {
        return foundOrgIds;
    }

    sfpData.scratchOrgDetails.forEach(orgDetail => {
        const relatedVar = githubVariables.find(v => {
            try {
                return JSON.parse(v.value).orgId === orgDetail.orgId;
            } catch (parseError) {
                console.warn('Error parsing variable value:', parseError);
                return false;
            }
        });

        if (relatedVar) {
            orgDetail.issueNumber = JSON.parse(relatedVar.value).issueNumber;
            orgDetail.email = JSON.parse(relatedVar.value).email;
            foundOrgIds.add(orgDetail.orgId);
        }
    });

    return foundOrgIds;
}

function deleteUnmatchedVariables(githubRepo, githubVariables, matchedOrgIds) {
    githubVariables.forEach(v => {
        try {
            if (!matchedOrgIds.has(JSON.parse(v.value).orgId)) {
                const command = `gh variable delete ${v.name} --repo ${githubRepo}`;
                execSync(command);
                console.log(`Deleted GitHub variable: ${v.name}`);
            }
        } catch (error) {
            console.error(`Error deleting GitHub variable ${v.name}:`, error);
        }
    });
}

function main() {
    if (process.argv.length < 3) {
        console.log('Usage: node script.js <github-repo>');
        process.exit(1);
    }
    
    const devHub = process.argv[2]
    const githubRepo = process.argv[3]; 
    const pathToFile = process.argv[4]
    const sfpData = getSfpPoolList(devHub);
    const githubVariables = getGithubVariables(githubRepo);

    const matchedOrgIds = correlateAndAugment(sfpData, githubVariables);
    deleteUnmatchedVariables(githubRepo, githubVariables, matchedOrgIds);
    fs.writeFileSync(pathToFile, JSON.stringify(sfpData, null, 2));
}

main();
