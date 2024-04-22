#!/bin/bash

# Argument 1: GitHub Repository
# Argument 2: Domain
# Argument 3: Sandbox Name

GITHUB_REPO=$1
DOMAIN=$2
BRANCH=$3
SANDBOX_NAME=$4

# Check if SANDBOX_NAME is empty, exit if true
if [ -z "$SANDBOX_NAME" ]; then
  echo "SANDBOX_NAME is empty. Exiting without failing."
  exit 0
fi

# Check if DOMAIN is empty, exit if true
if [ -z "$DOMAIN" ]; then
  echo "DOMAIN is empty. Exiting without failing."
  exit 0
fi

# Check if BRANCH is empty, exit if true
if [ -z "$BRANCH" ]; then
  echo "BRANCH is empty. Exiting without failing."
  exit 0
fi

# Convert DOMAIN to uppercase
DOMAIN=$(echo $DOMAIN | tr 'a-z' 'A-Z')

# Function to fetch sandbox details
fetch_sandbox_details() {
    gh api /repos/$GITHUB_REPO/actions/variables/${DOMAIN}_${BRANCH}_${SANDBOX_NAME}_SBX --jq ".value"
}

# Try to fetch sandbox details up to 5 times
attempt=0
max_attempts=5
while [ $attempt -lt $max_attempts ]; do
    sandboxDetails=$(fetch_sandbox_details)

    # Break loop if sandboxDetails does not have 'message' attribute
    if ! jq -e '.message' <<<"$sandboxDetails" > /dev/null; then
        break
    fi

    attempt=$((attempt+1))
    sleep 3
done

# If failed after maximum attempts, use default JSON structure
if [ $attempt -eq $max_attempts ]; then
    currentTime=$(date +%s)
    sandboxDetails="{ \"name\": \"$SANDBOX_NAME\", \"status\": \"Available\", \"createdAt\": $currentTime, \"isActive\": true }"
fi

# Update sandbox status to "Available"
updatedSandboxDetails=$(echo $sandboxDetails | jq '.status = "Available"')

echo "🔄 Updating sandbox $SANDBOX_NAME to Available in the repository $GITHUB_REPO for domain $DOMAIN."

# Update the variable in GitHub repository
# gh variable set "${DOMAIN}_${BRANCH}_${SANDBOX_NAME}_SBX" -b "$updatedSandboxDetails" --repo $GITHUB_REPO
       
stringifiedJson=$(echo $updatedSandboxDetails | jq -c .)

gh api \
  --method PATCH \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/${GITHUB_REPO}/actions/variables/${DOMAIN}_${BRANCH}_${SANDBOX_NAME}_SBX \
  -f name=${DOMAIN}_${BRANCH}_${SANDBOX_NAME}_SBX \
  -f value=${stringifiedJson}

# Print a success message
echo "✅ Sandbox $SANDBOX_NAME has been set to Available in the repository $GITHUB_REPO for domain $DOMAIN."
