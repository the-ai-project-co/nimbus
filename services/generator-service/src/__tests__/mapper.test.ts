import { describe, it, expect } from 'bun:test';
import {
  mapStackToVariables,
  getRequiredTemplates,
  getTemplateId,
  validateTemplateRequirements,
  type InfrastructureStack,
} from '../conversational/mapper';

describe('mapStackToVariables', () => {
  describe('common defaults', () => {
    it('should use default values when stack is minimal', () => {
      const stack: InfrastructureStack = {};

      const result = mapStackToVariables(stack);

      expect(result.project_name).toBe('nimbus-project');
      expect(result.environment).toBe('development');
      expect(result.region).toBe('us-east-1');
      expect(result.tags).toEqual({
        Project: 'nimbus-project',
        Environment: 'development',
        ManagedBy: 'Nimbus',
      });
    });

    it('should use provided project name', () => {
      const stack: InfrastructureStack = {
        name: 'my-custom-project',
      };

      const result = mapStackToVariables(stack);

      expect(result.project_name).toBe('my-custom-project');
      expect(result.tags.Project).toBe('my-custom-project');
    });

    it('should use provided region', () => {
      const stack: InfrastructureStack = {
        region: 'eu-west-1',
      };

      const result = mapStackToVariables(stack);

      expect(result.region).toBe('eu-west-1');
    });
  });

  describe('environment-specific defaults', () => {
    it('should apply production defaults', () => {
      const stack: InfrastructureStack = {
        environment: 'production',
      };

      const result = mapStackToVariables(stack);

      expect(result.create_nat_gateway).toBe(true);
      expect(result.nat_gateway_count).toBe(3);
      expect(result.single_nat_gateway).toBe(false);
      expect(result.enable_flow_logs).toBe(true);
      expect(result.flow_logs_retention_days).toBe(90);
      expect(result.node_max_size).toBe(10);
      expect(result.node_desired_size).toBe(3);
      expect(result.instance_class).toBe('db.r6g.large');
      expect(result.multi_az).toBe(true);
    });

    it('should apply staging defaults', () => {
      const stack: InfrastructureStack = {
        environment: 'staging',
      };

      const result = mapStackToVariables(stack);

      expect(result.create_nat_gateway).toBe(true);
      expect(result.nat_gateway_count).toBe(1);
      expect(result.single_nat_gateway).toBe(true);
      expect(result.enable_flow_logs).toBe(false);
    });

    it('should apply development defaults', () => {
      const stack: InfrastructureStack = {
        environment: 'development',
      };

      const result = mapStackToVariables(stack);

      expect(result.create_nat_gateway).toBe(false);
      expect(result.single_nat_gateway).toBe(true);
      expect(result.enable_flow_logs).toBe(false);
      expect(result.node_max_size).toBe(3);
      expect(result.node_desired_size).toBe(1);
      expect(result.instance_class).toBe('db.t3.micro');
      expect(result.multi_az).toBe(false);
    });
  });

  describe('VPC configuration', () => {
    it('should use default VPC values', () => {
      const stack: InfrastructureStack = {};

      const result = mapStackToVariables(stack);

      expect(result.vpc_cidr).toBe('10.0.0.0/16');
      expect(result.enable_dns_hostnames).toBe(true);
      expect(result.enable_dns_support).toBe(true);
      expect(result.public_subnet_count).toBe(3);
      expect(result.private_subnet_count).toBe(3);
    });

    it('should apply VPC config from requirements', () => {
      const stack: InfrastructureStack = {
        requirements: {
          vpc_config: {
            cidr: '172.16.0.0/16',
            subnet_count: 4,
          },
        },
      };

      const result = mapStackToVariables(stack);

      expect(result.vpc_cidr).toBe('172.16.0.0/16');
      expect(result.public_subnet_count).toBe(4);
      expect(result.private_subnet_count).toBe(4);
    });
  });

  describe('EKS configuration', () => {
    it('should use default EKS values', () => {
      const stack: InfrastructureStack = {};

      const result = mapStackToVariables(stack);

      expect(result.cluster_version).toBe('1.28');
      expect(result.node_instance_types).toEqual(['t3.medium']);
      expect(result.node_min_size).toBe(1);
      expect(result.node_max_size).toBe(3);
      expect(result.node_desired_size).toBe(1);
    });

    it('should apply EKS config from requirements', () => {
      const stack: InfrastructureStack = {
        requirements: {
          eks_config: {
            version: '1.29',
            node_count: 5,
            instance_type: 'm5.large',
          },
        },
      };

      const result = mapStackToVariables(stack);

      expect(result.cluster_version).toBe('1.29');
      expect(result.node_instance_types).toEqual(['m5.large']);
      expect(result.node_desired_size).toBe(5);
      expect(result.node_max_size).toBe(10); // node_count * 2
      expect(result.node_min_size).toBe(1);
    });
  });

  describe('RDS configuration', () => {
    it('should use default RDS values', () => {
      const stack: InfrastructureStack = {};

      const result = mapStackToVariables(stack);

      expect(result.engine).toBe('postgres');
      expect(result.engine_version).toBe('15.4');
      expect(result.instance_class).toBe('db.t3.micro');
      expect(result.allocated_storage).toBe(20);
      expect(result.multi_az).toBe(false);
    });

    it('should apply RDS config from requirements', () => {
      const stack: InfrastructureStack = {
        requirements: {
          rds_config: {
            engine: 'mysql',
            instance_class: 'db.r5.large',
            storage: 100,
          },
        },
      };

      const result = mapStackToVariables(stack);

      expect(result.engine).toBe('mysql');
      expect(result.instance_class).toBe('db.r5.large');
      expect(result.allocated_storage).toBe(100);
    });
  });

  describe('S3 configuration', () => {
    it('should use default S3 values', () => {
      const stack: InfrastructureStack = {
        name: 'test-project',
        environment: 'development',
      };

      const result = mapStackToVariables(stack);

      expect(result.bucket_name).toBe('test-project-development-bucket');
      expect(result.versioning_enabled).toBe(true);
      expect(result.encryption_enabled).toBe(true);
    });

    it('should apply S3 config from requirements', () => {
      const stack: InfrastructureStack = {
        requirements: {
          s3_config: {
            versioning: false,
            encryption: true,
          },
        },
      };

      const result = mapStackToVariables(stack);

      expect(result.versioning_enabled).toBe(false);
      expect(result.encryption_enabled).toBe(true);
    });
  });

  describe('custom defaults override', () => {
    it('should allow overriding with custom defaults', () => {
      const stack: InfrastructureStack = {
        name: 'my-project',
        environment: 'production',
      };

      const customDefaults = {
        vpc_cidr: '192.168.0.0/16',
        cluster_version: '1.30',
      };

      const result = mapStackToVariables(stack, customDefaults);

      expect(result.vpc_cidr).toBe('192.168.0.0/16');
      expect(result.cluster_version).toBe('1.30');
      // Other production defaults should still apply
      expect(result.multi_az).toBe(true);
    });
  });

  describe('tags merging', () => {
    it('should merge custom tags with default tags', () => {
      const stack: InfrastructureStack = {
        name: 'my-project',
        requirements: {
          tags: {
            Team: 'Platform',
            CostCenter: '12345',
          },
        },
      };

      const result = mapStackToVariables(stack);

      expect(result.tags).toEqual({
        Project: 'my-project',
        Environment: 'development',
        ManagedBy: 'Nimbus',
        Team: 'Platform',
        CostCenter: '12345',
      });
    });
  });
});

