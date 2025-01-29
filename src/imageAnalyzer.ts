import { fetchCookie, extractItemId, fetchItemDetails } from './utils/cookie';
import axios from 'axios';
import * as fs from 'fs';
import dotenv from 'dotenv';
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
  role: 'user' | 'assistant';
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

async function analyzeImages(images: string[], prompt: string): Promise<string> {
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

    const response = await axios.post<ApiResponse>(API_URL, requestData, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 100000    });

    console.log('Response received successfully');
    
    // Log the full response to a file for debugging
    fs.writeFileSync('api_response.json', JSON.stringify(response.data as ApiResponse, null, 2));

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error making API request:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response data:', error.response?.data);
      console.error('Status code:', error.response?.status);
    }
    throw error;
  }
}

async function analyzeVintedItem(vintedUrl: string): Promise<string> {
  try {
    const domain = vintedUrl.includes('.co.uk') ? 'co.uk' : 'com';
    const itemId = extractItemId(vintedUrl);

    const cookie = await fetchCookie(domain);
    const itemDetails = await fetchItemDetails(itemId, domain, cookie.accessToken);
    
    const imageUrls = itemDetails.item.photos
      .slice(0, 3)
      .map((photo: { full_size_url: string }) => photo.full_size_url);

    const prompt = `Analyzing this ${itemDetails.item.brand} item:
    Title: ${itemDetails.item.title}
    Size: ${itemDetails.item.size}
    Description: ${itemDetails.item.description}

    identifying the item in the photographs make, model, size, colour and condition\nthen find matches of this item on ebay and depop in the UK by reputable sellers\nyou can identify the condition on how the item is presented in the uploaded photograpph, make sure to include condition notes when searching\nyou can identify size by seeing if the size tag is visible and looking for a size indicator (e.g. S , M , L)\nuse all of this information to find an accurate price estimate taking condiseration all of the above based on accurate sale data in GBP\nEstimate prices which capture the maximum value, and we must set prices slightly higher as we have to consider lowball offers when selling. make sure to give me a final number`;

    return await analyzeImages(imageUrls, prompt);
  } catch (error) {
    console.error('Error analyzing Vinted item:', error);
    throw error;
  }
}

export { analyzeVintedItem, analyzeImages }; 