import { logger } from '@nimbus/shared-utils';
import type {
  BestPracticeRule,
  BestPracticeViolation,
  BestPracticeReport,
} from './types';
import { allRules, securityRules, taggingRules, costRules, reliabilityRules, performanceRules } from './rules';

export class BestPracticesEngine {
  private rules: Map<string, BestPracticeRule>;

  constructor(customRules: BestPracticeRule[] = []) {
    this.rules = new Map();

    // Load default rules
    [...allRules, ...customRules].forEach((rule) => {
      this.rules.set(rule.id, rule);
    });

    logger.info(`Initialized Best Practices Engine with ${this.rules.size} rules`);
  }

  /**
   * Analyze configuration against all best practices
   */
  analyze(
    component: string,
    config: Record<string, unknown>,
    options?: {
      categories?: Array<'security' | 'tagging' | 'cost' | 'reliability' | 'performance' | 'networking' | 'compliance'>;
      severities?: Array<'critical' | 'high' | 'medium' | 'low' | 'info'>;
      includeInfo?: boolean;
    }
  ): BestPracticeReport {
    const violations: BestPracticeViolation[] = [];
    const recommendations: string[] = [];

    // Filter rules based on component and options
    const applicableRules = this.getApplicableRules(component, options);

    logger.debug(`Checking ${applicableRules.length} rules for component: ${component}`);

    // Check each rule
    for (const rule of applicableRules) {
      try {
        const passed = rule.check(config);

        if (!passed) {
          violations.push({
            rule_id: rule.id,
            category: rule.category,
            severity: rule.severity,
            title: rule.title,
            description: rule.description,
            recommendation: rule.recommendation,
            component,
            can_autofix: !!rule.autofix,
          });

          recommendations.push(rule.recommendation);
        }
      } catch (error) {
        logger.error(`Error checking rule ${rule.id}`, error);
      }
    }

    // Build summary
    const summary = this.buildSummary(violations, applicableRules.length);

    logger.info(
      `Best practices analysis complete: ${violations.length} violations found out of ${applicableRules.length} rules checked`
    );

    return {
      summary,
      violations,
      recommendations: [...new Set(recommendations)], // Deduplicate
    };
  }

  /**
   * Analyze multiple components
   */
  analyzeAll(
    configs: Array<{ component: string; config: Record<string, unknown> }>,
    options?: {
      categories?: Array<'security' | 'tagging' | 'cost' | 'reliability' | 'performance' | 'networking' | 'compliance'>;
      severities?: Array<'critical' | 'high' | 'medium' | 'low' | 'info'>;
    }
  ): BestPracticeReport {
    const allViolations: BestPracticeViolation[] = [];
    const allRecommendations: string[] = [];
    let totalRulesChecked = 0;

    for (const { component, config } of configs) {
      const report = this.analyze(component, config, options);
      allViolations.push(...report.violations);
      allRecommendations.push(...report.recommendations);
      totalRulesChecked += report.summary.total_rules_checked;
    }

    const summary = this.buildSummary(allViolations, totalRulesChecked);

    return {
      summary,
      violations: allViolations,
      recommendations: [...new Set(allRecommendations)],
    };
  }

  /**
   * Apply autofixes to configuration
   */
  autofix(
    component: string,
    config: Record<string, unknown>,
    options?: {
      categories?: Array<'security' | 'tagging' | 'cost' | 'reliability' | 'performance' | 'networking' | 'compliance'>;
      severities?: Array<'critical' | 'high' | 'medium' | 'low' | 'info'>;
      ruleIds?: string[];
    }
  ): {
    fixed_config: Record<string, unknown>;
    applied_fixes: string[];
    violations_remaining: BestPracticeViolation[];
  } {
    let fixedConfig = { ...config };
    const appliedFixes: string[] = [];

    // Get applicable rules
    let applicableRules = this.getApplicableRules(component, options);

    // Filter by rule IDs if specified
    if (options?.ruleIds) {
      applicableRules = applicableRules.filter((rule) =>
        options.ruleIds!.includes(rule.id)
      );
    }

    // Apply fixes
    for (const rule of applicableRules) {
      if (rule.autofix) {
        try {
          const passed = rule.check(fixedConfig);
          if (!passed) {
            fixedConfig = rule.autofix(fixedConfig);
            appliedFixes.push(rule.id);
            logger.debug(`Applied autofix for rule: ${rule.id}`);
          }
        } catch (error) {
          logger.error(`Error applying autofix for rule ${rule.id}`, error);
        }
      }
    }

    // Re-analyze to find remaining violations
    const report = this.analyze(component, fixedConfig, options);

    logger.info(`Applied ${appliedFixes.length} autofixes, ${report.violations.length} violations remaining`);

    return {
      fixed_config: fixedConfig,
      applied_fixes: appliedFixes,
      violations_remaining: report.violations,
    };
  }

  /**
   * Get rules by category
   */
  getRulesByCategory(category: 'security' | 'tagging' | 'cost' | 'reliability' | 'performance'): BestPracticeRule[] {
    const ruleMap = {
      security: securityRules,
      tagging: taggingRules,
      cost: costRules,
      reliability: reliabilityRules,
      performance: performanceRules,
    };

    return ruleMap[category] || [];
  }

  /**
   * Get a specific rule by ID
   */
  getRule(ruleId: string): BestPracticeRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * List all rules
   */
  listRules(): BestPracticeRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Add custom rule
   */
  addRule(rule: BestPracticeRule): void {
    this.rules.set(rule.id, rule);
    logger.debug(`Added custom rule: ${rule.id}`);
  }

