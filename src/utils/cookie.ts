import { ProxyManager } from './proxy';
import * as fs from 'fs';

interface Cookie {
  accessToken: string;
  expiration: number;
  created: number;
}

interface CookieStore {
  [domain: string]: Cookie[];
}

const COOKIE_FILE = 'cookies.json';
const MAX_COOKIES = 20;
const MIN_COOKIES = 3;
const COOKIE_LIFETIME = 10 * 60 * 1000; // 10 minutes
const FETCH_DELAY = 500;

let globalCookies: CookieStore = {};
let isBackgroundFetching = false;

const loadStoredCookies = (): CookieStore => {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      console.log(`[VINTED COOKIE] Found local ${COOKIE_FILE}`);
      const data = fs.readFileSync(COOKIE_FILE, 'utf-8');
      const cookies = JSON.parse(data) as CookieStore;
      
      // Log the number of cookies found for each domain
      Object.entries(cookies).forEach(([domain, domainCookies]) => {
        console.log(`[VINTED COOKIE] Found ${(domainCookies as Cookie[]).length} stored cookies for ${domain}`);
      });
      
      return cookies;
    } else {
      console.log(`[VINTED COOKIE] No ${COOKIE_FILE} found in local directory`);
    }
  } catch (error) {
    console.error(`[VINTED COOKIE] Error reading ${COOKIE_FILE}:`, error);
    try {
      console.log(`[VINTED COOKIE] Attempting to delete corrupted ${COOKIE_FILE}`);
      fs.unlinkSync(COOKIE_FILE);
    } catch (e) {
      console.error(`[VINTED COOKIE] Error deleting corrupted ${COOKIE_FILE}:`, e);
    }
  }
  return {};
};

const saveCookies = (cookies: CookieStore): void => {
  try {
    globalCookies = cookies;
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
    console.log(`[VINTED COOKIE] Successfully saved cookies to ${COOKIE_FILE}`);
    
    // Log summary of saved cookies
    Object.entries(cookies).forEach(([domain, domainCookies]) => {
      console.log(`[VINTED COOKIE] Saved ${domainCookies.length} cookies for ${domain}`);
    });
  } catch (error) {
    console.error(`[VINTED COOKIE] Error saving cookies to ${COOKIE_FILE}:`, error);
  }
};

