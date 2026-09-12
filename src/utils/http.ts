/// <reference path="../types.d.ts" />

export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

export async function get(url: string, options?: RequestOptions): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': '*/*',
    ...(options?.headers || {})
  };

  try {
    const res = await http_get(url, headers);
    return res;
  } catch (err: any) {
    console.error(`HTTP GET error for ${url}:`, err);
    throw err;
  }
}

export async function post(url: string, body: string | Record<string, any>, options?: RequestOptions): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const isJson = typeof body === 'object';
  const postBody = isJson ? JSON.stringify(body) : body;
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': '*/*',
    ...(isJson ? { 'Content-Type': 'application/json' } : {}),
    ...(options?.headers || {})
  };

  try {
    const res = await http_post(url, headers, postBody);
    return res;
  } catch (err: any) {
    console.error(`HTTP POST error for ${url}:`, err);
    throw err;
  }
}

export function parseJsonSafe<T = any>(str: string): T | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
