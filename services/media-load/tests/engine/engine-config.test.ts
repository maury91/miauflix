import { MediaLoadConfigService } from '../../src/config/config.service';
import { parseEngineSettings } from '../../src/engine/engine-config';

const KEY = Buffer.alloc(32, 7).toString('base64');
const defaults = () => new MediaLoadConfigService().defaults();

describe('STORAGE_PAD_FILE_SIZES', () => {
  it('is on by default', () => {
    expect(parseEngineSettings(defaults(), KEY).STORAGE_PAD_FILE_SIZES).toBe(true);
  });

  it('stays on when the value is missing or empty', () => {
    const rest: Record<string, string> = { ...defaults() };
    delete rest.STORAGE_PAD_FILE_SIZES;
    expect(parseEngineSettings(rest, KEY).STORAGE_PAD_FILE_SIZES).toBe(true);
    expect(
      parseEngineSettings({ ...defaults(), STORAGE_PAD_FILE_SIZES: '' }, KEY).STORAGE_PAD_FILE_SIZES
    ).toBe(true);
  });

  it('can be turned off', () => {
    expect(
      parseEngineSettings({ ...defaults(), STORAGE_PAD_FILE_SIZES: 'false' }, KEY)
        .STORAGE_PAD_FILE_SIZES
    ).toBe(false);
  });
});

describe('other flags', () => {
  it('still default to off', () => {
    const rest: Record<string, string> = { ...defaults() };
    delete rest.DISABLE_DISCOVERY;
    expect(parseEngineSettings(rest, KEY).DISABLE_DISCOVERY).toBe(false);
  });
});
