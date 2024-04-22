# Set up the mutex repo
# args:
#   $1: repo_url
set_up_repo() {
	__repo_url=$1

	git init --quiet
	git config --local user.name "github-bot" --quiet
	git config --local user.email "github-bot@users.noreply.github.com" --quiet
	git remote remove origin 2>/dev/null || true
	git remote add origin "$__repo_url"
}

# Update the branch to the latest from the remote. Or checkout to an orphan branch
# args:
#   $1: branch
update_branch() {
	__branch=$1

	git switch --orphan gh-action-mutex/temp-branch-$(date +%s) --quiet
	git branch -D $__branch --quiet 2>/dev/null || true
	git fetch origin $__branch --quiet 2>/dev/null || true
	git checkout $__branch --quiet || git switch --orphan $__branch --quiet
}

# Add to the queue
# args:
#   $1: branch
#   $2: queue_file
#   $3: ticket_id
enqueue() {
	__branch=$1
	__queue_file=$2
	__ticket_id=$3

	__has_error=0

	echo "[$__ticket_id] Enqueuing to branch $__branch, file $__queue_file"

	update_branch $__branch

	touch $__queue_file

	# if we are not in the queue, add ourself to the queue
	if [ -z "$(cat $__queue_file | grep -F $__ticket_id)" ]; then
		echo "$__ticket_id" >> "$__queue_file"

		git add $__queue_file
		git commit -m "[$__ticket_id] Enqueue " --quiet

		set +e # allow errors
		git push --set-upstream origin $__branch --quiet
		__has_error=$((__has_error + $?))
		set -e
	fi

	if [ ! $__has_error -eq 0 ]; then
		sleep $((1 + RANDOM % 5))
		enqueue $@
	fi
}

# Wait for the lock to become available
# args:
#   $1: branch
#   $2: queue_file
#   $3: ticket_id
wait_for_lock() {
	__branch=$1
	__queue_file=$2
	__ticket_id=$3

    echo "[$__ticket_id] Waiting for lock as another job is in consuming the same resource, Please wait..."

	update_branch $__branch

	# if we are not the first in line, spin
	if [ "$(cat $__queue_file | awk NF | head -n 1)" != "$__ticket_id" ]; then
	    wait_seconds=$((30 + RANDOM % 71))

		echo "Currently waiting for:"

        # List other ticket IDs in the queue, excluding the current one
        cat $__queue_file | grep -vF $__ticket_id | while read line; do
            action_run_id=$(echo "$line" | cut -d'-' -f1)
            # Extract the Unix timestamp and convert it to UTC time
            timestamp=$(echo "$line" | cut -d'-' -f2)
            enqueue_time=$(date -u -d @"$timestamp" "+%Y-%m-%d %H:%M:%S UTC")
            echo "  - Action Run ID: $action_run_id, Enqueued at: $enqueue_time"
        done

		echo "[$__ticket_id] Sleeping for $wait_seconds seconds"
		sleep $wait_seconds
		wait_for_lock $@
	fi
}

# Remove from the queue, when locked by it or just enqueued
# args:
#   $1: branch
#   $2: queue_file
#   $3: ticket_id
dequeue() {
	__branch=$1
	__queue_file=$2
	__ticket_id=$3

	__has_error=0

	update_branch $__branch

	if [ "$(cat $__queue_file | awk NF | head -n 1)" == "$__ticket_id" ]; then
		echo "[$__ticket_id] Unlocking"
		__message="[$__ticket_id] Unlock"
	else
		echo "[$__ticket_id] Dequeueing. We don't have the lock!"
		__message="[$__ticket_id] Dequeue"
	fi

	if [ $(awk "/$__ticket_id/" $__queue_file | wc -l) == "0" ]; then
		1>&2 echo "[$__ticket_id] Not in queue! Mutex file:"
		cat $__queue_file
		exit 1
	fi

	awk "!/$__ticket_id/" $__queue_file | awk NF > ${__queue_file}.new
	mv ${__queue_file}.new $__queue_file

	git add $__queue_file
	git commit -m "$__message" --quiet

	set +e # allow errors
	git push --set-upstream origin $__branch --quiet
	__has_error=$((__has_error + $?))
	set -e

	if [ ! $__has_error -eq 0 ]; then
		sleep $((1 + RANDOM % 5))
		dequeue $@
	fi
}

