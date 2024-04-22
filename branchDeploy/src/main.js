import * as core from '@actions/core'
import * as github from '@actions/github'
import {context} from '@actions/github'
import {octokitRetry} from '@octokit/plugin-retry'
import dedent from 'dedent-js'

import {triggerCheck} from './functions/trigger-check'
import {contextCheck} from './functions/context-check'
import {nakedCommandCheck} from './functions/naked-command-check'
import {reactEmote} from './functions/react-emote'
import {environmentTargets} from './functions/environment-targets'
import {actionStatus} from './functions/action-status'
import {createDeploymentStatus} from './functions/deployment'
import {isDeprecated} from './functions/deprecated-checks'
import {prechecks} from './functions/prechecks'
import {validPermissions} from './functions/valid-permissions'
import {lock} from './functions/lock'
import {unlock} from './functions/unlock'
import {post} from './functions/post'
import {timeDiff} from './functions/time-diff'
import {identicalCommitCheck} from './functions/identical-commit-check'
import {unlockOnMerge} from './functions/unlock-on-merge'
import {help} from './functions/help'
import {LOCK_METADATA} from './functions/lock-metadata'
import {COLORS} from './functions/colors'
import {stringToArray} from './functions/string-to-array'

// :returns: 'success', 'success - noop', 'success - merge deploy mode', 'failure', 'safe-exit', 'success - unlock on merge mode' or raises an error
export async function run() {
  try {
    // Get the inputs for the branch-deploy Action
    const token = core.getInput('github_token', {required: true})
    var environment = core.getInput('environment', {required: true})
    const testEnvironments = core.getInput('test-envs',{required:true}).split(`,`);
    const releaseName = core.getInput('release-name',{required:true});
    let trigger = core.getInput('trigger', {required: true})
    const reaction = core.getInput('reaction')
    const stable_branch = core.getInput('stable_branch')
    const noop_trigger = core.getInput('noop_trigger')
    const lock_trigger = core.getInput('lock_trigger')
    const production_environments = await stringToArray(
      core.getInput('production_environments')
    )
    const environment_targets = core.getInput('environment_targets')
    const draft_permitted_targets = core.getInput('draft_permitted_targets')
    const unlock_trigger = core.getInput('unlock_trigger')
    const help_trigger = core.getInput('help_trigger')
    const lock_info_alias = core.getInput('lock_info_alias')
    const global_lock_flag = core.getInput('global_lock_flag')
    const update_branch = core.getInput('update_branch')
    const required_contexts = core.getInput('required_contexts')
    const allowForks = core.getBooleanInput('allow_forks')
    const skipCi = core.getInput('skip_ci')
    const skipReviews = core.getInput('skip_reviews')
    const mergeDeployMode = core.getBooleanInput('merge_deploy_mode')
    const unlockOnMergeMode = core.getBooleanInput('unlock_on_merge_mode')
    const admins = core.getInput('admins')
    const environment_urls = core.getInput('environment_urls')
    const param_separator = core.getInput('param_separator')
    const permissions = core.getInput('permissions')
    const sticky_locks = core.getBooleanInput('sticky_locks')
    const sticky_locks_for_noop = core.getBooleanInput('sticky_locks_for_noop')
    const allow_sha_deployments = core.getBooleanInput('allow_sha_deployments')
    const disable_naked_commands = core.getBooleanInput(
      'disable_naked_commands'
    )

    // Create an octokit client with the retry plugin
    const octokit = github.getOctokit(token, {
      additionalPlugins: [octokitRetry]
    })

    // Set the state so that the post run logic will trigger
    core.saveState('isPost', 'true')
    core.saveState('actionsToken', token)

    // If we are running in the 'unlock on merge' mode, run auto-unlock logic
    if (unlockOnMergeMode) {
      core.info(`🏃 running in 'unlock on merge' mode`)
      await unlockOnMerge(octokit, context, environment_targets)
      core.saveState('bypass', 'true')
      return 'success - unlock on merge mode'
    }

    // If we are running in the merge deploy mode, run commit checks
    if (mergeDeployMode) {
      core.info(`🏃 running in 'merge deploy' mode`)
      await identicalCommitCheck(octokit, context, environment)
      // always bypass post run logic as they is an entirely alternate workflow from the core branch-deploy Action
      core.saveState('bypass', 'true')
      return 'success - merge deploy mode'
    }

    // Get the body of the IssueOps command
    const body = context.payload.comment.body.trim()

    // Check the context of the event to ensure it is valid, return if it is not
    if (!(await contextCheck(context))) {
      core.saveState('bypass', 'true')
      return 'safe-exit'
    }

    // deprecated command/input checks
    if ((await isDeprecated(body, octokit, context)) === true) {
      core.saveState('bypass', 'true')
      return 'safe-exit'
    }

    if (
      disable_naked_commands === true &&
      (await nakedCommandCheck(
        body,
        param_separator,
        [trigger, noop_trigger, lock_trigger, unlock_trigger, lock_info_alias],
        octokit,
        context
      )) === true
    ) {
      core.saveState('bypass', 'true')
      return 'safe-exit'
    }

    // Get variables from the event context
    const issue_number = context.payload.issue.number
    const {owner, repo} = context.repo

    // set helpful outputs that can be used in other Actions / steps
    core.setOutput('comment_body', body)
    core.setOutput('issue_number', issue_number)

    // check if the comment is a trigger and what type of trigger it is
    let isDeploy = await triggerCheck(body, `sfops test`);
    if(await triggerCheck(body, `sfops forcetest`))
    {
    isDeploy = true;
    trigger='sfops forcetest';
    }
    const isNoopDeploy = await triggerCheck(body, noop_trigger)
    const isLock = await triggerCheck(body, lock_trigger)
    const isUnlock = await triggerCheck(body, unlock_trigger)
    const isHelp = await triggerCheck(body, help_trigger)
    const isLockInfoAlias = await triggerCheck(body, lock_info_alias)

    if (isDeploy || isNoopDeploy) {
      core.setOutput('type', 'deploy')
    } else if (isLock) {
      core.setOutput('type', 'lock')
    } else if (isUnlock) {
      core.setOutput('type', 'unlock')
    } else if (isHelp) {
      core.setOutput('type', 'help')
    } else if (isLockInfoAlias) {
      core.setOutput('type', 'lock-info-alias')
    } else {
      // if no trigger is detected, exit here
      core.saveState('bypass', 'true')
      core.setOutput('triggered', 'false')
      core.info('⛔ no trigger detected in comment - exiting')
      return 'safe-exit'
    }

    // If we made it this far, the action has been triggered in one manner or another
    core.setOutput('triggered', 'true')

    // Add the reaction to the issue_comment which triggered the Action
    const reactRes = await reactEmote(reaction, context, octokit)
    core.setOutput('comment_id', context.payload.comment.id)
    core.saveState('comment_id', context.payload.comment.id)
    core.setOutput('initial_reaction_id', reactRes.data.id)
    core.saveState('reaction_id', reactRes.data.id)
    core.setOutput('actor_handle', context.payload.comment.user.login)

    // If the command is a help request
    if (isHelp) {
      core.debug('help command detected')
      // Check to ensure the user has valid permissions
      const validPermissionsRes = await validPermissions(octokit, context)
      // If the user doesn't have valid permissions, return an error
      if (validPermissionsRes !== true) {
        await actionStatus(
          context,
          octokit,
          reactRes.data.id, // original reaction id
          validPermissionsRes // the message
        )
        // Set the bypass state to true so that the post run logic will not run
        core.saveState('bypass', 'true')
        core.setFailed(validPermissionsRes)
        return 'failure'
      }

      core.info(`Environment`,environment);

      // rollup all the inputs into a single object
      const inputs = {
        trigger: trigger,
        reaction: reaction,
        environment: environment,
        stable_branch: stable_branch,
        noop_trigger: noop_trigger,
        lock_trigger: lock_trigger,
        production_environments: production_environments,
        environment_targets: environment_targets,
        unlock_trigger: unlock_trigger,
        global_lock_flag: global_lock_flag,
        help_trigger: help_trigger,
        lock_info_alias: lock_info_alias,
        update_branch: update_branch,
        required_contexts: required_contexts,
        allowForks: allowForks,
        skipCi: skipCi,
        skipReviews: skipReviews,
        draft_permitted_targets,
        admins: admins,
        permissions: await stringToArray(permissions),
        allow_sha_deployments: allow_sha_deployments
      }

      // Run the help command and exit
      await help(octokit, context, reactRes.data.id, inputs)
      core.saveState('bypass', 'true')
      return 'safe-exit'
    }


    // Check if the default environment is being overwritten by an explicit environment
    const environmentObj = await environmentTargets(
      environment, // environment
      body, // comment body
      trigger, // trigger
      noop_trigger, // noop trigger
      stable_branch, // ref
      context, // context object
      octokit, // octokit object
      reactRes.data.id, // reaction id
      false, // lockChecks set to false as this is for a deployment
      environment_urls, // environment_urls action input
      param_separator // param_separator action input
    )

    // convert the environmentObj to a json string and debug log it
    core.debug(`environmentObj: ${JSON.stringify(environmentObj)}`)

    // deconstruct the environment object to get the environment
    environment = environmentObj.environment

    // If the environment targets are not valid, then exit
    if (!environment) {
      core.info('No valid environment targets found')
      return 'safe-exit'
    }

    core.info(`🌍 environment: ${COLORS.highlight}${environment}`)
    core.saveState('environment', environment)
    core.setOutput('environment', environment)

    const data = {
      environment: environment,
      environmentObj: environmentObj.environmentObj,
      inputs: {
        allow_sha_deployments: allow_sha_deployments,
        update_branch: update_branch,
        stable_branch: stable_branch,
        trigger: trigger,
        issue_number: issue_number,
        allowForks: allowForks,
        skipCi: skipCi,
        skipReviews: skipReviews,
        draft_permitted_targets: draft_permitted_targets
      }
    }

    // Execute prechecks to ensure the Action can proceed
    const precheckResults = await prechecks(context, octokit, data)
    core.setOutput('ref', precheckResults.ref)
    core.saveState('ref', precheckResults.ref)
    core.setOutput('sha', precheckResults.sha)
    core.debug(`precheckResults.sha: ${precheckResults.sha}`)

    // If the prechecks failed, run the actionStatus function and return
    // note: if we don't pass in the 'success' bool, actionStatus will default to failure mode
    if (!precheckResults.status) {
      await actionStatus(
        context,
        octokit,
        reactRes.data.id, // original reaction id
        precheckResults.message // message
      )
      // Set the bypass state to true so that the post run logic will not run
      core.saveState('bypass', 'true')
      core.setFailed(precheckResults.message)
      return 'failure'
    }

    core.info(
      `🍯 sticky_locks: ${COLORS.highlight}${sticky_locks}${COLORS.reset}`
    )
    core.info(
      `🍯 sticky_locks_for_noop: ${COLORS.highlight}${sticky_locks_for_noop}${COLORS.reset}`
    )

    // conditionally handle how we want to apply locks on deployments
    var stickyLocks
    // if sticky_locks is true, then we will use the sticky_locks logic
    // if sticky_locks_for_noop is also true, then we will also use the sticky_locks logic for noop deployments
    // if sticky_locks is false, then no sticky locks will be applied and only non-sticky locks will be used
    // if sticky_locks is true but sticky_locks_for_noop is false, then we will only use sticky locks on non-noop deployments
    if (precheckResults.noopMode) {
      if (sticky_locks_for_noop) {
        stickyLocks = true
      } else {
        stickyLocks = false
      }
      core.debug(`🔒 noop mode detected and using stickyLocks: ${stickyLocks}`)
    } else {
      stickyLocks = sticky_locks
    }

    // if we are using sticky_locks in deployments, don't leave a comment as this is inferred by the user
    const leaveComment = stickyLocks === false ? true : false

    core.debug(`🔒 stickyLocks: ${stickyLocks}`)
    core.debug(`💬 leaveComment: ${leaveComment}`)

   
    var deploymentType
    if (precheckResults.noopMode) {
      deploymentType = 'noop'
    } else {
      deploymentType =
        environmentObj.environmentObj.sha !== null ? 'sha' : 'Branch'
    }

    // Set outputs for noopMode
    if (precheckResults.noopMode) {
      core.setOutput('noop', precheckResults.noopMode)
      core.setOutput('continue', 'true')
      core.saveState('noop', precheckResults.noopMode)
      core.info(`🚀 ${COLORS.success}deployment started!${COLORS.reset} (noop)`)

      // If noop mode is enabled, return here
      return 'success - noop'
    } else {
      core.setOutput('noop', precheckResults.noopMode)
      core.saveState('noop', precheckResults.noopMode)
    }

    // Get required_contexts for the deployment
    var requiredContexts = []
    if (
      required_contexts &&
      required_contexts !== '' &&
      required_contexts !== 'false'
    ) {
      requiredContexts = required_contexts.split(',').map(function (item) {
        return item.trim()
      })
    }

    // Check if the environment is a production environment
    const isProductionEnvironment =
      production_environments.includes(environment)
    core.debug(`production_environment: ${isProductionEnvironment}`)

    // if environmentObj.sha is not null, set auto_merge to false,
    // otherwise if update_branch is set to 'disabled', then set auto_merge to false, otherwise set it to true
    // this is important as we cannot reliably merge into the base branch if we are using a SHA
    const auto_merge =
      environmentObj.sha !== null
        ? false
        : update_branch === 'disabled'
        ? false
        : true

    // Create a new deployment
    let deploymentIdsMappedToTestEnvs=new Map();
    let deploymentDataMappedToTestEnvs = new Map();
    for (const testEnvironment of testEnvironments) {
      
      const {data: createDeploy} = await octokit.rest.repos.createDeployment({
        owner: owner,
        repo: repo,
        ref: precheckResults.ref,
        auto_merge: auto_merge,
        required_contexts: requiredContexts,
        environment: testEnvironment,
         description: `Deploying ${releaseName}`,
        production_environment: false,
             payload: {
          type: 'sfops'
        }
      });
      deploymentIdsMappedToTestEnvs.set(testEnvironment,createDeploy.id)
      deploymentDataMappedToTestEnvs.set(testEnvironment,data);
    }


    // If a merge to the base branch is required, let the user know and exit
    for (const testEnvironment of testEnvironments) {
    let id = deploymentIdsMappedToTestEnvs.get(testEnvironment);
    let message = deploymentDataMappedToTestEnvs.get(testEnvironment).message;
    if (
      typeof id === 'undefined' &&
      message.includes('Auto-merged')
    ) {
      const mergeMessage = dedent(`
        ### ⚠️ Deployment Warning

        - Message: ${createDeploy.message}
        - Note: If you have required CI checks, you may need to manually push a commit to re-run them

        > Deployment will not continue. Please try again once this branch is up-to-date with the base branch
        `)
      await actionStatus(context, octokit, reactRes.data.id, mergeMessage)
      core.warning(mergeMessage)
      // Enable bypass for the post deploy step since the deployment is not complete
      core.saveState('bypass', 'true')
      return 'safe-exit'
    }
   }



    for (const testEnvironment of testEnvironments) {
      await createDeploymentStatus(
        octokit,
        context,
        precheckResults.ref,
        'in_progress',
        deploymentIdsMappedToTestEnvs.get(testEnvironment),
        testEnvironment,
        environmentObj.environmentUrl // environment_url (can be null)
      )
    }
    core.info(`🚀 ${COLORS.success}deployment started!`)
    core.setOutput('continue', 'true')
    return 'success'
  } catch (error) {
    core.saveState('bypass', 'true')
    core.error(error.stack)
    core.setFailed(error.message)
  }
}

/* istanbul ignore next */
if (core.getState('isPost') === 'true') {
  post()
} else {
  if (
    process.env.CI === 'true' &&
    process.env.BRANCH_DEPLOY_JEST_TEST !== 'true'
  ) {
    run()
  }
}
