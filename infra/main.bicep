// Jiwar on Azure: everything the group creates in its resource group.
// Deployed once by infra/setup.sh; after that only the CD pipeline changes
// anything (it points the Container Apps at new images).
//
//   <prefix>-logs        Log Analytics workspace (request logs, dashboard, SLO)
//   <prefix>-env         Container Apps environment
//   <prefix>-learning    Container App, scales 0..1
//   <prefix>-projects    Container App, scales 0..1
//   <prefix>-sql         SQL server
//   <prefix>-learning-db serverless database, auto-pause after 15 minutes
//   <prefix>-projects-db serverless database, auto-pause after 15 minutes
//   <prefix>-ui          Static Web App (the React UI)

@description('Group prefix, sdd-<class>-g<N>, for example sdd-3a-g3.')
param prefix string

@description('Region for everything. The IE resource groups are in westeurope.')
param location string = resourceGroup().location

@description('SQL server administrator login, used only by setup.sh to create the per-service users.')
param sqlAdminLogin string = 'jiwaradmin'

@secure()
@description('SQL server administrator password.')
param sqlAdminPassword string

@secure()
@description('Password of learning_user, the contained user of the learning database.')
param learningDbPassword string

@secure()
@description('Password of projects_user, the contained user of the projects database.')
param projectsDbPassword string

@secure()
@description('Shared key the two services use to call each other (X-Internal-Key).')
param internalApiKey string

@description('Images to run. The first setup uses a placeholder; CD replaces it on every merge to main.')
param learningImage string = 'mcr.microsoft.com/k8se/quickstart:latest'
param projectsImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

var services = [
  {
    name: 'learning'
    image: learningImage
    dbPassword: learningDbPassword
  }
  {
    name: 'projects'
    image: projectsImage
    dbPassword: projectsDbPassword
  }
]

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: 1 } // keeps log volume, and cost, low
  }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: '${prefix}-sql'
  location: location
  properties: {
    administratorLogin: sqlAdminLogin
    administratorLoginPassword: sqlAdminPassword
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

// 0.0.0.0 to 0.0.0.0 is Azure's "allow Azure services" rule: Container Apps can
// connect, the internet cannot.
resource allowAzure 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: sqlServer
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource databases 'Microsoft.Sql/servers/databases@2023-08-01-preview' = [
  for s in services: {
    parent: sqlServer
    name: '${prefix}-${s.name}-db'
    location: location
    sku: {
      name: 'GP_S_Gen5_1'
      tier: 'GeneralPurpose'
      family: 'Gen5'
      capacity: 1
    }
    properties: {
      autoPauseDelay: 15
      minCapacity: json('0.5')
      maxSizeBytes: 2147483648 // 2 GB
      requestedBackupStorageRedundancy: 'Local'
      zoneRedundant: false
    }
  }
]

resource ui 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${prefix}-ui'
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

var uiOrigin = 'https://${ui.properties.defaultHostname}'
var sqlHost = sqlServer.properties.fullyQualifiedDomainName

// The learning service's public address, known before it exists, so the
// projects service can be told where to find it.
var learningUrl = 'https://${prefix}-learning.${env.properties.defaultDomain}'

resource apps 'Microsoft.App/containerApps@2024-03-01' = [
  for (s, i) in services: {
    name: '${prefix}-${s.name}'
    location: location
    properties: {
      managedEnvironmentId: env.id
      configuration: {
        activeRevisionsMode: 'Single'
        ingress: {
          external: true
          targetPort: 8000
          transport: 'auto'
          allowInsecure: false
          // No ingress CORS: the services handle CORS themselves (see the A2 guide).
        }
        secrets: [
          {
            name: 'database-url'
            value: 'mssql://${s.name}_user:${uriComponent(s.dbPassword)}@${sqlHost}:1433/${prefix}-${s.name}-db?encrypt=true'
          }
          {
            name: 'internal-api-key'
            value: internalApiKey
          }
        ]
      }
      template: {
        containers: [
          {
            name: s.name
            image: s.image
            resources: {
              cpu: json('0.25')
              memory: '0.5Gi'
            }
            env: concat(
              [
                { name: 'PORT', value: '8000' }
                { name: 'CORS_ORIGIN', value: uiOrigin }
                { name: 'DATABASE_URL', secretRef: 'database-url' }
                { name: 'INTERNAL_API_KEY', secretRef: 'internal-api-key' }
              ],
              s.name == 'projects' ? [{ name: 'LEARNING_URL', value: learningUrl }] : []
            )
          }
        ]
        scale: {
          minReplicas: 0
          maxReplicas: 1
        }
      }
    }
    dependsOn: [databases[i]]
  }
]

output learningUrl string = 'https://${apps[0].properties.configuration.ingress.fqdn}'
output projectsUrl string = 'https://${apps[1].properties.configuration.ingress.fqdn}'
output uiUrl string = uiOrigin
output sqlServerHost string = sqlHost
output logAnalyticsWorkspace string = logs.name
