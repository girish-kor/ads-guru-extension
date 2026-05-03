/**
 * tests/rule-validation.test.js
 * Validates that RuleEngine produces DNR-compliant rule objects.
 */
import { describe, it, assert, assertEquals } from './test-runner.js';
import { RuleEngine }    from '../background/rule-engine.js';
import { FilterParser }  from '../filters/filter-parser.js';

const VALID_RESOURCE_TYPES = new Set([
  'main_frame','sub_frame','stylesheet','script','image','font',
  'object','xmlhttprequest','ping','csp_report','media',
  'websocket','webtransport','webbundle','other',
]);

describe('RuleEngine — DNR Compliance', () => {
  const parser  = new FilterParser();
  const engine  = new RuleEngine(1000, 30000);
  const raw = `
||doubleclick.net^
||googlesyndication.com^$script,image
@@||safe.example.com^
||taboola.com^$third-party,script
`.trim();
  const parsed  = parser.parse(raw);
  const dnrRules = engine.compileToDNR(parsed);

  it('generates DNR rules from parsed filter rules', () => {
    assert(dnrRules.length > 0, 'should produce at least one rule');
  });

  it('all rules have numeric ids starting at 1000', () => {
    for (const r of dnrRules) {
      assert(typeof r.id === 'number' && r.id >= 1000, 'id must be >= 1000');
    }
  });

  it('all rules have valid action types', () => {
    const validTypes = new Set(['block','allow','redirect','modifyHeaders']);
    for (const r of dnrRules) {
      assert(validTypes.has(r.action.type), 'invalid action: ' + r.action.type);
    }
  });

  it('exception (allow) rules have priority 1', () => {
    const allowRules = dnrRules.filter((r) => r.action.type === 'allow');
    for (const r of allowRules) {
      assertEquals(r.priority, 1);
    }
  });

  it('block rules have priority 10', () => {
    const blockRules = dnrRules.filter((r) => r.action.type === 'block');
    for (const r of blockRules) {
      assertEquals(r.priority, 10);
    }
  });

  it('resource types are all valid DNR types', () => {
    for (const r of dnrRules) {
      const rts = r.condition.resourceTypes || [];
      for (const rt of rts) {
        assert(VALID_RESOURCE_TYPES.has(rt), 'invalid resource type: ' + rt);
      }
    }
  });

  it('urlFilters do not exceed 2048 chars', () => {
    for (const r of dnrRules) {
      const len = (r.condition.urlFilter || '').length;
      assert(len <= 2048, 'urlFilter too long: ' + len);
    }
  });

  it('respects MAX_DYNAMIC_RULES cap', () => {
    const bigParser  = new FilterParser();
    const bigEngine  = new RuleEngine(1000, 100); // cap at 100
    let bigRaw = '';
    for (let i = 0; i < 200; i++) bigRaw += '||adserver' + i + '.com^\n';
    const bigParsed = bigParser.parse(bigRaw);
    const bigDNR    = bigEngine.compileToDNR(bigParsed);
    assert(bigDNR.length <= 100, 'should not exceed rule cap');
  });
});
