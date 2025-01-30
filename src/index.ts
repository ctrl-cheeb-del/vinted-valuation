import { analyzeVintedItem } from './imageAnalyzer';
import { postToDiscordWebhook } from './discord/webhook';
import { fetchCookie, extractItemId, fetchItemDetails } from './utils/cookie';
import * as fs from 'fs';

interface VintedPhoto {
  full_size_url: string;
}

interface VintedItemDetails {
  item?: {
    photos?: VintedPhoto[];
    title?: string;
    description?: string;
    price?: string;
    currency?: string;
  }
}

const vintedUrl = "https://www.vinted.co.uk/items/5731915289-nike-joggers?referrer=catalog";

async function getItemDetails(): Promise<VintedItemDetails> {
  const domain = 'co.uk';
  const itemId = extractItemId(vintedUrl);
  const accessTokenResponse = await fetchCookie(domain);
  if (!accessTokenResponse?.accessToken) throw new Error('Failed to get access token');
  return fetchItemDetails(itemId, domain, accessTokenResponse.accessToken);
}

// Main execution
(async () => {
  try {
    const itemDetails = await getItemDetails();
    console.log('Item details:', JSON.stringify(itemDetails, null, 2));
    
    const result = await analyzeVintedItem(vintedUrl);
    console.log('Analysis result:', result);
    fs.writeFileSync('analysis_result.txt', JSON.stringify(result, null, 2));
    
    // Format the data for Discord
    const descriptionParts = [
      `🏷️ **Brand:** ${result.brand || 'Unknown'}`,
      `📏 **Size:** ${result.size || 'Unknown'}`,
      `🎨 **Color:** ${result.color || 'Unknown'}`,
      '',
      '📦 **Condition**',
      `• ${result.condition || 'Unknown'}`,
      result.conditionNotes ? `• ${result.conditionNotes}` : null,
      '',
      '💰 **Price Analysis**',
      `• Estimated Value: ${result.estimatedValue || 'Not available'}`
    ].filter(Boolean);

    // Only add comparable prices section if we have them
    if (result.comparablePrices && result.comparablePrices.length > 0) {
      descriptionParts.push(
        '',
        '🔍 **Market Research**',
        ...result.comparablePrices.map((price: string) => `• ${price}`)
      );
    }

    // Add original listing details if available
    if (itemDetails.item?.price || itemDetails.item?.description) {
      descriptionParts.push('', '📝 **Original Listing**');
      
      if (itemDetails.item?.price && itemDetails.item?.currency) {
        descriptionParts.push(`• Listed Price: ${itemDetails.item.price} ${itemDetails.item.currency}`);
      }
      
      if (itemDetails.item?.description) {
        const truncatedDescription = itemDetails.item.description.length > 150 
          ? itemDetails.item.description.slice(0, 150) + '...'
          : itemDetails.item.description;
        descriptionParts.push(`• ${truncatedDescription}`);
      }
    }

    const discordData = {
      title: `${result.brand || 'Unknown Brand'} ${result.model || 'Item'}`,
      description: descriptionParts.join('\n'),
      brand: result.brand,
      size: result.size,
      price: result.estimatedValue ? parseFloat(result.estimatedValue.replace('£', '')) : undefined,
      imageUrls: itemDetails.item?.photos?.map((photo) => photo.full_size_url) || [],
      url: vintedUrl
    };

    try {
      await postToDiscordWebhook(discordData);
      console.log('Successfully posted to Discord');
    } catch (error) {
      console.error('Failed to post to Discord:', error);
    }
  } catch (error) {
    console.error('Failed to analyze item:', error);
  }
})(); 