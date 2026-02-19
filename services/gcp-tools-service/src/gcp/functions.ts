/**
 * GCP Cloud Functions Operations
 *
 * Provides operations for managing Cloud Functions
 */

import { logger } from '@nimbus/shared-utils';

const functions = require('@google-cloud/functions');

export interface FunctionsConfig {
  projectId?: string;
}

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Cloud Functions operations using Google Cloud SDK
 */
export class FunctionsOperations {
  private projectId: string;

  constructor(config: FunctionsConfig = {}) {
    this.projectId = config.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '';
  }

  /**
   * List Cloud Functions
   */
  async listFunctions(project?: string, location?: string): Promise<OperationResult> {
    try {
      const effectiveProject = project || this.projectId;
      if (!effectiveProject) {
        return { success: false, error: 'No project specified. Set GOOGLE_CLOUD_PROJECT or pass project parameter.' };
      }

      const functionsClient = new functions.FunctionServiceClient();
      const parent = location
        ? `projects/${effectiveProject}/locations/${location}`
        : `projects/${effectiveProject}/locations/-`;

      const cloudFunctions: any[] = [];
      const iterable = functionsClient.listFunctionsAsync({ parent });

      for await (const func of iterable) {
        cloudFunctions.push({
          name: func.name,
          description: func.description,
          state: func.state,
          environment: func.environment,
          buildConfig: func.buildConfig ? {
            runtime: func.buildConfig.runtime,
            entryPoint: func.buildConfig.entryPoint,
            source: func.buildConfig.source,
            dockerRepository: func.buildConfig.dockerRepository,
          } : null,
          serviceConfig: func.serviceConfig ? {
            service: func.serviceConfig.service,
            timeoutSeconds: func.serviceConfig.timeoutSeconds,
            availableMemory: func.serviceConfig.availableMemory,
            availableCpu: func.serviceConfig.availableCpu,
            maxInstanceCount: func.serviceConfig.maxInstanceCount,
            minInstanceCount: func.serviceConfig.minInstanceCount,
            vpcConnector: func.serviceConfig.vpcConnector,
            ingressSettings: func.serviceConfig.ingressSettings,
            uri: func.serviceConfig.uri,
            serviceAccountEmail: func.serviceConfig.serviceAccountEmail,
            environmentVariables: func.serviceConfig.environmentVariables || {},
          } : null,
          eventTrigger: func.eventTrigger ? {
            trigger: func.eventTrigger.trigger,
            triggerRegion: func.eventTrigger.triggerRegion,
            eventType: func.eventTrigger.eventType,
            pubsubTopic: func.eventTrigger.pubsubTopic,
            serviceAccountEmail: func.eventTrigger.serviceAccountEmail,
            retryPolicy: func.eventTrigger.retryPolicy,
          } : null,
          labels: func.labels || {},
          updateTime: func.updateTime,
          createTime: func.createTime,
          url: func.url,
        });
      }

      return {
        success: true,
        data: { functions: cloudFunctions },
      };
    } catch (error: any) {
      logger.error('Failed to list Cloud Functions', error);
      return { success: false, error: error.message };
    }
  }
}
