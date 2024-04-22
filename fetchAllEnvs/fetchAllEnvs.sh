#!/bin/bash

envs=""
qa=""
prod=""

if [[ -z "$2" ]]; then
  echo >&2 "Fetch All Envs as filter was not provided"
  for env in $(gh api -H "Accept: application/vnd.github+json" /repos/$1/environments | jq -r '.environments[] | .name'); do

      # skip envs that do not have any vars, as these are not sfops envs
      variable_count=$(gh api -H "Accept: application/vnd.github+json" /repos/$1/environments/$env/variables | jq '.variables | length')
      if [ "$variable_count" -eq 0 ]; then
        continue
      fi

      lower_env=$(echo "$env" | tr '[:upper:]' '[:lower:]')
      
      if [[ "$lower_env" == "qa" ]]; then
        qa="qa,"
      elif [[ "$lower_env" == "prod" || "$lower_env" == "production" ]]; then
        prod="$lower_env"
      else
        envs+="$lower_env,"
      fi
  done
else
  IFS=',' read -ra filters <<< "$2"  # Split the filters by comma into an array
  
  for env in $(gh api -H "Accept: application/vnd.github+json" /repos/$1/environments | jq -r '.environments[] | .name'); do
    
     # skip envs that do not have any vars, as these are not sfops envs
    variable_count=$(gh api -H "Accept: application/vnd.github+json" /repos/$1/environments/$env/variables | jq '.variables | length')
    if [ "$variable_count" -eq 0 ]; then
        continue
    fi

    all_filters_match=true  # Assume all filters match initially
    
    for filter in "${filters[@]}"; do
      filter_type=$(echo "$filter" | cut -d':' -f1 | tr '[:lower:]' '[:upper:]')
      filter_value=$(echo "$filter" | cut -d':' -f2 | tr '[:upper:]' '[:lower:]')
      
      type_value=$(gh api -H "Accept: application/vnd.github+json" /repos/$1/environments/$env/variables | jq -r --arg filter "$filter_type" '.variables[] | select(.name==$filter) | .value')
      type_value=$(echo "$type_value" | tr '[:upper:]' '[:lower:]')
      
      if [[ "$type_value" != "$filter_value" ]]; then
        all_filters_match=false  # If one filter fails, set flag to false
        break
      fi
    done
    
    if [ "$all_filters_match" = true ]; then
      lower_case_env=$(echo "$env" | tr '[:upper:]' '[:lower:]')
      if [[ "$lower_case_env" == "qa" ]]; then
        qa="qa,"
      elif [[ "$lower_case_env" == "prod" || "$lower_case_env" == "production" ]]; then
        prod="prod"
      else
        envs+="$lower_case_env,"
      fi
    fi
  done
  
fi

envs="${qa}${envs}${prod}"
envs=$(echo "$envs" | sed 's/,$//')  # Remove trailing comma
echo >&2 "Environments: $envs"

echo "$envs"
