/**
 * @file Defines requests and responses for rulesets.
 */

import type {CleanupRule, CleanupRuleset} from '../data/cleanup-rule.js';
import type {RequestBase, SuccessResponseBase} from './base.js';

export const RULESET_ROUTE = '/ruleset' as const;
export type RULESET_ROUTE = typeof RULESET_ROUTE;

export interface RulesetSaveRequest extends RequestBase<RULESET_ROUTE, 'post'> {
  cleanupRules: CleanupRuleset;
}

export interface RulesetSaveResponse extends SuccessResponseBase {
  result: {
    success: true;
  };
}

export interface CleanupRulesetPatch {
  [itemId: number]: CleanupRule | null;
}

export interface ReadonlyCleanupRulesetPatch {
  readonly [itemId: number]: Readonly<CleanupRule> | null;
}

/**
 * Request that updates the current ruleset, adding/updating/deleting rules.
 * This request _should_ be idempotent.
 */
export interface RulesetPatchRequest
  extends RequestBase<RULESET_ROUTE, 'patch'> {
  /**
   * Object that maps of item ID (number) to a cleanup rule or `null`.
   * If the value is `null`, any previous rule is deleted.
   * Otherwise, the value is used to create a new rule or overwrite an existing
   * rule.
   */
  cleanupRulesPatch: CleanupRulesetPatch;
}

export interface RulesetPatchResponse extends SuccessResponseBase {
  result: {
    success: true;
  };
}

declare module './base' {
  interface Routes {
    [RULESET_ROUTE]:
      | RoutesEntry<RulesetSaveRequest, RulesetSaveResponse>
      | RoutesEntry<RulesetPatchRequest, RulesetPatchResponse>;
  }
}
