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
exports.analyzeVintedItem = analyzeVintedItem;
exports.analyzeImages = analyzeImages;
const cookie_1 = require("./utils/cookie");
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
async function analyzeImages(images, prompt) {
    const API_KEY = process.env.API_KEY;
    const API_URL = 'https://api.model.box/v1/chat/completions';
    const content = [
        {
            type: 'text',
            text: prompt
        },
        ...images.map(imageUrl => ({
            type: 'image_url',
            image_url: { url: imageUrl }
        }))
    ];
    const requestData = {
        model: 'google/gemini-2.0-flash-thinking',
        messages: [{
                role: 'user',
                tools: [{ googleSearchRetrieval: {} }],
                content
            }]
    };
    try {
        console.log('Sending request to API...');
        console.log('Request payload:', JSON.stringify(requestData, null, 2));
        const response = await axios_1.default.post(API_URL, requestData, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 100000
        });
        console.log('Response received successfully');
        // Log the full response to a file for debugging
        fs.writeFileSync('api_response.json', JSON.stringify(response.data, null, 2));
        return response.data.choices[0].message.content;
    }
    catch (error) {
        console.error('Error making API request:', error);
        if (axios_1.default.isAxiosError(error)) {
            console.error('Response data:', error.response?.data);
            console.error('Status code:', error.response?.status);
        }
        throw error;
    }
}
async function analyzeVintedItem(vintedUrl) {
    try {
        // Extract the domain and item ID
        const domain = vintedUrl.includes('.co.uk') ? 'co.uk' : 'com';
        const itemId = (0, cookie_1.extractItemId)(vintedUrl);
        // Get cookie
        const cookie = await (0, cookie_1.fetchCookie)(domain);
        // Fetch item details
        const itemDetails = await (0, cookie_1.fetchItemDetails)(itemId, domain, cookie.accessToken);
        // Extract up to first 3 full size URLs
        const imageUrls = itemDetails.item.photos
            .slice(0, 3)
            .map((photo) => photo.full_size_url);
        // Construct prompt using item details
        const prompt = `Analyzing this ${itemDetails.item.brand} item:
    Title: ${itemDetails.item.title}
    Size: ${itemDetails.item.size}
    Description: ${itemDetails.item.description}

    identifying the item in the photographs make, model, size, colour and condition\nthen find matches of this item on ebay and depop in the UK by reputable sellers\nyou can identify the condition on how the item is presented in the uploaded photograpph, make sure to include condition notes when searching\nyou can identify size by seeing if the size tag is visible and looking for a size indicator (e.g. S , M , L)\nuse all of this information to find an accurate price estimate taking condiseration all of the above based on accurate sale data in GBP\nEstimate prices which capture the maximum value, and we must set prices slightly higher as we have to consider lowball offers when selling. make sure to give me a final number`;
        // Use existing analyzeImages function with new data
        return await analyzeImages(imageUrls, prompt);
    }
    catch (error) {
        console.error('Error analyzing Vinted item:', error);
        throw error;
    }
}
