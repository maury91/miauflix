import { Player, PlayerEvents, Track } from '../playerClassAbstract';
import { createRef } from 'react';
import styled from 'styled-components';
import videojs from 'video.js';

const VideoContainer = styled.video`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`;

export class WebPlayer implements Player {
  private containerRef = createRef<HTMLVideoElement>();
  private audioTracks: Track[] = [];
  private subtitleTracks: Track[] = [];
  private ready = false;
  private player!: ReturnType<typeof videojs>;
  public container = (
    <VideoContainer
      ref={this.containerRef}
      preload="auto"
      crossOrigin="anonymous"
    />
  );

  constructor() {
    // ToDo
    console.log('Constructed');
  }

  async init(url: string): Promise<boolean> {
    if (!this.containerRef.current) {
      return false;
    }
    this.player = videojs(
      this.containerRef.current,
      {
        controls: true,
        autoplay: false,
        preload: 'auto',
        crossOrigin: 'anonymous',
        sources: [
          {
            src: url,
            type: 'video/webm',
          },
        ],
      },
      () => {
        this.ready = true;
      }
    );
    console.log(this.player);
    // add source
    // const source = document.createElement('source');
    // source.src = url;
    // this.containerRef.current.appendChild(source);
    // this.containerRef.current.load();
    // this.ready = true;
    // console.log(this.containerRef.current, this.container);
    return true;
  }

  play(): boolean {
    console.log('Playing');
    this.containerRef.current?.play();
    return true;
  }

  pause(): boolean {
    console.log('Pausing');
    return true;
  }

  stop(): boolean {
    console.log('Stopping');
    return true;
  }

  togglePlay(): boolean {
    console.log('Toggling play');
    return true;
  }

  fastForward(ms: number): boolean {
    console.log('Fast forwarding', ms);
    return true;
  }

  rewind(ms: number): boolean {
    console.log('Rewinding', ms);
    return true;
  }

  played(): number {
    return 0;
  }

  close(): boolean {
    console.log('Closing');
    return true;
  }

  toggleSubtitle(): boolean {
    console.log('Toggling subtitle');
    return true;
  }

  setCustomSubtitle(url: string): Promise<boolean> {
    console.log('Setting custom subtitle', url);
    return Promise.resolve(true);
  }

  seekTo(position: number): boolean {
    console.log('Seeking to', position);
    return true;
  }

  videoLength(): number {
    return 100;
  }

  isReady(): boolean {
    return this.ready;
  }

  getAudioTracks(): Track[] {
    return this.audioTracks;
  }

  setAudioTrack(track: Track): boolean {
    console.log('Setting audio track', track);
    return true;
  }

  getSubtitleTracks(): Track[] {
    return this.subtitleTracks;
  }

  setSubtitleTrack(track: Track): boolean {
    console.log('Setting subtitle track', track);
    return true;
  }

  enableSubtitle(): boolean {
    console.log('Enabling subtitle');
    return true;
  }

  disableSubtitle(): boolean {
    console.log('Disabling subtitle');
    return true;
  }

  on<T extends keyof PlayerEvents>(
    event: T,
    callback: (data: PlayerEvents[T]) => void
  ): () => void {
    return () => {
      // Do nothing
    };
  }
}
