# serverless-plugin-deploy-environment
[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![Coverage Status](https://coveralls.io/repos/github/DopplerLabs/serverless-plugin-deploy-environment/badge.svg?branch=develop)](https://coveralls.io/github/DopplerLabs/serverless-plugin-deploy-environment?branch=develop)
[![Build Status](https://travis-ci.org/DopplerLabs/serverless-plugin-deploy-environment.svg?branch=develop)](https://travis-ci.org/DopplerLabs/serverless-plugin-deploy-environment)

This plugin exposes per-stage deployment variables and deployment environment, and allows users to run commands with the environment of a given stage. The defined deployment environment is automatically merged with the serverless provider environment. It also optionally resolves [credstash](https://github.com/fugue/credstash) variables. The benefit of this is that its simpler to manage different variables for each environment, and makes the addition of default environment variables simple.

See our [docs](https://dopplerlabs.github.io/serverless-plugin-deploy-environment/) for full documentation.

# Usage
## Basic Usage
```yaml
provider:
  region: us-west-2
custom:
  deploy:
    variables:
      dev:
        role: "devRole"
        streamArn: "devStream"
      staging:
        role: "stagingRole"
        streamArn: "stagingStream"
    environments:
      # These will be added to all environments
      default:
        LAMBDA_LOG_LEVEL: info
        LAMBDA_REGION: ${self:provider.region} # All references are resolved
        LAMBDA_ES_HOST:
          'Fn::GetAtt': [ 'ESCluster', 'DomainEndpoint' ]
      dev:
        LAMBDA_ES_HOST: localhost

plugins:
  - serverless-plugin-deploy-environment
```

Given this config, running with `sls deploy --stage dev` would yield the following resolved configuration
```yaml
deployVariables:
  role: "devRole"
  streamArn: "devStream"
deployEnvironment:
  LAMBDA_LOG_LEVEL: info
  LAMBDA_REGION: us-west-2
  LAMBDA_ES_HOST: localhost
```

## Running in an Environment
This plugin also exposes a command to run with the stage environment exposed. Give the above config, the command
`sls runWithEnvironment --command 'echo $LAMBDA_ES_HOST' --stage 'dev'` will output `localhost`.

## Production Usage
The way that we use this at Doppler is that we have two separate configuration files at config/deploy.yml and config/variables.yml. All of the variables defined in deploy.yml will become environment variables, and everything in variables.yml are internal variables used to resolve references elsewhere in serverless.yml. Then, in our main serverless.yml file, we have

```yaml
custom:
  deploy:
    variables: ${file(config/variables.yml)}
    environments: ${file(config/deploy.yml)}

provider:
  # ... Other static properties
  domain: ${self:deployVariables.domain}
  role: ${self:deployVariables.role}
```

# Credstash
This plugin also offers the ability to resolve credstash secrets anywhere in the Serverless configuration. First, set up credstash by following the instructions [here](https://github.com/fugue/credstash). Then, in your configuration file, you can add:

```yaml
custom:
  deploy:
    environments:
      staging:
        MY_PASSWORD: ${credstash:stagingPassword}
      production:
        MY_PASSWORD: ${credstash:productionPassword}


```

Please note that because these are resolved at build time, the plain-text passwords WILL be viewable in Cloudformation and on the Lambda dashboard.

# Version History
* 1.0.2
  - Bump version of credstash to deal with change in API (Thanks @concon121)
* 1.0.1
  - Fix publishing issue
* 1.0.0
  - Initial release
