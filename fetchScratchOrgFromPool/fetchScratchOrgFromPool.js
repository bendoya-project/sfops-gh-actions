const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { execSync } = require('child_process');

// Parse command line arguments using yargs
const argv = yargs(hideBin(process.argv))
    .option('repo', {
        describe: 'GitHub repository',
        type: 'string',
        demandOption: true
    })
    .option('tag', {
        describe: 'Scratch org tag',
        type: 'string',
        demandOption: true
    })
    .option('devhub', {
        describe: 'DevHub alias',
        type: 'string',
        demandOption: true
    })
    .option('email', {
        describe: 'Email address',
        type: 'string',
        demandOption: false
    })
    .option('issue-number', {
        describe: 'Issue number',
        type: 'string',
        demandOption: true
    })
    .help()
    .argv;

async function fetchScratchOrgInfo(tag, devhub) {
    try {
        const result = execSync(`sfp pool:fetch -t "${tag}" -v "${devhub}" --json`, { encoding: 'utf-8' });
        return JSON.parse(result);
    } catch (error) {
        return { error: error.message };
    }
}

async function runScript(argv) {
    const { repo, tag, devhub, email, issueNumber } = argv;

    const scratchOrgInfo = await fetchScratchOrgInfo(tag, devhub);

    console.error('Details of the scratch org fetched from the pool:');
    console.error(scratchOrgInfo);

    if (scratchOrgInfo.error) {
        console.error('Error encountered: Empty pool or unable to fetch');
        process.exit(1);
    } else {
        const { orgId, Id: id, username } = scratchOrgInfo;

        if (!orgId || !id) {
            console.error('Error: Required fields not found in response.');
            process.exit(1);
        }

        const augmentedJson = JSON.stringify({ orgId, email: email || '', issueNumber });

        console.error('Augmented JSON:');
        console.error(augmentedJson);

        try {
            execSync(`gh variable set "SO_${issueNumber}" --repo ${repo} --body '${augmentedJson}'`);
        } catch (error) {
            console.error('Error setting GitHub variable:', error.message);
            process.exit(1);
        }

        console.log(username);
    }
}

async function main() {
    await runScript(argv);
}

main().catch(error => {
    console.error('An error occurred:', error.message);
    process.exit(1);
});
