import { WebhookClient, EmbedBuilder, EmbedField } from 'discord.js';

interface ItemData {
  title: string;
  description?: string;
  price?: number;
  imageUrls?: string[];
  url?: string;
  brand?: string;
  size?: string;
}

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

export async function postToDiscordWebhook(
  data: ItemData
): Promise<void> {
  const webhook = new WebhookClient({ url: DISCORD_WEBHOOK_URL });

  const embed = new EmbedBuilder()
    .setTitle(data.title)
    .setColor(0x00AE86);

  if (data.description) {
    embed.setDescription(data.description);
  }

  // Add fields for additional information
  const fields: EmbedField[] = [];
  if (data.price !== undefined) {
    fields.push({ name: 'Price', value: `€${data.price.toFixed(2)}`, inline: true });
  }
  if (data.brand) {
    fields.push({ name: 'Brand', value: data.brand, inline: true });
  }
  if (data.size) {
    fields.push({ name: 'Size', value: data.size, inline: true });
  }
  
  if (fields.length > 0) {
    embed.addFields(fields);
  }

  // Set the first image as the main embed image if available
  if (data.imageUrls && data.imageUrls.length > 0) {
    embed.setImage(data.imageUrls[0]);
  }

  if (data.url) {
    embed.setURL(data.url);
  }

  try {
    await webhook.send({
      embeds: [embed],
    });
  } catch (error) {
    console.error('Failed to send Discord webhook:', error);
    throw error;
  } finally {
    webhook.destroy(); // Clean up the webhook client
  }
} 