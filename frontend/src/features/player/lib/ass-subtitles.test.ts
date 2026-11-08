import { assCues, assEvents, fetchRateLimited } from './ass-subtitles';

const track = [
  '[Script Info]',
  'ScriptType: v4.00+',
  '[V4+ Styles]',
  'Format: Name, Fontname',
  'Dialogue: not an event, a style section line',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:01:10.00,0:01:12.50,Default,,0,0,0,,{\\i1}Hello,{\\i0} there\\Nfriend',
  'Dialogue: 1,0:01:11.00,0:01:15.00,Sign,,0,0,0,,{\\p1}m 0 0 l 10 0 10 10{\\p0}',
  'Dialogue: 0,0:01:20.00,0:01:21.00,Default,,0,0,0,,{\\an8}',
].join('\r\n');

describe('ASS events', () => {
  it('reads only the dialogue lines of the events section', () => {
    const { format, lines } = assEvents(track);
    expect(format).toContain('text');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^Dialogue: 0,0:01:10\.00/);
  });

  it('turns dialogue into plain timed text, skipping drawings and empty lines', () => {
    const { format, lines } = assEvents(track);
    expect(assCues(format, lines)).toEqual([
      { start: 70, end: 72.5, text: 'Hello, there\nfriend' },
    ]);
  });
});

describe('rate-limited font requests', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits and retries on 429, then returns the final answer', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response('{"fonts":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    const pending = fetchRateLimited('/fonts', signal);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith('/fonts', expect.objectContaining({ signal }));
  });

  it('gives up after three rate-limited answers', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(async () => new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetch);
    const pending = fetchRateLimited('/fonts', new AbortController().signal);
    await vi.advanceTimersByTimeAsync(3000);
    expect((await pending).status).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
