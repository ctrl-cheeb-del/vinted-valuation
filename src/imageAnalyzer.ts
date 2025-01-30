import { fetchCookie, getRandomCookie, invalidateCookie } from './utils/cookie';
import { ProxyManager } from './utils/proxy';
import * as fs from 'fs';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import axios from 'axios';

dotenv.config();

interface MessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

interface Tool {
  googleSearchRetrieval: Record<string, never>;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  tools?: Tool[];
  content: MessageContent[];
}

interface ApiRequest {
  model: string;
  messages: Message[];
}

interface Choice {
  message: {
    content: string;
  };
}

interface ApiResponse {
  choices: Choice[];
}

interface CatalogItem {
  id: number;
  title: string;
  price: {
    amount: string;
    currency_code: string;
  };
  url: string;
  photo: {
    full_size_url: string;
  };
  // Add other fields as needed
}

interface CatalogResponse {
  items: CatalogItem[];
}

const SYSTEM_PROMPT = 'Identifying the item in the photographs make, model, size, colour and condition. Find matches of this item on ebay and depop in the UK by reputable sellers. Identify the condition on how the item is presented in the uploaded photograpph, include condition notes when searching. Identify size by seeing if the size tag is visible and looking for a size indicator (e.g. S , M , L) but MAKE SURE to be harsher on Kids sizes and the lower prices. Use all of this information to find an accurate price estimate taking condiseration all of the above based on accurate sale data in GBP. Estimate prices which capture the maximum value. Make sure to give me a final resale value in GBP.'

// Define the structured data schema using Zod
const structuredDataSchema = z.object({
  brand: z.string().describe('Brand name of the item'),
  model: z.string().describe('Model or style name of the item'),
  size: z.string().describe('Size of the item'),
  color: z.string().describe('Color of the item'),
  condition: z.string().describe('Condition of the item (e.g. new, used, like new)'),
  estimatedValue: z.string().describe('Estimated resale value in GBP'),
  conditionNotes: z.string().describe('Additional notes about the item condition'),
  comparablePrices: z.array(z.string()).describe('List of comparable prices found'),
});

export type StructuredData = z.infer<typeof structuredDataSchema>;

// Convert Zod schema to Anthropic's expected format
const jsonSchema = zodToJsonSchema(structuredDataSchema);
const anthropicSchema = {
  type: 'object',
  properties: (jsonSchema as any).properties,
  required: Object.keys((jsonSchema as any).properties),
} as const;

const extractItemId = (url: string): string => {
  const match = url.match(/items\/(\d+)/);
  return match ? match[1] : '';
};

