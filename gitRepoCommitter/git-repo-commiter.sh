#!/bin/bash

github_repo_url=$1
dir_to_copy=$2
target_dir=$3
commit_message=$4
retries=3

# Create a temporary directory
temp_dir=$(mktemp -d -t ci-$(date +%Y%m%d-%H%M%S)-XXXXXXXXXX)


# Clone the repository to the current directory
 gh repo clone  $github_repo_url $temp_dir

# Check if cloning was successful
if [ $? -eq 0 ]; then
    echo "Successfully cloned the repo."
else
    echo "Error occurred while cloning the repo."
    exit 1
fi

# Copy the provided directory to the cloned repository
mkdir -p $temp_dir/$target_dir
cp -R $dir_to_copy/*  $temp_dir/$target_dir

# Check if copying was successful
if [ $? -eq 0 ]; then
    echo "Successfully copied the directory."
else
    echo "Error occurred while copying the directory."
    exit 1
fi

# Navigate to the cloned repository
cd $temp_dir

# Configure git 
git config --global user.email "sfopsbot@flxbl.io"
git config --global user.name "sfopsbot"

# Add the copied files to git tracking
git add .

# Commit the changes with the provided message
git commit -m "$commit_message"


git remote add kramo https://sfpowerscripts:$GH_TOKEN@github.com/$github_repo_url.git

attempt=0
until [ $attempt -ge $retries ]
do
   git pull --rebase kramo main && git push kramo main && break
   attempt=$[$attempt+1]
   sleep 15
done

# Check if pushing was successful
if [ $? -eq 0 ]; then
    echo "Successfully pushed the changes."
else
    echo "Error occurred while pushing the changes."
    exit 1
fi

# Navigate back to home before removing the temporary directory
cd ~
rm -rf $temp_dir

# Done
echo "Done!"
