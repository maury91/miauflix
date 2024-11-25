import { AxiosInstance } from 'axios';
import { simplifyXMLObject } from '../../../apps/backend/src/app/jackett/jackett.utils';
import { xml2js } from 'xml-js';

export class JackettApi {
  constructor(
    private readonly axios: AxiosInstance,
    private readonly API_URL: string,
    private readonly API_KEY: string
  ) {}

  private async get<T>(url: string, params: Record<string, string>) {
    const { data, status, statusText, headers } = await this.axios.get<string>(
      `${this.API_URL}/api/v2.0/${url}`,
      {
        params: {
          ...params,
          apikey: this.API_KEY,
        },
      }
    );

    return {
      data: simplifyXMLObject(
        xml2js(data, {
          compact: true,
          ignoreDeclaration: true,
          nativeType: true,
        })
      ) as T,
      status,
      statusText,
      headers,
    };
  }
}
