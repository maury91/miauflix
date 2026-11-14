/**
 * Stands in for FFmpeg in the remux tests: reads the input, opens each sidecar upload at the start
 * and streams it until the end (as FFmpeg does), and uploads two segments with their playlists
 * with PUT, as FFmpeg's HLS muxer does. FAKE_FFMPEG_EXIT sets the exit code; FAKE_FFMPEG_HANG
 * keeps it running; FAKE_FFMPEG_RELEASE holds the sidecars open until that file exists.
 */
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const input = args[args.indexOf('-i') + 1];
const playlist = args.find(arg => arg.endsWith('/index.m3u8'))!;
const base = playlist.slice(0, playlist.lastIndexOf('/'));
const put = (url: string, body: string) => fetch(url, { method: 'PUT', body });

const source = await (await fetch(input)).text();
const sidecars: Array<{ close: () => void; done: Promise<Response> }> = [];
for (let index = 0; index < args.length; index++) {
  if (args[index] !== '-method' || args[index + 2] === playlist) continue;
  const url = args[index + 2];
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: c => void (controller = c) });
  controller.enqueue(new TextEncoder().encode('WEBVTT\n\n'));
  const done = fetch(url, { method: 'PUT', body, duplex: 'half' } as RequestInit);
  sidecars.push({
    close: () => {
      controller.enqueue(new TextEncoder().encode(url));
      controller.close();
    },
    done,
  });
}
if (process.env.FAKE_FFMPEG_HANG) {
  await put(`${base}/seg00000.ts`, 'segment');
  await new Promise(() => undefined);
}
const lines = ['#EXTM3U'];
for (const index of [0, 1]) {
  const name = `seg0000${index}.ts`;
  // FFmpeg uploads the playlist listing a segment before the segment itself.
  lines.push('#EXTINF:6.000000,', name);
  await put(playlist, lines.join('\n'));
  await put(`${base}/${name}`, index ? `segment ${index}` : `segment 0:${source}`);
}
await put(playlist, [...lines, '#EXT-X-ENDLIST'].join('\n'));
const release = process.env.FAKE_FFMPEG_RELEASE;
while (release && !existsSync(release)) await Bun.sleep(10);
for (const sidecar of sidecars) sidecar.close();
await Promise.all(sidecars.map(sidecar => sidecar.done));
process.exit(Number(process.env.FAKE_FFMPEG_EXIT ?? 0));
