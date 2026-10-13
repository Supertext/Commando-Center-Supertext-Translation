import { describe, expect, it } from 'vitest';
import examples from '../../spec/report-examples.json';
import { parseReport } from '../../src/lib/report';

describe('parseReport (spec/report-examples.json)', () => {
  for (const ex of examples.valid) {
    it(`accepts: ${ex.name}`, () => {
      const r = parseReport(ex.body);
      expect(r.ok).toBe(true);
    });
  }
  for (const ex of examples.invalid) {
    it(`rejects: ${ex.name}`, () => {
      const r = parseReport(ex.body);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/\S/);
    });
  }

  it('maps the fields and normalizes the URL', () => {
    const r = parseReport(examples.valid[0].body);
    expect(r).toEqual({
      ok: true,
      report: {
        event: 'settings_saved',
        siteUrl: 'https://www.example.ch',
        local: false,
        plugin: 'Typo3-Supertext-Translation',
        pluginVersion: '0.4.0',
        system: 'TYPO3',
        systemVersion: '13.4.2',
        runtime: 'PHP',
        runtimeVersion: '8.3.12',
        sdkVersion: '0.3.0',
        apiKeyConfigured: true,
      },
    });
  });

  it('leaves optional fields null when missing or of the wrong type', () => {
    const r = parseReport({ ...examples.valid[2].body, runtime: 'PHP', api_key_configured: 'yes' });
    expect(r.ok && r.report).toMatchObject({ runtime: null, runtimeVersion: null, sdkVersion: null, apiKeyConfigured: null, systemVersion: null });
  });
});