describe('getTemplateId', () => {
  it('should format template ID correctly', () => {
    expect(getTemplateId('terraform', 'aws', 'vpc')).toBe('terraform/aws/vpc');
    expect(getTemplateId('terraform', 'gcp', 'gke')).toBe('terraform/gcp/gke');
    expect(getTemplateId('kubernetes', 'generic', 'deployment')).toBe('kubernetes/generic/deployment');
  });
});

describe('getRequiredTemplates', () => {
  it('should return empty array for stack without components', () => {
    const stack: InfrastructureStack = {};

    const result = getRequiredTemplates(stack);

    expect(result).toEqual([]);
  });

  it('should generate template IDs for all components', () => {
    const stack: InfrastructureStack = {
      provider: 'aws',
      components: ['vpc', 'eks', 'rds'],
    };

    const result = getRequiredTemplates(stack);

    expect(result).toEqual([
      'terraform/aws/vpc',
      'terraform/aws/eks',
      'terraform/aws/rds',
    ]);
  });

  it('should use default provider when not specified', () => {
    const stack: InfrastructureStack = {
      components: ['vpc', 's3'],
    };

    const result = getRequiredTemplates(stack);

    expect(result).toEqual([
      'terraform/aws/vpc',
      'terraform/aws/s3',
    ]);
  });

  it('should support different template types', () => {
    const stack: InfrastructureStack = {
      provider: 'generic',
      components: ['deployment', 'service'],
    };

    const result = getRequiredTemplates(stack, 'kubernetes');

    expect(result).toEqual([
      'kubernetes/generic/deployment',
      'kubernetes/generic/service',
    ]);
  });
});

