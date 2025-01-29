"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchItemDetails = exports.extractItemId = exports.fetchCookie = void 0;
const axios_1 = __importDefault(require("axios"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const COOKIE_LIFETIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const getHeaders = () => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-GB,en;q=0.9',
});
const extractAccessToken = (cookieString) => {
    const match = cookieString.match(/access_token_web=([^;]+)/);
    return match ? match[1] : null;
};
const extractItemId = (url) => {
    const match = url.match(/\/items\/(\d+)/);
    if (!match)
        throw new Error("Could not extract item ID from URL");
    return match[1];
};
exports.extractItemId = extractItemId;
const fetchCookie = async (domain) => {
    console.log(`Attempting to fetch cookie for domain: vinted.${domain}`);
    try {
        console.log('Making request to Vinted...');
        const response = await axios_1.default.get(`https://www.vinted.${domain}`, {
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
            expiration: Date.now() + COOKIE_LIFETIME,
            created: Date.now()
        };
    }
    catch (error) {
        console.error('Error fetching cookie:', error);
        if (axios_1.default.isAxiosError(error)) {
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
exports.fetchCookie = fetchCookie;
const fetchItemDetails = async (itemId, domain, accessToken) => {
    try {
        const response = await axios_1.default.get(`https://www.vinted.${domain}/api/v2/items/${itemId}`, {
            headers: {
                'User-Agent': getHeaders()['User-Agent'],
                'Accept': getHeaders()['Accept'],
                'Accept-Language': getHeaders()['Accept-Language'],
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': `https://www.vinted.${domain}/`,
                cookie: `access_token_web=${accessToken}`,
            },
            proxy: false
        });
        return response.data;
    }
    catch (error) {
        console.error('Error fetching item details:', error);
        throw error;
    }
};
exports.fetchItemDetails = fetchItemDetails;
