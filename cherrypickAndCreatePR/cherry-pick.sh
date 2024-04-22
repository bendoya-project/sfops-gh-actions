#!/bin/bash

# # Set options to make script fail if a command fails, a variable is undefined, or a pipe fails
set -euo pipefail

# Function to set Git user
set_git_user()
{
    # Set global Git username and email
    git config --global user.email $userEmail
    git config --global user.name  $userName
}

# Function to create a cherry-picked branch
# Function to create a cherry-picked branch
create_cherry_picked_branch()
{
    # Fetch all branches from the remote repository
    git fetch --all

    # Create a new branch based on the target branch
    # Check if the branch already exists
    if git show-ref --verify --quiet "refs/heads/$branchName"; then
        # Append a timestamp to the branch name to make it unique
        branchName="${branchName}-$(date +%s)"
        echo "Branch already exists, creating a new branch: $branchName"
    fi
    git checkout -b "$branchName" "origin/$targetBranch"

    # Attempt to cherry-pick a specific commit into the new branch
    # If there's a merge conflict, try to resolve it automatically
    git cherry-pick --strategy=recursive -X theirs "$commitHash" || merge_conflict=1

    if [ ${merge_conflict:-0 } -eq 1 ];
    then
        # If auto-merge failed, try to resolve conflicts
        for ITEM in $(git diff --name-only --diff-filter=U); do git_resolve_conflict --theirs $ITEM; done
        echo "Merging with git merge-file succeeded"
    else
        echo "Merging with git cherry-pick succeeded"
    fi

   # Reset certain files to their state in the original branch, only if they exist
    for file in sfdx-project.json .vscode/* .github/* README.md; do
        if git ls-tree -r "origin/$targetBranch" --name-only | grep -q "^$file"; then
            git checkout "origin/$targetBranch" -- "$file"
        else
            echo "File or directory '$file' does not exist in 'origin/$targetBranch', skipping checkout."
        fi
    done

   # If there are changes to commit, commit them with the same message as the cherry-picked commit
    if git diff-index --quiet HEAD --; then
         echo "No changes to commit"
   else
        git commit -C "$commitHash"
   fi

    git push -u origin "$branchName"
}

# Function to resolve any merge conflicts
git_resolve_conflict()
{
   # Set the merge strategy and the path of the file in conflict
   strategy="$1"
   filePath="$2"

   filePathForGrep=${filePath#./}
   
   # Check if the file is in conflict
   if ! git diff --name-only --diff-filter=U | grep -Fxq "$filePathForGrep";
   then
       echo "File $filePath is not in conflict"
       return
   fi

   # Try to merge the file using the given strategy
   if git show :1:"$filePath" > ./tmp.common &&
      git show :2:"$filePath" > ./tmp.ours &&
      git show :3:"$filePath" > ./tmp.theirs &&
      git merge-file  "$strategy" -p ./tmp.ours ./tmp.common ./tmp.theirs > "$filePath";
   then
      echo "Successfully merged $filePath"
   else
      echo "Error merging $filePath"
   fi
  
   # Add the merged file to the Git index
   git add "$filePath"

   # Clean up the temporary files
   if [ -f "./tmp.common" ]; then
    rm "./tmp.common"
   fi

   if [ -f "./tmp.ours" ]; then
    rm "./tmp.ours"
   fi

   if [ -f "./tmp.theirs" ]; then
    rm "./tmp.theirs"
   fi
}

# Function to open a GitHub pull request
open_github_pull_request()
{

    echo "+++ Open PR"

    # Retrieve the pull request number, title, and body from the commit message of the last commit

    lastCommitId=$(git rev-parse HEAD)
    pullRequestNumber=$(git log --format=%B -n 1 $lastCommitId | awk '/#[0-9]+/{ print $0 }' | sed 's/.*#\([0-9]\+\).*/\1/' | sort -rn | head -n 1)
    
    echo "+++ Open PR"

    title=$(git show -s --format=%s $lastCommitId)
    body=$(git show -s --format=%b $lastCommitId)
    formatBody="This is an automatically generated PR, Cherry pick auto created from commit id at https://github.com/$repoName/commit/${lastCommitId}"
   
    echo "+++ Formatting Title of PR"

   # Generate a new body for the pull request
    formatBody="Description:
    ${body}
    This pr will always exclude any change to
    - sfdx-project.json
    ${formatBody}"

    echo "+++ Description"
    echo "$formatBody"

    # Create labels
    gh label create autocreated -c "1D76DB" -d "Label to denote the pr was autocreated" 2>/dev/null || true
    gh label create priority -c "FF0000" -d "Label to denote the pr is high priority" 2>/dev/null || true
    
    # Create a new pull request with the retrieved title and the generated body
    echo "+++ Create PR"
    gh pr create -B "$targetBranch" -H "$branchName"  -l "autocreated","priority" --title "$title" --body "${formatBody}" 
}

main()
{
# Set local variables with the script arguments
local targetBranch="$1"
local commitHash="$2"
local sourceBranch="$3"
local repoName="$4"
local buildNumber="$5"
local branchName="chore/auto-${sourceBranch}-${buildNumber}"
local userEmail="$6"
local userName="$7"


# Call the other functions in order
set_git_user
create_cherry_picked_branch
open_github_pull_request 
}


main "$@"
