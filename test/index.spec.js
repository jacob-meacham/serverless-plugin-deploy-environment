import sinon from 'sinon'
import Serverless from 'serverless'
import test from 'ava'
import _ from 'lodash'
import childProcess from 'child_process'
import ServerlessDeployEnvironment from '../src'

function initServerlessPlugin(sls) {
  sls.service.provider.name = 'aws'
  sls.pluginManager.addPlugin(ServerlessDeployEnvironment)
  sls.init()

  return sls.pluginManager.plugins[0]
}

test.beforeEach(t => {
  t.context.sandbox = sinon.createSandbox()
})

test.afterEach.always(t => {
  t.context.sandbox.restore()
})

test('Throws if no stage is found', t => {
  const sls = new Serverless()

  t.throws(() => initServerlessPlugin(sls), { message: /No stage found.*/ })
})

test('Uses default values if no configuration', t => {
  const sls = new Serverless()
  sls.service.custom = {
    defaults: {
      stage: 'test'
    }
  }

  initServerlessPlugin(sls)
  t.deepEqual(sls.service.deployVariables, {})
  t.deepEqual(sls.service.deployEnvironment, {})
})

test('deployVariables are populated synchronously', t => {
  const sls = new Serverless()

  const expectedDeployVariables = {
    a: 1,
    b: { a: 2 },
    c: ['a', 'b', 'c']
  }
  sls.service.custom = {
    defaults: {
      stage: 'test'
    },
    deploy: {
      variables: {
        test: expectedDeployVariables
      }
    }
  }

  initServerlessPlugin(sls)
  t.deepEqual(sls.service.deployVariables, expectedDeployVariables)
})

test('deployVariables are populated by stage', t => {
  const sls = new Serverless()

  sls.service.custom = {
    defaults: {
      stage: 'test'
    },
    deploy: {
      variables: {
        otherStage: {
          a: 1,
          b: { a: 2 },
          c: ['a', 'b', 'c']
        }
      }
    }
  }

  initServerlessPlugin(sls)
  t.deepEqual(sls.service.deployVariables, { })
})

test('deployVariables merges defaults', t => {
  const sls = new Serverless()

  const expectedDeployVariables = {
    a: 1,
    b: { a: 2 },
    c: ['a', 'b', 'c']
  }

  sls.service.custom = {
    defaults: {
      stage: 'test'
    },
    deploy: {
      variables: {
        default: { a: 1 },
        test: {
          b: { a: 2 },
          c: ['a', 'b', 'c']
        }
      }
    }
  }

  initServerlessPlugin(sls)
  t.deepEqual(sls.service.deployVariables, expectedDeployVariables)
})

test('deployEnvironments merges defaults', t => {
  const sls = new Serverless()

  const expectedDeployEnvironment = {
    a: 1,
    b: { a: 2 },
    c: ['a', 'b', 'c']
  }

  sls.service.custom = {
    defaults: {
      stage: 'test'
    },
    deploy: {
      environments: {
        default: { a: 1 },
        test: {
          b: { a: 2 },
          c: ['a', 'b', 'c']
        }
      }
    }
  }

  initServerlessPlugin(sls)
  t.deepEqual(sls.service.deployEnvironment, expectedDeployEnvironment)
})

const CREDSTASH_CONFIG = {
  defaults: {
    stage: 'test'
  },
  test: {
    a: '${credstash:testCredential}', // eslint-disable-line
    other: '${self:test.a}' // eslint-disable-line
  }
}

test('Credstash variables populate', async t => {
  const sls = new Serverless()

  sls.service.custom = _.cloneDeep(CREDSTASH_CONFIG)
  sls.service.provider.region = 'stubRegion'

  const plugin = initServerlessPlugin(sls)
  t.context.sandbox.stub(plugin.credstash, 'get').callsFake((name, cb) => {
    cb(null, 'mySecret')
  })
  await sls.variables.populateService()
  t.is(sls.service.custom.test.a, 'mySecret')
})

test('Throws if credstash errors', async t => {
  const sls = new Serverless()

  sls.service.custom = _.cloneDeep(CREDSTASH_CONFIG)
  sls.service.provider.region = 'stubRegion'

  const plugin = initServerlessPlugin(sls)
  t.context.sandbox.stub(plugin.credstash, 'get').callsFake((name, cb) => {
    cb(new Error('This is my test error'))
  })

  await t.throwsAsync(() => sls.variables.populateService(), { message: /This is my test error/ })
})

test('Skips credstash populate if requested', async t => {
  const sls = new Serverless()

  sls.service.custom = _.cloneDeep(CREDSTASH_CONFIG)

  const plugin = initServerlessPlugin(sls)
  plugin.options.credstash = 'false'

  await sls.variables.populateService()
  t.is(sls.service.custom.test.a, 'credstash:testCredential') // eslint-disable-line
})

test('Throws if populating credstash and no region is specified', async t => {
  const sls = new Serverless()

  sls.service.custom = _.cloneDeep(CREDSTASH_CONFIG)
  sls.service.provider.region = null

  initServerlessPlugin(sls)
  await t.throwsAsync(() => sls.variables.populateService(), { message: /Cannot hydrate Credstash.*/ })
})

test('Merges environment', async t => {
  const sls = new Serverless()

  sls.service.custom = {
    defaults: {
      stage: 'test'
    },
    deploy: {
      environments: {
        default: { a: 1 },
        test: {
          b: 'foo'
        }
      }
    }
  }

  const plugin = initServerlessPlugin(sls)
  await plugin._addDeployEnvironment()
  t.deepEqual(sls.service.provider.environment, {
    a: 1,
    b: 'foo'
  })
})

test.serial('Runs command with correct environment', async t => {
  const sls = new Serverless()

  sls.service.custom = {
    defaults: {
      stage: 'test'
    },
    deploy: {
      environments: {
        default: { a: 1 },
        test: {
          b: 'foo'
        }
      }
    }
  }

  const plugin = initServerlessPlugin(sls)
  plugin.options.args = ['args1', 'args2']
  plugin.options.command = 'myCommand'
  const execSyncStub = t.context.sandbox.stub(childProcess, 'execSync').returns('MY OUTPUT')
  await plugin._runWithEnvironment()
  t.is(execSyncStub.args[0][0], 'myCommand args1,args2')
  const env = execSyncStub.args[0][1].env
  t.is(env.a, 1)
  t.is(env.b, 'foo')
})
