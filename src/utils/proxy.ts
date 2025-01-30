import { SocksProxyAgent } from 'socks-proxy-agent';
import dotenv from 'dotenv';
import * as fs from 'fs';
import { randomBytes } from 'crypto';
import axios from 'axios';
import { Agent } from 'https';
import * as tls from 'tls';

dotenv.config();

interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

// TLS settings for Chrome-like fingerprint
const TLS_SETTINGS = {
  ciphers: [
    'TLS_AES_128_GCM_SHA256',
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305'
  ].join(':'),
  honorCipherOrder: true,
  minVersion: 'TLSv1.2' as tls.SecureVersion,
  maxVersion: 'TLSv1.3' as tls.SecureVersion,
  sigalgs: [
    'ecdsa_secp256r1_sha256',
    'rsa_pss_rsae_sha256',
    'rsa_pkcs1_sha256',
    'ecdsa_secp384r1_sha384',
    'rsa_pss_rsae_sha384',
    'rsa_pkcs1_sha384',
    'rsa_pss_rsae_sha512',
    'rsa_pkcs1_sha512'
  ].join(':'),
  curves: 'X25519:prime256v1:secp384r1'
};

export class ProxyManager {
  private static proxyConfig: ProxyConfig | null = null;
  private static proxySettingsPath = 'proxy-settings.json';

  static loadProxySettings(): void {
    try {
      if (fs.existsSync(this.proxySettingsPath)) {
        const settings = JSON.parse(fs.readFileSync(this.proxySettingsPath, 'utf-8'));
        this.proxyConfig = settings;
      } else {
        // Load from environment variables as fallback
        const { PROXY_HOST, PROXY_PORT, PROXY_USER, PROXY_PASS } = process.env;
        if (PROXY_HOST && PROXY_PORT) {
          this.proxyConfig = {
            host: PROXY_HOST,
            port: parseInt(PROXY_PORT),
            username: PROXY_USER,
            password: PROXY_PASS
          };
        }
      }
    } catch (error) {
      console.error('Error loading proxy settings:', error);
      this.proxyConfig = null;
    }
  }

  static getProxyAgent(): SocksProxyAgent | undefined {
    if (!this.proxyConfig) return undefined;

    const { host, port, username, password } = this.proxyConfig;
    const proxyUrl = username && password
      ? `socks5://${username}:${password}@${host}:${port}`
      : `socks5://${host}:${port}`;

    return new SocksProxyAgent(proxyUrl);
  }

  static createCustomHttpsAgent(): Agent {
    const proxyAgent = this.getProxyAgent();
    
    return new Agent({
      keepAlive: true,
      timeout: undefined,
      rejectUnauthorized: true,
      ciphers: TLS_SETTINGS.ciphers,
      honorCipherOrder: TLS_SETTINGS.honorCipherOrder,
      minVersion: TLS_SETTINGS.minVersion,
      maxVersion: TLS_SETTINGS.maxVersion,
      secureContext: tls.createSecureContext({
        ciphers: TLS_SETTINGS.ciphers,
        honorCipherOrder: TLS_SETTINGS.honorCipherOrder,
        minVersion: TLS_SETTINGS.minVersion,
        maxVersion: TLS_SETTINGS.maxVersion
      })
    });
  }

  static getBrowserHeaders(domain: string): Record<string, string> {
    const chromeVersion = '120.0.0.0';
    const cfClearance = randomBytes(32).toString('hex');
    
    return {
      'sec-ch-ua': `"Not_A Brand";v="8", "Chromium";v="${chromeVersion}", "Google Chrome";v="${chromeVersion}"`,
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'max-age=0',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': `https://www.vinted.${domain}/`,
      'Cookie': `cf_clearance=${cfClearance}`
    };
  }

  static async makeRequest(url: string, options: any = {}): Promise<any> {
    const customAgent = this.createCustomHttpsAgent();
    const domain = url.includes('vinted.co.uk') ? 'co.uk' : 'com';
    
    const config = {
      ...options,
      headers: {
        ...this.getBrowserHeaders(domain),
        ...options.headers
      },
      httpsAgent: customAgent,
      timeout: 100000,
      maxRedirects: 5,
      validateStatus: (status: number) => status < 500
    };

    try {
      const response = await axios(url, config);
      return response;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'response' in error && 
          error.response && typeof error.response === 'object' && 'status' in error.response) {
        const status = error.response.status;
        
        // If unauthorized, try to get new cookies and retry once
        if (status === 401 && options.headers?.Cookie) {
          console.log('Unauthorized, fetching new cookies...');
          const cookieMatch = options.headers.Cookie.match(/access_token_web=([^;]+)/);
          if (cookieMatch) {
            const { fetchCookie, invalidateCookie } = await import('./cookie');
            await invalidateCookie(domain, cookieMatch[1]);
            const cookies = await fetchCookie(domain, true);
            if (cookies.length > 0) {
              const newConfig = {
                ...config,
                headers: {
                  ...config.headers,
                  Cookie: `access_token_web=${cookies[0].accessToken}`
                }
              };
              return await axios(url, newConfig);
            }
          }
        }

        if (status === 403) {
          console.error('Blocked by Cloudflare:', status);
        }
      }
      throw error;
    }
  }
} 