describe('validateTemplateRequirements', () => {
  it('should return valid when all templates exist', () => {
    const stack: InfrastructureStack = {
      provider: 'aws',
      components: ['vpc', 'eks'],
    };

    const availableTemplates = [
      'terraform/aws/vpc',
      'terraform/aws/eks',
      'terraform/aws/rds',
      'terraform/aws/s3',
    ];

    const result = validateTemplateRequirements(stack, availableTemplates);

    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('should return invalid with missing templates', () => {
    const stack: InfrastructureStack = {
      provider: 'aws',
      components: ['vpc', 'lambda'],
    };

    const availableTemplates = [
      'terraform/aws/vpc',
      'terraform/aws/eks',
    ];

    const result = validateTemplateRequirements(stack, availableTemplates);

    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(['terraform/aws/lambda']);
  });

  it('should handle empty stack', () => {
    const stack: InfrastructureStack = {};

    const result = validateTemplateRequirements(stack, []);

    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });
});

describe('GCP-specific mappings', () => {
  describe('GKE configuration', () => {
    it('should generate GCP template IDs for GKE components', () => {
      const stack: InfrastructureStack = {
        provider: 'gcp',
        components: ['gke', 'cloud-sql', 'gcs'],
      };

      const result = getRequiredTemplates(stack);

      expect(result).toEqual([
        'terraform/gcp/gke',
        'terraform/gcp/cloud-sql',
        'terraform/gcp/gcs',
      ]);
    });

    it('should use GCP region for GKE stack', () => {
      const stack: InfrastructureStack = {
        provider: 'gcp',
        region: 'us-central1',
        components: ['gke'],
      };

      const result = mapStackToVariables(stack);

      expect(result.region).toBe('us-central1');
    });

    it('should apply EKS config variables for GKE (shared fields)', () => {
      const stack: InfrastructureStack = {
        provider: 'gcp',
        requirements: {
          eks_config: {
            version: '1.29',
            node_count: 4,
            instance_type: 'e2-standard-4',
          },
        },
      };

      const result = mapStackToVariables(stack);

      expect(result.cluster_version).toBe('1.29');
      expect(result.node_desired_size).toBe(4);
      expect(result.node_instance_types).toEqual(['e2-standard-4']);
      expect(result.node_max_size).toBe(8); // node_count * 2
    });
  });

  describe('Cloud SQL configuration', () => {
    it('should map RDS config fields for Cloud SQL', () => {
      const stack: InfrastructureStack = {
        provider: 'gcp',
        requirements: {
          rds_config: {
            engine: 'postgres',
            instance_class: 'db-custom-4-15360',
            storage: 50,
          },
        },
      };

      const result = mapStackToVariables(stack);

      expect(result.engine).toBe('postgres');
      expect(result.instance_class).toBe('db-custom-4-15360');
      expect(result.allocated_storage).toBe(50);
    });
  });

  describe('GCS configuration', () => {
    it('should map S3 config fields for GCS', () => {
      const stack: InfrastructureStack = {
        provider: 'gcp',
        name: 'gcp-project',
        environment: 'production',
        requirements: {
          s3_config: {
            versioning: true,
            encryption: true,
          },
        },
      };

      const result = mapStackToVariables(stack);

      expect(result.versioning_enabled).toBe(true);
      expect(result.encryption_enabled).toBe(true);
      expect(result.bucket_name).toBe('gcp-project-production-bucket');
    });
  });

  describe('GCP environment-specific overrides', () => {
    it('should apply production defaults for GCP stack', () => {
      const stack: InfrastructureStack = {
        provider: 'gcp',
        environment: 'production',
        region: 'us-central1',
      };

      const result = mapStackToVariables(stack);

      expect(result.multi_az).toBe(true);
      expect(result.create_nat_gateway).toBe(true);
      expect(result.nat_gateway_count).toBe(3);
      expect(result.enable_flow_logs).toBe(true);
      expect(result.node_max_size).toBe(10);
      expect(result.node_desired_size).toBe(3);
      expect(result.instance_class).toBe('db.r6g.large');
    });

    it('should apply development defaults for GCP stack', () => {
      const stack: InfrastructureStack = {
        provider: 'gcp',
        environment: 'development',
        region: 'us-central1',
      };

      const result = mapStackToVariables(stack);

      expect(result.multi_az).toBe(false);
      expect(result.create_nat_gateway).toBe(false);
      expect(result.node_max_size).toBe(3);
      expect(result.node_desired_size).toBe(1);
      expect(result.instance_class).toBe('db.t3.micro');
    });
  });

  describe('GCP template validation', () => {
    it('should validate GCP templates correctly', () => {
      const stack: InfrastructureStack = {
        provider: 'gcp',
        components: ['gke', 'cloud-sql'],
      };

      const availableTemplates = [
        'terraform/gcp/gke',
        'terraform/gcp/cloud-sql',
        'terraform/gcp/gcs',
      ];

      const result = validateTemplateRequirements(stack, availableTemplates);

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should detect missing GCP templates', () => {
      const stack: InfrastructureStack = {
        provider: 'gcp',
        components: ['gke', 'cloud-run'],
      };

      const availableTemplates = [
        'terraform/gcp/gke',
      ];

      const result = validateTemplateRequirements(stack, availableTemplates);

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['terraform/gcp/cloud-run']);
    });
  });
});

describe('Azure-specific mappings', () => {
  describe('AKS configuration', () => {
    it('should generate Azure template IDs for AKS components', () => {
      const stack: InfrastructureStack = {
        provider: 'azure',
        components: ['aks', 'azure-sql', 'blob-storage'],
      };

      const result = getRequiredTemplates(stack);

      expect(result).toEqual([
        'terraform/azure/aks',
        'terraform/azure/azure-sql',
        'terraform/azure/blob-storage',
      ]);
    });

    it('should use Azure region for AKS stack', () => {
      const stack: InfrastructureStack = {
        provider: 'azure',
        region: 'eastus2',
        components: ['aks'],
      };

      const result = mapStackToVariables(stack);

      expect(result.region).toBe('eastus2');
    });

    it('should apply EKS config variables for AKS (shared fields)', () => {
      const stack: InfrastructureStack = {
        provider: 'azure',
        requirements: {
          eks_config: {
            version: '1.28',
            node_count: 3,
            instance_type: 'Standard_D4s_v3',
          },
        },
      };

      const result = mapStackToVariables(stack);

      expect(result.cluster_version).toBe('1.28');
      expect(result.node_desired_size).toBe(3);
      expect(result.node_instance_types).toEqual(['Standard_D4s_v3']);
      expect(result.node_max_size).toBe(6); // node_count * 2
    });
  });

  describe('Azure SQL configuration', () => {
    it('should map RDS config fields for Azure SQL', () => {
      const stack: InfrastructureStack = {
        provider: 'azure',
        requirements: {
          rds_config: {
            engine: 'mysql',
            instance_class: 'GP_Gen5_2',
            storage: 200,
          },
        },
      };

      const result = mapStackToVariables(stack);

      expect(result.engine).toBe('mysql');
      expect(result.instance_class).toBe('GP_Gen5_2');
      expect(result.allocated_storage).toBe(200);
    });
  });

  describe('Blob Storage configuration', () => {
    it('should map S3 config fields for Azure Blob Storage', () => {
      const stack: InfrastructureStack = {
        provider: 'azure',
        name: 'azure-project',
        environment: 'staging',
        requirements: {
          s3_config: {
            versioning: false,
            encryption: true,
          },
        },
      };

      const result = mapStackToVariables(stack);

      expect(result.versioning_enabled).toBe(false);
      expect(result.encryption_enabled).toBe(true);
      expect(result.bucket_name).toBe('azure-project-staging-bucket');
    });
  });

  describe('Azure environment-specific overrides', () => {
    it('should apply production defaults for Azure stack', () => {
      const stack: InfrastructureStack = {
        provider: 'azure',
        environment: 'production',
        region: 'eastus',
      };

      const result = mapStackToVariables(stack);

      expect(result.multi_az).toBe(true);
      expect(result.create_nat_gateway).toBe(true);
      expect(result.nat_gateway_count).toBe(3);
      expect(result.single_nat_gateway).toBe(false);
      expect(result.enable_flow_logs).toBe(true);
      expect(result.flow_logs_retention_days).toBe(90);
      expect(result.node_max_size).toBe(10);
      expect(result.instance_class).toBe('db.r6g.large');
    });

    it('should apply staging defaults for Azure stack', () => {
      const stack: InfrastructureStack = {
        provider: 'azure',
        environment: 'staging',
        region: 'westeurope',
      };

      const result = mapStackToVariables(stack);

      expect(result.create_nat_gateway).toBe(true);
      expect(result.nat_gateway_count).toBe(1);
      expect(result.single_nat_gateway).toBe(true);
      expect(result.enable_flow_logs).toBe(false);
    });

    it('should apply development defaults for Azure stack', () => {
      const stack: InfrastructureStack = {
        provider: 'azure',
        environment: 'development',
        region: 'westus2',
      };

      const result = mapStackToVariables(stack);

      expect(result.multi_az).toBe(false);
      expect(result.create_nat_gateway).toBe(false);
      expect(result.node_max_size).toBe(3);
      expect(result.node_desired_size).toBe(1);
    });
  });

  describe('Azure template validation', () => {
    it('should validate Azure templates correctly', () => {
      const stack: InfrastructureStack = {
        provider: 'azure',
        components: ['aks', 'azure-sql'],
      };

      const availableTemplates = [
        'terraform/azure/aks',
        'terraform/azure/azure-sql',
        'terraform/azure/blob-storage',
      ];

      const result = validateTemplateRequirements(stack, availableTemplates);

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should detect missing Azure templates', () => {
      const stack: InfrastructureStack = {
        provider: 'azure',
        components: ['aks', 'cosmos-db'],
      };

      const availableTemplates = [
        'terraform/azure/aks',
      ];

      const result = validateTemplateRequirements(stack, availableTemplates);

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['terraform/azure/cosmos-db']);
    });
  });
});

