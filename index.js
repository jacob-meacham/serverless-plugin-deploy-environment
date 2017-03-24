import _ from 'lodash'
import BB from 'bluebird'
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
      'before:deploy:functions': () => BB.bind(this).then(this._addDeployEnvironment),
      // Hook before running SLS offline
      'before:offline:start': () => BB.bind(this).then(this._addDeployEnvironment),
      // Command hook
      'runWithEnvironment:run': () => BB.bind(this).then(this._runWithEnvironment)
    }
  }

  async _addDeployEnvironment() {
    const resolved = await this._resolveDeployEnvironment(this.serverless.service.provider.stage)

    for (const [k, v] of _.toPairs(resolved)) {
      // Add to the environment
      this.serverless.service.provider.environment = this.serverless.service.provider.environment || {}
      this.serverless.service.provider.environment[k] = v
    }
  }

  async _resolveDeployEnvironment(stage) {
    const prefix = this.config.prefix || 'LAMBDA'
    // Grab the file, and get the relevant stage
    const deployFile = await this.config.configFile
    const env = _.cloneDeep(deployFile.default || {})
    _.extend(env, deployFile[stage])

    return _.mapKeys(env, (v, k) => `${prefix}_${k}`)
  }

  async _runWithEnvironment() {
    const deployEnv = await this._resolveDeployEnvironment(this.options.stage)
    const env = _.cloneDeep(process.env)
    _.extend(env, deployEnv)
    const args = this.options.args || ''
    const output = childProcess.execSync(`${this.options.command} ${args}`, { env, cwd: process.cwd() }).toString()
    for (const line of output.split('\n')) {
      winston.info(`[COMMAND OUTPUT]: ${line}`)
    }
  }
}

module.exports = ServerlessDeployEnvironment
