import { WebhookClient, EmbedBuilder, EmbedField } from 'discord.js';

interface ItemData {
  title: string;
  description?: string;
  price?: number;
  imageUrls?: string[];
  url?: string;
  brand?: string;
  model?: string;
  size?: string;
  color?: string;
  condition?: string;
  estimatedValue?: string;
  listedPrice?: number;
  potentialProfit?: number;
  roi?: string;
  id?: string;
  site?: string;
}

const REDIRECT_PREFIX = 'https://andy-redirect-thing.alistair.cloud/';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL as string;
if (!DISCORD_WEBHOOK_URL) {
  throw new Error('DISCORD_WEBHOOK_URL is not defined in environment variables');
}

// Add these color constants at the top with other constants
const COLORS = {
  RED: 0xFF0000,    // Not profitable
  AMBER: 0xFFA500,  // Profitable but ROI < 50%
  GREEN: 0x00FF00   // ROI >= 50%
};

export async function postToDiscordWebhook(
  data: ItemData
): Promise<void> {
  const webhook = new WebhookClient({ url: DISCORD_WEBHOOK_URL });

  // Determine embed color based on ROI
  let embedColor = COLORS.RED;
  const roiNumber = parseFloat(data.roi || '0');
  
  if (roiNumber > 0) {
    embedColor = roiNumber >= 50 ? COLORS.GREEN : COLORS.AMBER;
  }

  const embed = new EmbedBuilder()
    .setTitle(data.title)
    .setColor(embedColor);

  // Format the description with the new layout
  const descriptionParts = [
    `🏷️ **Brand:** ${data.brand}`,
    `👚 **Model:** ${data.model || 'N/A'}`,
    `📏 **Size:** ${data.size}`,
    `🎨 **Color:** ${data.color || 'N/A'}`,
    `📦 **Condition**`,
    `• ${data.condition || 'N/A'}`,
    ``,
    `💸 **Price:** £${data.price}`,
    ``,
    `💰 **Price Analysis**`,
    `• Estimated Value: ${data.estimatedValue || `£${data.price}`}`,
    `• Listed Price: £${data.listedPrice}`,
    `• **Potential Profit: £${data.potentialProfit?.toFixed(2)}**`,
    `• **ROI: ${data.roi}%**`
  ].join('\n');

  embed.setDescription(descriptionParts);

  // Set the first image as the main embed image if available
  if (data.imageUrls && data.imageUrls.length > 0) {
    embed.setImage(data.imageUrls[0]);
  }

  if (data.url) {
    const redirectUrl = `${REDIRECT_PREFIX}${data.url}`;
    embed.setURL(redirectUrl);
  }

  // Add action links with redirect
  const itemId = data.url ? extractItemId(data.url) : '';
  const baseUrl = `https://www.vinted.co.uk`;
  let links = `**[🔗 View on Vinted](${REDIRECT_PREFIX}${data.url})**`;
  links += ` | **[📨 Send Message](${REDIRECT_PREFIX}${baseUrl}/items/${itemId}/want_it/new?button_name=receiver_id=${itemId})**`;
  links += ` | **[💸 Buy Now](${REDIRECT_PREFIX}${baseUrl}/transaction/buy/new?source_screen=item&transaction%5Bitem_id%5D=${itemId})**`;

  embed.addFields({ name: '\u200B', value: links, inline: false });

  try {
    await webhook.send({
      embeds: [embed],
    });
  } catch (error) {
    console.error('Failed to send Discord webhook:', error);
    throw error;
  } finally {
    webhook.destroy();
  }
}

// Helper function to extract item ID from URL
function extractItemId(url: string): string {
  const match = url.match(/items\/(\d+)/);
  return match ? match[1] : '';
} 