describe('edge cases', () => {
  describe('empty input', () => {
    it('should handle completely empty stack', () => {
      const stack: InfrastructureStack = {};

      const result = mapStackToVariables(stack);

      expect(result.project_name).toBe('nimbus-project');
      expect(result.environment).toBe('development');
      expect(result.region).toBe('us-east-1');
      expect(result.vpc_cidr).toBe('10.0.0.0/16');
      expect(result.cluster_version).toBe('1.28');
      expect(result.engine).toBe('postgres');
    });

    it('should handle stack with only name', () => {
      const stack: InfrastructureStack = { name: 'solo-name' };

      const result = mapStackToVariables(stack);

      expect(result.project_name).toBe('solo-name');
      expect(result.tags.Project).toBe('solo-name');
      expect(result.bucket_name).toBe('solo-name-development-bucket');
    });

    it('should handle stack with empty components array', () => {
      const stack: InfrastructureStack = {
        provider: 'aws',
        components: [],
      };

      const templates = getRequiredTemplates(stack);
      expect(templates).toEqual([]);

      const validation = validateTemplateRequirements(stack, []);
      expect(validation.valid).toBe(true);
      expect(validation.missing).toEqual([]);
    });

    it('should handle empty requirements object', () => {
      const stack: InfrastructureStack = {
        requirements: {},
      };

      const result = mapStackToVariables(stack);

      // Should fall back to all defaults
      expect(result.vpc_cidr).toBe('10.0.0.0/16');
      expect(result.cluster_version).toBe('1.28');
      expect(result.engine).toBe('postgres');
      expect(result.allocated_storage).toBe(20);
    });
  });

  describe('missing required fields', () => {
    it('should handle requirements with partial vpc_config', () => {
      const stack: InfrastructureStack = {
        requirements: {
          vpc_config: {
            cidr: '10.1.0.0/16',
            // no subnet_count
          },
        },
      };

      const result = mapStackToVariables(stack);

      expect(result.vpc_cidr).toBe('10.1.0.0/16');
      // subnet_count should remain default
      expect(result.public_subnet_count).toBe(3);
      expect(result.private_subnet_count).toBe(3);
    });

    it('should handle requirements with partial eks_config', () => {
      const stack: InfrastructureStack = {
        requirements: {
          eks_config: {
            version: '1.30',
            // no node_count, no instance_type
          },
        },
      };

      const result = mapStackToVariables(stack);

      expect(result.cluster_version).toBe('1.30');
      expect(result.node_instance_types).toEqual(['t3.medium']); // default
      expect(result.node_desired_size).toBe(1); // default
    });

    it('should handle requirements with partial rds_config', () => {
      const stack: InfrastructureStack = {
        requirements: {
          rds_config: {
            engine: 'mysql',
            // no instance_class, no storage
          },
        },
      };

      const result = mapStackToVariables(stack);

      expect(result.engine).toBe('mysql');
      expect(result.instance_class).toBe('db.t3.micro'); // default
      expect(result.allocated_storage).toBe(20); // default
    });
  });

  describe('unknown provider', () => {
    it('should handle unknown provider for template generation', () => {
      const stack: InfrastructureStack = {
        provider: 'digitalocean',
        components: ['droplet', 'managed-db'],
      };

      const result = getRequiredTemplates(stack);

      expect(result).toEqual([
        'terraform/digitalocean/droplet',
        'terraform/digitalocean/managed-db',
      ]);
    });

    it('should handle unknown provider for variable mapping', () => {
      const stack: InfrastructureStack = {
        provider: 'digitalocean',
        region: 'nyc1',
        environment: 'production',
      };

      const result = mapStackToVariables(stack);

      // Should still apply defaults and env-specific values
      expect(result.region).toBe('nyc1');
      expect(result.multi_az).toBe(true); // production default
      expect(result.create_nat_gateway).toBe(true); // production default
    });

    it('should validate unknown provider templates', () => {
      const stack: InfrastructureStack = {
        provider: 'oracle',
        components: ['oke'],
      };

      const result = validateTemplateRequirements(stack, []);

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['terraform/oracle/oke']);
    });
  });

  describe('custom defaults with provider-specific stacks', () => {
    it('should allow custom defaults to override GCP stack values', () => {
      const stack: InfrastructureStack = {
        provider: 'gcp',
        environment: 'production',
        region: 'us-central1',
      };

      const customDefaults = {
        cluster_version: '1.30',
        node_max_size: 20,
      };

      const result = mapStackToVariables(stack, customDefaults);

      expect(result.cluster_version).toBe('1.30');
      expect(result.node_max_size).toBe(20);
      // Production defaults should still apply for non-overridden values
      expect(result.multi_az).toBe(true);
    });

    it('should allow custom defaults to override Azure stack values', () => {
      const stack: InfrastructureStack = {
        provider: 'azure',
        environment: 'staging',
        region: 'eastus',
      };

      const customDefaults = {
        vpc_cidr: '172.16.0.0/12',
        instance_class: 'Standard_DS3_v2',
      };

      const result = mapStackToVariables(stack, customDefaults);

      expect(result.vpc_cidr).toBe('172.16.0.0/12');
      expect(result.instance_class).toBe('Standard_DS3_v2');
    });
  });
});
