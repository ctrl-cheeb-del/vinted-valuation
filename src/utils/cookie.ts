import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();


const getHeaders = () => ({
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-GB,en;q=0.9',
});

const extractAccessToken = (cookieString: string): string | null => {
  const match = cookieString.match(/access_token_web=([^;]+)/);
  return match ? match[1] : null;
};

const extractItemId = (url: string): string => {
  const match = url.match(/\/items\/(\d+)/);
  if (!match) throw new Error("Could not extract item ID from URL");
  return match[1];
};

const fetchCookie = async (domain: string) => {
  console.log(`Attempting to fetch cookie for domain: vinted.${domain}`);
  try {
    console.log('Making request to Vinted...');
    const response = await axios.get(`https://www.vinted.${domain}`, {
      headers: {
        "user-agent": getHeaders()["User-Agent"],
      },
      timeout: 5000
    });

    console.log('Got response from Vinted');
    
    const cookies = response.headers["set-cookie"];
    if (!cookies) {
      console.error('No set-cookie header found in response');
      throw new Error("No cookies found");
    }

    console.log('Found set-cookie headers');
    
    // Find the cookie containing access_token_web
    const accessTokenCookie = cookies.find(cookie => cookie.includes('access_token_web'));
    if (!accessTokenCookie) {
      console.error('No access_token_web cookie found');
      throw new Error("Access token cookie not found");
    }

    const accessToken = extractAccessToken(accessTokenCookie);
    if (!accessToken) {
      console.error('Could not extract access token from cookie');
      throw new Error("Could not extract access token");
    }

    console.log('Successfully extracted access token');

    return {
      accessToken,
      expiration: Date.now() + 1000 * 60 * 60 * 24, 
      created: Date.now()
    };
  } catch (error) {
    console.error('Error fetching cookie:', error);
    if (axios.isAxiosError(error)) {
      console.error('Axios error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        headers: error.response?.headers,
        data: error.response?.data
      });
    }
    throw error;
  }
};

const fetchItemDetails = async (itemId: string, domain: string, accessToken: string) => {
  try {
    const response = await axios.get(
      `https://www.vinted.${domain}/api/v2/items/${itemId}`,
      {
        headers: {
          'User-Agent': getHeaders()['User-Agent'],
          'Accept': getHeaders()['Accept'],
          'Accept-Language': getHeaders()['Accept-Language'],
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': `https://www.vinted.${domain}/`,
          cookie: `access_token_web=${accessToken}`,
        },
        proxy: false
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching item details:', error);
    throw error;
  }
};

export { fetchCookie, extractItemId, fetchItemDetails };