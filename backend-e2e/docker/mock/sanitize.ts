// Identity sanitization function - does no sanitization
// This will be replaced in service-specific Docker containers
export function sanitize(data: any, url?: string): any {
  return data;
}
