import _ from 'lodash'
import AWS from 'aws-sdk'
import childProcess from 'child_process'
import winston from 'winston'
import Credstash from 'credstash'
import deasyncPromise from 'deasync-promise'

const CREDSTASH_PREFIX = 'credstash'
const CREDSTASH_PATTERN = /^credstash:[\w-]+$/

const credstash = new Credstash()
function _fetchCred(name) {
  return new Promise((resolve, reject) => {
    credstash.get(name, (err, secret) => {
      if (err) {
        reject(err)
      } else {
        resolve(secret)
      }
    })
  })
}

class ServerlessDeployEnvironment {
  constructor(serverless, options) {
    this.serverless = serverless
    // Only meaningful for AWS
    this.provider = 'aws'
    this.config = serverless.service.custom.deployEnvironment
    this.options = options
    this.commands = {
      runWithEnvironment: {
        usage: 'Runs the specified command with the serverless environment variables set',
        lifecycleEvents: ['run'],
        options: {
          command: {
            usage: 'The command to run',
            shortcut: 'c'
          },
          stage: {
            usage: 'The stage to use for stage-specific variables',
            shortcut: 's'
          },
          args: {
            usage: 'Extra arguments to pass through to the subprocess',
            shortcut: 'a'
          }
        }
      }
    }
    // Run automatically as part of the deploy
    this.hooks = {
      // Hook before deploying the function
      'before:deploy:createDeploymentArtifacts': () => this._addDeployEnvironment(),
      // Hook before running sls offline
      'before:offline:start': () => this._addDeployEnvironment(),
      // Hook before running sls webpack invoke
      'before:webpack:invoke:invoke': () => this._addDeployEnvironment(),
      // Command hook
      'runWithEnvironment:run': () => this._runWithEnvironment()
    }

    const stage = options.stage || serverless.service.custom.defaults.stage
    if (!stage) {
      throw new Error('No stage found for serverless-deploy-environment')
    }
    winston.debug(`Getting deploy variables for stage ${stage}`)

    // Allow credstash variables to be resolved
    // TODO(msills): Break into a separate plugin
    if (!options.credstash || options.credstash === 'true') {
      const delegate = serverless.variables.getValueFromSource.bind(serverless.variables)
      serverless.variables.getValueFromSource = function getValueFromSource(variableString) { // eslint-disable-line no-param-reassign, max-len
        if (variableString.startsWith(`${CREDSTASH_PREFIX}:`)) {
          // Configure the AWS region
          const region = serverless.service.provider.region
          if (!region) {
            throw new Error('Cannot hydrate Credstash variables without a region')
          }
          AWS.config.update({ region })

          if (!variableString.match(CREDSTASH_PATTERN)) {
            throw new Error(`Invalid Credstash format for variable ${variableString}`)
          }
          const key = variableString.split(`${CREDSTASH_PREFIX}:`)[1]
          return deasyncPromise(_fetchCred(key))
        }

        return delegate(variableString)
      }
    }


    // Explicitly load the variable syntax, so that calls to populateProperty work
    // TODO(msills): Figure out how to avoid this. For now, it seems safe.
    serverless.variables.loadVariableSyntax()
    // Explicitly resolve these here, so that we can apply any transformations that we want
    serverless.service.deployVariables = serverless.variables.populateProperty(serverless.service.custom.deploy.variables, false)[stage] // eslint-disable-line
    const envs = serverless.variables.populateProperty(serverless.service.custom.deploy.environments, false)
    serverless.service.deployEnvironment = _.merge(envs.default, envs[stage]) // eslint-disable-line
  }

  async _resolveDeployEnvironment() {
    return this.serverless.service.deployEnvironment
  }

  async _addDeployEnvironment() {
    const env = await this._resolveDeployEnvironment()
    // Make sure that the environment exists (if no environment is specified, it's undefined), and augment it with the
    // scoped environment
    this.serverless.service.provider.environment = _.extend(this.serverless.service.provider.environment, env)
  }

  async _runWithEnvironment() {
    const deployEnv = await this._resolveDeployEnvironment()
    const env = {}
    _.merge(env, process.env, deployEnv) // Merge the current environment, overridden with the deploy environment
    const args = this.options.args || ''
    const output = childProcess.execSync(`${this.options.command} ${args}`, { env, cwd: process.cwd() }).toString()
    for (const line of output.split('\n')) {
      winston.info(`[COMMAND OUTPUT]: ${line}`)
    }
  }
}

module.exports = ServerlessDeployEnvironment
