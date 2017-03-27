import _ from 'lodash'
import childProcess from 'child_process'
import winston from 'winston'

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

    // Explicitly load the variable syntax, so that calls to populateProperty work
    // TODO(msills): Figure out how to avoid this. For now, it seems safe.
    serverless.variables.loadVariableSyntax()
    // Explicitly resolve these here, so that we can apply any transformations that we want
    serverless.service.deployVariables = serverless.variables.populateProperty(serverless.service.custom.deploy.variables, false)[options.stage] // eslint-disable-line
    const envs = serverless.variables.populateProperty(serverless.service.custom.deploy.environments, false)
    serverless.service.deployEnvironment = _.merge(envs.default, envs[options.stage]) // eslint-disable-line
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
    const env = await this._resolveDeployEnvironment()
    const args = this.options.args || ''
    const output = childProcess.execSync(`${this.options.command} ${args}`, { env, cwd: process.cwd() }).toString()
    for (const line of output.split('\n')) {
      winston.info(`[COMMAND OUTPUT]: ${line}`)
    }
  }
}

module.exports = ServerlessDeployEnvironment