  /**
   * Remove rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    logger.debug(`Removed rule: ${ruleId}`);
  }

  /**
   * Get applicable rules for a component
   */
  private getApplicableRules(
    component: string,
    options?: {
      categories?: Array<'security' | 'tagging' | 'cost' | 'reliability' | 'performance' | 'networking' | 'compliance'>;
      severities?: Array<'critical' | 'high' | 'medium' | 'low' | 'info'>;
      includeInfo?: boolean;
    }
  ): BestPracticeRule[] {
    let rules = Array.from(this.rules.values()).filter((rule) =>
      rule.applies_to.includes(component)
    );

    // Filter by categories
    if (options?.categories && options.categories.length > 0) {
      rules = rules.filter((rule) => options.categories!.includes(rule.category));
    }

    // Filter by severities
    if (options?.severities && options.severities.length > 0) {
      rules = rules.filter((rule) => options.severities!.includes(rule.severity));
    }

    // Exclude info severity unless explicitly included
    if (!options?.includeInfo) {
      rules = rules.filter((rule) => rule.severity !== 'info');
    }

    return rules;
  }

  /**
   * Build summary from violations
   */
  private buildSummary(violations: BestPracticeViolation[], totalRulesChecked: number) {
    const violationsBySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    const violationsByCategory: Record<string, number> = {
      security: 0,
      tagging: 0,
      cost: 0,
      reliability: 0,
      performance: 0,
    };

    let autofixableViolations = 0;

    for (const violation of violations) {
      violationsBySeverity[violation.severity] =
        (violationsBySeverity[violation.severity] || 0) + 1;
      violationsByCategory[violation.category] =
        (violationsByCategory[violation.category] || 0) + 1;

      if (violation.can_autofix) {
        autofixableViolations++;
      }
    }

    return {
      total_rules_checked: totalRulesChecked,
      violations_found: violations.length,
      violations_by_severity: violationsBySeverity,
      violations_by_category: violationsByCategory,
      autofixable_violations: autofixableViolations,
    };
  }

  /**
   * Get compliance score (percentage of passed rules)
   */
  getComplianceScore(report: BestPracticeReport): number {
    if (report.summary.total_rules_checked === 0) return 100;

    const passed = report.summary.total_rules_checked - report.summary.violations_found;
    return Math.round((passed / report.summary.total_rules_checked) * 100);
  }

  /**
   * Get security score (based on security violations)
   */
  getSecurityScore(report: BestPracticeReport): number {
    const securityViolations = report.violations.filter((v) => v.category === 'security');
    const totalSecurityRules = this.getRulesByCategory('security').length;

    if (totalSecurityRules === 0) return 100;

    const passed = totalSecurityRules - securityViolations.length;
    return Math.round((passed / totalSecurityRules) * 100);
  }

  /**
   * Format report as markdown
   */
  formatReportAsMarkdown(report: BestPracticeReport): string {
    let markdown = '# Best Practices Report\\n\\n';

    // Summary
    markdown += '## Summary\\n\\n';
    markdown += `- **Total Rules Checked**: ${report.summary.total_rules_checked}\\n`;
    markdown += `- **Violations Found**: ${report.summary.violations_found}\\n`;
    markdown += `- **Compliance Score**: ${this.getComplianceScore(report)}%\\n`;
    markdown += `- **Security Score**: ${this.getSecurityScore(report)}%\\n`;
    markdown += `- **Autofixable Violations**: ${report.summary.autofixable_violations}\\n\\n`;

    // Violations by Severity
    markdown += '### Violations by Severity\\n\\n';
    Object.entries(report.summary.violations_by_severity).forEach(([severity, count]) => {
      if (count > 0) {
        markdown += `- **${severity}**: ${count}\\n`;
      }
    });
    markdown += '\\n';

    // Violations by Category
    markdown += '### Violations by Category\\n\\n';
    Object.entries(report.summary.violations_by_category).forEach(([category, count]) => {
      if (count > 0) {
        markdown += `- **${category}**: ${count}\\n`;
      }
    });
    markdown += '\\n';

    // Violations Detail
    if (report.violations.length > 0) {
      markdown += '## Violations\\n\\n';

      // Group by severity
      const groupedBySeverity = report.violations.reduce((acc, v) => {
        if (!acc[v.severity]) acc[v.severity] = [];
        acc[v.severity].push(v);
        return acc;
      }, {} as Record<string, BestPracticeViolation[]>);

      const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];

      for (const severity of severityOrder) {
        const violations = groupedBySeverity[severity];
        if (!violations || violations.length === 0) continue;

        markdown += `### ${severity.toUpperCase()} Severity\\n\\n`;

        for (const violation of violations) {
          markdown += `#### ${violation.title}\\n\\n`;
          markdown += `- **Rule ID**: ${violation.rule_id}\\n`;
          markdown += `- **Category**: ${violation.category}\\n`;
          markdown += `- **Component**: ${violation.component}\\n`;
          markdown += `- **Description**: ${violation.description}\\n`;
          markdown += `- **Recommendation**: ${violation.recommendation}\\n`;
          markdown += `- **Can Autofix**: ${violation.can_autofix ? 'Yes' : 'No'}\\n\\n`;
        }
      }
    }

    return markdown;
  }
}
