import { ENV } from "src/constants";
import type { ServiceConfiguration } from "src/types/configuration";

import type { TraktList, TraktListItem, TraktPagination } from "./trakt.types";

interface RateLimitInfo {
  name:
    | "AUTHED_API_GET_LIMIT"
    | "AUTHED_API_POST_LIMIT"
    | "UNAUTHED_API_GET_LIMIT";
  period: number;
  limit: number;
  remaining: number;
  ongoing: number;
  until: Date;
}

export class TraktApi {
  private readonly clientId = ENV("TRAKT_CLIENT_ID");
  private readonly apiUrl = ENV("TRAKT_API_URL", "https://api.trakt.tv");
  private rateLimits: Partial<Record<RateLimitInfo["name"], RateLimitInfo>> =
    {};
  private staticLimits: Record<RateLimitInfo["name"], [number, number]> = {
    // These are from the documentation
    AUTHED_API_GET_LIMIT: [1000, 300],
    UNAUTHED_API_GET_LIMIT: [1000, 300],
    AUTHED_API_POST_LIMIT: [1, 1],
  };

  constructor() {
    if (!this.clientId) {
      throw new Error("TRAKT_CLIENT_ID is not set");
    }
  }

  private getRateLimit(limitName: RateLimitInfo["name"]) {
    if (
      this.rateLimits[limitName] &&
      this.rateLimits[limitName].until > new Date()
    ) {
      return this.rateLimits[limitName];
    }
    const period = this.staticLimits[limitName][1];
    return {
      name: limitName,
      period,
      limit: this.staticLimits[limitName][0],
      remaining: this.staticLimits[limitName][0],
      ongoing: 0,
      until: new Date(
        (Math.floor(Date.now() / (period * 1000)) + 1) * (period * 1000),
      ),
    };
  }

  private setRateLimit(limit: RateLimitInfo) {
    const limitName = limit.name;
    // Update period if is different from documentation
    if (
      limit.period !== this.staticLimits[limitName][1] ||
      limit.limit !== this.staticLimits[limitName][0]
    ) {
      this.staticLimits[limitName] = [limit.limit, limit.period];
    }

    const lastRemaining = this.getRateLimit(limitName).remaining;
    this.rateLimits[limit.name] = {
      ...limit,
      remaining: Math.min(limit.remaining, lastRemaining),
      until: new Date(limit.until),
    };
  }

  private increaseOngoing(limitName: RateLimitInfo["name"], count: number) {
    const limit = this.getRateLimit(limitName);
    this.rateLimits[limit.name] = {
      ...limit,
      ongoing: limit.ongoing + count,
    };
  }

  private calculateDelay(limitName: RateLimitInfo["name"]) {
    const limit = this.getRateLimit(limitName);
    console.log(limit);
    const now = Date.now();

    if (limit.remaining <= 0) {
      return limit.until.getTime() - now + 100;
    }

    this.increaseOngoing(limitName, 1);
    return 0;
  }

  private async request<T>(
    url: string,
    init: RequestInit,
    limitName: RateLimitInfo["name"],
  ): Promise<TraktPagination<T>> {
    const delay = this.calculateDelay(limitName);

    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const response = await fetch(url, {
      ...init,
      headers: {
        "trakt-api-version": "2",
        "trakt-api-key": this.clientId,
        "Content-Type": "application/json",
      },
    });

    if (response.headers.has("x-ratelimit")) {
      const rateLimitInfo = JSON.parse(response.headers.get("x-ratelimit")!);
      this.setRateLimit(rateLimitInfo);
    }
    this.increaseOngoing(limitName, -1);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as Promise<T[]>;
    const page = Number(response.headers.get("x-pagination-page"));
    const limit = Number(response.headers.get("x-pagination-limit"));
    const total = Number(response.headers.get("x-pagination-item-count"));

    return {
      page,
      limit,
      total,
      items: await data,
      has_next_page: total > page * limit,
    };
  }

  public async test() {
    await this.request<TraktList>(
      `${this.apiUrl}/lists/trending?limit=10`,
      {},
      "UNAUTHED_API_GET_LIMIT",
    );
    return true;
  }

  public async getTrendingLists() {
    const url = `${this.apiUrl}/lists/trending?limit=50`;
    const response = await this.request<TraktList>(
      url,
      {},
      "UNAUTHED_API_GET_LIMIT",
    );
    return response.items.map((item) => item.list);
  }

  public async getPopularLists() {
    const url = `${this.apiUrl}/lists/popular`;
    const response = await this.request<TraktList>(
      url,
      {},
      "UNAUTHED_API_GET_LIMIT",
    );
    return response.items.map((item) => item.list);
  }

  public async getList(listId: string) {
    const url = `${this.apiUrl}/lists/${listId}/items`;
    const response = await this.request<TraktListItem>(
      url,
      {},
      "UNAUTHED_API_GET_LIMIT",
    );
    return response;
  }
}

export const traktConfigurationDefinition: ServiceConfiguration = {
  name: "Trakt.tv",
  description: "Service for tracking movies and TV shows watched by users",
  variables: {
    TRAKT_API_URL: {
      description: "URL for the Trakt API",
      example: "https://api.trakt.tv",
      defaultValue: "https://api.trakt.tv",
      required: false,
    },
    TRAKT_CLIENT_ID: {
      description: "Client ID for the Trakt API",
      example: "abc123def456ghi789",
      link: "https://trakt.tv/oauth/applications",
      required: true,
      password: true,
    },
  },
  test: async () => {
    try {
      const traktApi = new TraktApi();

      await traktApi.test();
    } catch (error: unknown) {
      if (typeof error === "object" && error !== null && "status" in error) {
        const err = error as { status: number };
        if (err.status === 401) {
          throw new Error(`Invalid Client ID`);
        }
        throw new Error(`Connection error: ${err.status}`);
      }
      throw error;
    }
  },
};