const fetchSingleCookie = async (domain: string): Promise<Cookie | null> => {
  try {
    console.log(`[VINTED COOKIE] Attempting to fetch single cookie for domain: ${domain}`);
    const response = await ProxyManager.makeRequest(`https://www.vinted.${domain}`, {
      method: 'GET'
    });

    const cookies = response.headers['set-cookie'];
    if (!cookies) {
      console.log('[VINTED COOKIE] No cookies found in response headers');
      throw new Error('No cookies found');
    }

    const accessTokenCookie = cookies.find((c: string) => c.includes('access_token_web'));
    if (!accessTokenCookie) {
      console.log('[VINTED COOKIE] Access token cookie not found in response');
      throw new Error('Access token cookie not found');
    }

    const match = accessTokenCookie.match(/access_token_web=([^;]+)/);
    if (!match) {
      console.log('[VINTED COOKIE] Could not extract access token from cookie');
      throw new Error('Could not extract access token');
    }

    console.log('[VINTED COOKIE] Successfully fetched new cookie');
    return {
      accessToken: match[1],
      expiration: Date.now() + COOKIE_LIFETIME,
      created: Date.now()
    };
  } catch (error) {
    console.error('[VINTED COOKIE] Failed to fetch cookie:', error);
    return null;
  }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchConcurrentCookies = async (domain: string, count: number): Promise<void> => {
  if (isBackgroundFetching) {
    console.log('[VINTED COOKIE] Background fetch already in progress, skipping...');
    return;
  }
  isBackgroundFetching = true;

  console.log(`[VINTED COOKIE] Starting concurrent fetch for ${count} cookies on domain ${domain}`);
  console.log(`[VINTED COOKIE] Current cookie count: ${globalCookies[domain]?.length || 0}/${MAX_COOKIES}`);
  let successCount = 0;
  let failureCount = 0;

  try {
    for (let i = 0; i < count; i++) {
      try {
        const delayTime = FETCH_DELAY + Math.random() * 1000;
        console.log(`[VINTED COOKIE] Waiting ${delayTime.toFixed(0)}ms before fetching cookie ${i + 1}/${count}`);
        await delay(delayTime);
        
        const cookie = await fetchSingleCookie(domain);
        
        if (cookie) {
          if (!globalCookies[domain]) globalCookies[domain] = [];
          
          if (!globalCookies[domain].some(c => c.accessToken === cookie.accessToken)) {
            globalCookies[domain].push(cookie);
            successCount++;
            
            globalCookies[domain].sort((a, b) => b.created - a.created);
            
            if (globalCookies[domain].length > MAX_COOKIES) {
              const removed = globalCookies[domain].length - MAX_COOKIES;
              globalCookies[domain] = globalCookies[domain].slice(0, MAX_COOKIES);
              console.log(`[VINTED COOKIE] Removed ${removed} old cookies to maintain max limit`);
            }
            
            console.log(`[VINTED COOKIE] Successfully added new cookie (${successCount}/${count})`);
            
            if (successCount % 5 === 0) {
              saveCookies(globalCookies);
              console.log(`[VINTED COOKIE] Progress update: ${successCount} successful, ${failureCount} failed`);
            }
          } else {
            console.log('[VINTED COOKIE] Duplicate cookie found, skipping');
          }
        } else {
          failureCount++;
          console.log(`[VINTED COOKIE] Failed to fetch cookie ${i + 1}/${count}`);
        }
      } catch (error) {
        failureCount++;
        console.error('[VINTED COOKIE] Error in fetch iteration:', error);
        continue;
      }
    }
    
    saveCookies(globalCookies);
    console.log(`[VINTED COOKIE] Fetch complete. Results:`);
    console.log(`- Successful fetches: ${successCount}`);
    console.log(`- Failed fetches: ${failureCount}`);
    console.log(`- Total valid cookies: ${globalCookies[domain]?.length || 0}`);
    console.log(`- Cookie expiration times:`);
    globalCookies[domain]?.forEach((cookie, index) => {
      const timeLeft = Math.round((cookie.expiration - Date.now()) / 1000);
      // console.log(`  ${index + 1}. Expires in ${timeLeft}s`);
    });
  } finally {
    isBackgroundFetching = false;
  }
};

export const fetchCookie = async (domain: string = 'co.uk', force: boolean = false): Promise<Cookie[]> => {
  console.log(`[VINTED COOKIE] Fetching cookies for ${domain} (force: ${force})`);
  
  // Always try to load from file first
  if (Object.keys(globalCookies).length === 0) {
    console.log('[VINTED COOKIE] Loading cookies from storage');
    globalCookies = loadStoredCookies();
  }

  if (!globalCookies[domain]) {
    console.log('[VINTED COOKIE] No cookies found for domain, initializing empty array');
    globalCookies[domain] = [];
  }

  // Clean expired cookies
  const now = Date.now();
  const beforeCount = globalCookies[domain].length;
  globalCookies[domain] = globalCookies[domain].filter(cookie => {
    const timeLeft = cookie.expiration - now;
    const isValid = cookie && timeLeft > 0;
    if (!isValid) {
      console.log(`[VINTED COOKIE] Cookie expired (was valid for ${Math.round((now - cookie.created) / 1000)}s)`);
    }
    return isValid;
  });
  
  const expiredCount = beforeCount - globalCookies[domain].length;
  if (expiredCount > 0) {
    console.log(`[VINTED COOKIE] Removed ${expiredCount} expired cookies`);
    // Save the cleaned cookie list
    saveCookies(globalCookies);
  }

  // Check if we have enough valid cookies
  const validCookies = globalCookies[domain].length;
  console.log(`[VINTED COOKIE] ${validCookies} valid cookies available`);

  // Only fetch new cookies if we're below MIN_COOKIES or forced
  if (force || validCookies < MIN_COOKIES) {
    const cookiesNeeded = MAX_COOKIES - validCookies;
    if (cookiesNeeded > 0) {
      console.log(`[VINTED COOKIE] Need to fetch ${cookiesNeeded} new cookies (minimum required: ${MIN_COOKIES})`);
      await fetchConcurrentCookies(domain, cookiesNeeded);
    }
  } else {
    console.log(`[VINTED COOKIE] Using existing cookies (${validCookies}/${MAX_COOKIES} available)`);
    console.log('[VINTED COOKIE] Cookie expiration times:');
    globalCookies[domain].forEach((cookie, index) => {
      const timeLeft = Math.round((cookie.expiration - now) / 1000);
      // console.log(`  ${index + 1}. Expires in ${timeLeft}s`);
    });
  }

  return globalCookies[domain];
};

export const invalidateCookie = async (domain: string, tokenToRemove: string): Promise<Cookie[]> => {
  console.log(`[VINTED COOKIE] Invalidating cookie for domain ${domain}`);
  
  if (!globalCookies[domain]) {
    console.log('[VINTED COOKIE] No cookies found for domain, initializing empty array');
    globalCookies[domain] = [];
  }

  const beforeCount = globalCookies[domain].length;
  globalCookies[domain] = globalCookies[domain].filter(cookie => 
    cookie && cookie.accessToken && cookie.accessToken !== tokenToRemove
  );
  const removedCount = beforeCount - globalCookies[domain].length;
  
  console.log(`[VINTED COOKIE] Removed ${removedCount} invalid cookies`);
  console.log(`[VINTED COOKIE] ${globalCookies[domain].length} cookies remaining`);

  saveCookies(globalCookies);
  return globalCookies[domain];
};

export const getRandomCookie = (cookieList: Cookie[]): Cookie | null => {
  if (!cookieList || cookieList.length === 0) return null;
  return cookieList[Math.floor(Math.random() * cookieList.length)];
};