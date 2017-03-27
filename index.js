import _ from 'lodash'
import childProcess from 'child_process'
import fs from 'fs'
import winston from 'winston'
import yaml from 'js-yaml'

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
      // Hook before running SLS offline
      'before:offline:start': () => this._addDeployEnvironment(),
      // Command hook
      'runWithEnvironment:run': () => this._runWithEnvironment()
    }

    // Resolve the configuration from the passed-in parameters
    this.deployEnvironment = this._resolveDeployEnvironment()
    // Augment the environment of the process with all scopes
    _.forOwn(this.deployEnvironment, env => _.extend(process.env, env))
  }

  _resolveDeployEnvironment() {
    const deployFile = yaml.safeLoad(fs.readFileSync(this.config.configFile))
    const prefix = this.config.prefix || 'LAMBDA'
    // Grab the file, and get the relevant stage
    const env = _.cloneDeep(deployFile.default || {})
    _.merge(env, deployFile[this.options.stage])

    // Function that prep ends the prefix to the keys of an object
    const prefixMapper = (o => _.mapKeys(o, (v, k) => `${prefix}_${k}`))
    // Apply the prefix prepending to all scopes (sls and lambda)
    return _.mapValues(env, prefixMapper)
  }

  async _addDeployEnvironment() {
    // Make sure that the environment exists (if no environment is specified, it's undefined), and augment it with the
    // lambda scoped environment
    this.serverless.service.provider.environment = _.extend(
      this.serverless.service.provider.environment, this.deployEnvironment.lambda)
  }

  async _runWithEnvironment() {
    const args = this.options.args || ''
    const output = childProcess.execSync(`${this.options.command} ${args}`, { cwd: process.cwd() }).toString()
    for (const line of output.split('\n')) {
      winston.info(`[COMMAND OUTPUT]: ${line}`)
    }
  }
}

module.exports = ServerlessDeployEnvironment
