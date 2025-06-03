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

export class WebPlayer extends Player {
  private containerRef = createRef<HTMLVideoElement>();
  private audioTracks: Track[] = [];
  private subtitleTracks: Track[] = [];
  private ready = false;
  private player!: ReturnType<typeof videojs>;
  public container = (
    <VideoContainer ref={this.containerRef} preload="auto" crossOrigin="anonymous" />
  );

  async init(url: string): Promise<boolean> {
    if (!this.containerRef.current) {
      return false;
    }

    this.containerRef.current.src = url;
    // const source = document.createElement('source');
    // source.src = url;
    // source.type = 'video/mkv';
    // this.containerRef.current.appendChild(source);
    this.containerRef.current.addEventListener('loadedmetadata', () => {
      this.ready = true;
      this.emit('ready', undefined);
    });
    this.containerRef.current.addEventListener('durationchange', () => {
      this.emit('length', this.videoLength());
    });
    this.containerRef.current.addEventListener('timeupdate', () => {
      this.emit('currentTime', this.played());
    });
    this.containerRef.current.addEventListener('pause', () => {
      this.emit('status', 'PAUSED');
    });
    this.containerRef.current.addEventListener('play', () => {
      this.emit('status', 'PLAYING');
    });
    this.containerRef.current.addEventListener('ended', () => {
      this.emit('status', 'IDLE');
    });
    this.containerRef.current.addEventListener('error', error => {
      this.emit('error', error);
      console.error(error);
    });
    this.containerRef.current.load();

    // this.player = videojs(
    //   this.containerRef.current,
    //   {
    //     controls: true,
    //     autoplay: false,
    //     preload: 'auto',
    //     crossOrigin: 'anonymous',
    //     sources: [
    //       {
    //         src: url,
    //         type: 'video/webm',
    //       },
    //     ],
    //   },
    //   () => {
    //     this.ready = true;
    //   }
    // );
    console.log(this.player);
    // add source
    // this.ready = true;
    // console.log(this.containerRef.current, this.container);
    return true;
  }

  play(): boolean {
    console.log('Playing');
    if (this.containerRef.current) {
      this.containerRef.current?.play();
      return true;
    }
    return false;
  }

  pause(): boolean {
    console.log('Pausing');
    if (this.containerRef.current) {
      this.containerRef.current.pause();
      return true;
    }
    return false;
  }

  stop(): boolean {
    console.log('Stopping');
    if (this.containerRef.current) {
      this.containerRef.current.pause();
      return true;
    }
    return false;
  }

  togglePlay(): boolean {
    console.log('Toggling play');
    if (this.containerRef.current) {
      if (this.containerRef.current.paused) {
        this.play();
      } else {
        this.pause();
      }
      return true;
    }
    return false;
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
    return (this.containerRef.current?.currentTime ?? 0) * 1000;
  }

  close(): boolean {
    console.log('Closing');
    this.containerRef.current?.remove();
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
    if (this.containerRef.current) {
      this.containerRef.current.currentTime = position / 1000;
      return true;
    }
    return false;
  }

  videoLength(): number {
    return (this.containerRef.current?.duration ?? 0) * 1000;
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
    if (this.containerRef.current) {
      for (let i = 0; i < this.containerRef.current.textTracks.length; i++) {
        this.containerRef.current.textTracks[i].mode = 'hidden';
      }
      this.containerRef.current.textTracks[track.index].mode = 'showing';
      return true;
    }
    return false;
  }

  enableSubtitle(): boolean {
    console.log('Enabling subtitle');
    return true;
  }

  disableSubtitle(): boolean {
    console.log('Disabling subtitle');
    return true;
  }
}
