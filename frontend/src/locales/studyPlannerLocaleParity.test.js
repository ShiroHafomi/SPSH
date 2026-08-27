import en from './en.js';
import vi from './vi.js';

function flatten(obj, prefix = '') {
  return Object.keys(obj).reduce((acc, key) => {
    const pre = prefix.length ? `${prefix}.` : '';
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      return [...acc, ...flatten(obj[key], pre + key)];
    }
    return [...acc, pre + key];
  }, []);
}

describe('StudyPlanner locale parity', () => {
  it('should have matching keys in en and vi for studyPlanner namespace', () => {
    const enStudyPlanner = en.studyPlanner;
    const viStudyPlanner = vi.studyPlanner;

    const enKeys = flatten(enStudyPlanner).sort();
    const viKeys = flatten(viStudyPlanner).sort();

    expect(enKeys).toEqual(viKeys);
  });

  it('should have matching nav.studyPlanner key', () => {
    expect(en.nav.studyPlanner).toBeDefined();
    expect(vi.nav.studyPlanner).toBeDefined();
    // We don't compare the values because they are translated strings
    expect(typeof en.nav.studyPlanner).toBe('string');
    expect(typeof vi.nav.studyPlanner).toBe('string');
  });
});