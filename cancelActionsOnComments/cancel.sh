#!/bin/bash

repo=$1
issue_number=$2


# Get issue comments
issue_comments=$(gh issue view $issue_number --repo $repo --comments)

# Extract action run ids from comments
action_ids=$(echo "$issue_comments" | grep -oP "https://github.com/$repo/actions/runs/\K\d+")

echo  Action Ids mentioned in the issue: $action_ids

# Cancel pending actions
for id in $action_ids
do
  run_info=$(gh run view $id --repo $repo --json status)
  status=$(echo "$run_info" | jq -r '.status')
  echo  "$id":"$status"
  if [ "$status" = "waiting" ] || [ "$status" = "in_progress" ] || [ "$status" = "queued" ]
  then
     echo cancelling $id
     gh run cancel $id --repo $repo
  fi
done