const fetchItemDetails = async (itemId: string, domain: string, accessToken: string) => {
  try {
    const response = await ProxyManager.makeRequest(
      `https://www.vinted.${domain}/api/v2/items/${itemId}`,
      {
        headers: {
          'Accept': 'application/json',
          'Cookie': `access_token_web=${accessToken}`
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error fetching item details:', error);
    throw error;
  }
};

export const fetchVintedCatalog = async (domain: string, searchText: string, page: number = 1, limit: number = 50): Promise<CatalogResponse> => {
  const cookies = await fetchCookie(domain);
  let attempts = 0;
  const maxAttempts = 3;
  let lastError: any;

  while (attempts < maxAttempts) {
    const cookie = getRandomCookie(cookies);
    
    if (!cookie) {
      throw new Error('No valid cookies available');
    }

    const encodedSearch = encodeURIComponent(searchText);
    const sizeIds = [2, 3, 4, 5, 6, 206, 207, 208, 209, 210];
    const sizeParams = sizeIds.map(id => `size_ids[]=${id}`).join('&');
    
    const url = `https://www.vinted.${domain}/api/v2/catalog/items?page=${page}&per_page=${limit}&search_text=${encodedSearch}&order=newest_first&${sizeParams}`;

    try {
      console.log(`[VINTED CATALOG] Attempt ${attempts + 1}/${maxAttempts} - Making request to:`, url);
      const response = await ProxyManager.makeRequest(url, {
        headers: {
          'Accept': 'application/json',
          'Cookie': `access_token_web=${cookie.accessToken}`
        }
      });

      if (!response.data) {
        console.error('[VINTED CATALOG] No data in response');
        throw new Error('No data in response');
      }

      // Check for invalid token response
      if (response.data.code === 100 && response.data.message_code === 'invalid_authentication_token') {
        console.log('[VINTED CATALOG] Invalid token detected, invalidating cookie and retrying...');
        await invalidateCookie(domain, cookie.accessToken);
        attempts++;
        continue;
      }

      if (!response.data.items) {
        console.error('[VINTED CATALOG] Response data:', JSON.stringify(response.data, null, 2));
        throw new Error('No items array in response data');
      }

      return response.data;
    } catch (error: any) {
      console.error(`[VINTED CATALOG] Error on attempt ${attempts + 1}:`, error);
      lastError = error;
      
      // If it's an invalid token error, invalidate the cookie and try again
      if (error?.response?.data?.code === 100 && error?.response?.data?.message_code === 'invalid_authentication_token') {
        console.log('[VINTED CATALOG] Invalid token detected, invalidating cookie and retrying...');
        await invalidateCookie(domain, cookie.accessToken);
        attempts++;
        continue;
      }

      // For other errors, just retry with a different cookie
      attempts++;
    }
  }

  // If we've exhausted all attempts, throw the last error
  console.error('[VINTED CATALOG] All retry attempts failed');
  throw lastError;
};

export async function analyzeVintedItem(vintedUrl: string): Promise<any> {
  try {
    const cleanUrl = vintedUrl.replace('https://andy-redirect-thing.alistair.cloud/', '');
    const domain = cleanUrl.includes('.co.uk') ? 'co.uk' : 'com';
    const itemId = extractItemId(cleanUrl);

    const cookies = await fetchCookie(domain);
    const cookie = getRandomCookie(cookies);
    if (!cookie) {
      throw new Error('No valid cookies available');
    }

    const itemDetails = await fetchItemDetails(itemId, domain, cookie.accessToken);
    
    const imageUrls = itemDetails.item?.photos
      ?.slice(0, 8)
      .map((photo: { full_size_url: string }) => photo.full_size_url) ?? [];

    const prompt = `Analyze this ${itemDetails.item?.brand || ''} item:
    Title: ${itemDetails.item?.title || ''}
    Size: ${itemDetails.item?.size || ''}
    Description: ${itemDetails.item?.description || ''}`;

    const aiResponse = await analyzeImages(imageUrls, prompt);
    return await extractStructuredData(aiResponse);
  } catch (error) {
    console.error('Error analyzing Vinted item:', error);
    throw error;
  }
}

export async function analyzeImages(images: string[], prompt: string): Promise<string> {
  const API_KEY = process.env.API_KEY;
  const API_URL = 'https://api.model.box/v1/chat/completions';

  const content: MessageContent[] = [
    {
      type: 'text',
      text: prompt
    },
    ...images.map(imageUrl => ({
      type: 'image_url' as const,
      image_url: { url: imageUrl }
    }))
  ];

  const requestData: ApiRequest = {
    model: 'openai/chatgpt-4o-latest',
    messages: [{
      role: 'system',
      content: [{
        type: 'text',
        text: SYSTEM_PROMPT
      }]
    },{
      role: 'user',
      tools: [{ googleSearchRetrieval: {} }],
      content
    }]
  };

  try {
    // Use direct axios request without proxy for model.box
    const response = await axios.post(API_URL, requestData, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      }
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error making API request:', error);
    throw error;
  }
}

export async function extractStructuredData(aiResponse: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  // Use direct Anthropic SDK without proxy
  const anthropic = new Anthropic({
    apiKey,
    httpAgent: undefined // Ensure no proxy is used
  });

  const systemPrompt = `You are a JSON extraction expert. Your task is to analyze the following text about a clothing item valuation and extract key information into a structured JSON format and submit that to the output tool.
  ONLY call the tool with the correct JSON format. Do not send any additional text or explanation.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      tools: [
        { 
          name: 'structuredOutputTool',
          description: 'Extract structured data from the text',
          input_schema: anthropicSchema,
        },
      ],
      messages: [
        { role: 'user', content: `${systemPrompt}\n\nHere's the text to analyze:\n${aiResponse}` }
      ],
      temperature: 0,
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : null;
    if (content) {
      console.log('Content:', content);
    }
    const toolCall = response.content[0].type === 'tool_use' ? response.content[0].input : null;
    if (!toolCall) {
      throw new Error('No tool call received from Claude');
    }
    console.log('Tool call:', toolCall);
    return JSON.stringify(toolCall);
  } catch (error) {
    console.error('Error extracting structured data:', error);
    throw error;
  }
}