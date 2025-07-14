import type {
  DeviceAuthResponse,
  DeviceAuthCheckResponse,
  MovieResponse,
  StreamingKeyResponse,
  UserDto as BackendUserDto,
} from '@miauflix/backend-client';
import type {
  DeviceLoginDto,
  DeviceLoginStatusDto,
  GetStreamDto,
  MediaDto,
  UserDto,
} from '../types/api';

// Transform backend user to frontend user
export function toUserDto(user: BackendUserDto): UserDto {
  return {
    id: parseInt(user.id, 10),
    // TODO: use proper user name when backend provides it
    name: user.email,
    email: user.email,
    createdAt: '', // TODO fill real dates
    updatedAt: '',
    slug: user.email, // TODO backend should provide slug
  } as UserDto;
}

export function toDeviceLoginDto(device: DeviceAuthResponse): DeviceLoginDto {
  return {
    deviceCode: device.deviceCode,
    userCode: device.userCode,
    verificationUri: device.codeUrl,
    expiresIn: device.expiresIn,
    interval: device.interval,
    // TODO expiresAt missing in backend response
  } as DeviceLoginDto;
}

export function toDeviceLoginStatusDto(status: DeviceAuthCheckResponse): DeviceLoginStatusDto {
  return {
    loggedIn: status.success,
    // TODO map user and accessToken when available
  } as DeviceLoginStatusDto;
}

export function toMediaDto(movie: MovieResponse): MediaDto {
  return {
    id: movie.id.toString(),
    title: movie.title,
    type: 'movie',
    year: parseInt(movie.releaseDate.split('-')[0] ?? '0', 10),
    poster: movie.poster,
    backdrop: movie.backdrop,
    overview: movie.overview,
    rating: movie.rating,
    genres: movie.genres,
    imdbId: movie.imdbId ?? undefined,
    tmdbId: movie.tmdbId,
    // TODO: proper ids and images support
    ids: { slug: movie.id.toString() },
    images: {
      backdrop: movie.backdrop,
      backdrops: [movie.backdrop],
      logos: [movie.logo],
    },
  } as MediaDto;
}

export function toStreamDto(stream: StreamingKeyResponse): GetStreamDto {
  return {
    streamId: stream.streamingKey,
    // TODO build real stream URL from streaming key
    streamUrl: '',
    quality: stream.quality ?? undefined,
    codec: stream.videoCodec ?? undefined,
  } as GetStreamDto;
}
