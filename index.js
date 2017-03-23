import * as _ from 'lodash'
import BB from 'bluebird'

class ServerlessDeployEnvironment {
  constructor(serverless) {
    this.serverless = serverless
    // Only meaningful for AWS
    this.provider = 'aws'
    this.config = serverless.service.custom.deployEnvironment
    // No commands to run
    this.commands = {}
    // Run automatically as part of the deploy
    this.hooks = {
      // Hook before deploying the function
      'before:deploy:functions': () => BB.bind(this).then(this._addDeployEnvironment),
      // Hook before running SLS offline
      'before:offline:start': () => BB.bind(this).then(this._addDeployEnvironment)
    }
  }

  async _addDeployEnvironment() {
    const resolved = await this._resolveDeployEnvironment()
    const prefix = this.config.prefix || 'LAMBDA'
    for (const [k, v] of _.toPairs(resolved)) {
      // Add to the environment
      this.serverless.service.provider.environment[`${prefix}_${k}`] = v
    }
  }

  async _resolveDeployEnvironment() {
    // Grab the file, and get the relevant stage
    const deployFile = await this.config.configFile
    return deployFile[this.serverless.service.provider.stage]
  }
}

module.exports = ServerlessDeployEnvironment
