import { fetchCookie, extractItemId, fetchItemDetails } from './utils/cookie';
import * as fs from 'fs';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

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

const SYSTEM_PROMPT = 'Identifying the item in the photographs make, model, size, colour and condition. Find matches of this item on ebay and depop in the UK by reputable sellers. Identify the condition on how the item is presented in the uploaded photograpph, include condition notes when searching. Identify size by seeing if the size tag is visible and looking for a size indicator (e.g. S , M , L). Use all of this information to find an accurate price estimate taking condiseration all of the above based on accurate sale data in GBP. Estimate prices which capture the maximum value, and we must set prices slightly higher as we have to consider lowball offers when selling. Make sure to give me a final resale value in GBP.'

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
    model: 'google/gemini-2.0-flash-exp',
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
    console.log('Sending request to API...');
    console.log('Request payload:', JSON.stringify(requestData, null, 2));

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData),
      signal: AbortSignal.timeout(1000000)
    });

    if (!response.ok) {
      // get the response text
      const responseText = await response.text();
      console.error('Response text:', responseText);
      throw new Error(`API request failed: ${response.status} ${response.statusText} ${responseText}`);
    }

    console.log('Response received successfully');
    
    const responseData = await response.json() as ApiResponse;
    // Log the full response to a file for debugging
    fs.writeFileSync('api_response.json', JSON.stringify(responseData, null, 2));

    return responseData.choices[0].message.content;
  } catch (error) {
    console.error('Error making API request:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    throw error;
  }
}

async function extractStructuredData(aiResponse: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const anthropic = new Anthropic({
    apiKey,
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

async function analyzeVintedItem(vintedUrl: string): Promise<any> {
  try {
    const domain = vintedUrl.includes('.co.uk') ? 'co.uk' : 'com';
    const itemId = extractItemId(vintedUrl);

    const cookie = await fetchCookie(domain);
    const itemDetails = await fetchItemDetails(itemId, domain, cookie.accessToken);
    
    const imageUrls = itemDetails.item?.photos
      ?.slice(0, 8)  // Increased from 3 to 8 images
      .map((photo: { full_size_url: string }) => photo.full_size_url) ?? [];

    const prompt = `Analyze this ${itemDetails.item?.brand || ''} item:
    Title: ${itemDetails.item?.title || ''}
    Size: ${itemDetails.item?.size || ''}
    Description: ${itemDetails.item?.description || ''}`;

    const aiResponse = await analyzeImages(imageUrls, prompt);
    // Extract structured JSON data from the AI response
    return await extractStructuredData(aiResponse);
  } catch (error) {
    console.error('Error analyzing Vinted item:', error);
    throw error;
  }
}

export { analyzeVintedItem, analyzeImages, extractStructuredData }; 