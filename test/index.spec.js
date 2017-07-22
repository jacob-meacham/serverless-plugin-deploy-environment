import AWS from 'aws-sdk-mock'
import Serverless from 'serverless'
import ServerlessDeployEnvironment from '../src'

describe('ServerlessDeployEnvironment', () => {
  afterEach(() => {
    AWS.restore()
  })

  function createFakeServerless() {
    const sls = new Serverless()
    // Attach the plugin
    sls.pluginManager.addPlugin(ServerlessDeployEnvironment)
    sls.init()
    return sls
  }

  it('should pass', async () => {
    await createFakeServerless()
  })
})
