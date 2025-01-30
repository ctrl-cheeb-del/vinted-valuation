import { analyzeVintedItem, fetchVintedCatalog } from './imageAnalyzer';
import { postToDiscordWebhook } from './discord/webhook';
import { sleep } from './utils/helpers';

const REDIRECT_PREFIX = 'https://andy-redirect-thing.alistair.cloud/';
const SEARCH_TERMS = ['ralph lauren']; // Add more search terms as needed
const DOMAIN = 'co.uk';
const DELAY_BETWEEN_ITEMS = 5000; // 5 seconds delay between processing items
const DELAY_BETWEEN_SEARCHES = 30000; // 30 seconds delay between search terms

// Keep track of processed items to avoid duplicates
const processedItems = new Set<number>();

async function processItem(item: any) {
  if (processedItems.has(item.id)) {
    return;
  }

  try {
    console.log(`Processing item: ${item.title} (${item.id})`);
    
    const redirectUrl = `${REDIRECT_PREFIX}${item.url}`;
    const resultString = await analyzeVintedItem(item.url);
    const result = JSON.parse(resultString);
    
    // Get the listed price as a number
    const listedPrice = parseFloat(item.price.amount);
    const estimatedValue = result.estimatedValue ? parseFloat(result.estimatedValue.replace('£', '')) : 0;
    
    // Calculate potential profit and ROI
    const potentialProfit = estimatedValue - listedPrice;
    const roi = listedPrice > 0 ? ((potentialProfit / listedPrice) * 100).toFixed(1) : 0;

    const discordData = {
      title: `${result.brand} ${result.model}`,
      brand: result.brand,
      model: result.model,
      size: result.size,
      color: result.color,
      condition: result.condition,
      price: estimatedValue,
      estimatedValue: result.estimatedValue,
      listedPrice: listedPrice,
      potentialProfit: potentialProfit,
      roi: roi.toString(),
      imageUrls: [item.photo.full_size_url],
      url: item.url
    };

    await postToDiscordWebhook(discordData);
    processedItems.add(item.id);
    console.log(`Successfully processed item ${item.id}`);
  } catch (error) {
    console.error(`Failed to process item ${item.id}:`, error);
  }
}

async function monitorCatalog() {
  while (true) {
    for (const searchTerm of SEARCH_TERMS) {
      try {
        console.log(`Fetching catalog for search term: ${searchTerm}`);
        const catalog = await fetchVintedCatalog(DOMAIN, searchTerm);
        
        for (const item of catalog.items) {
          await processItem(item);
          await sleep(DELAY_BETWEEN_ITEMS);
        }
        
      } catch (error) {
        console.error(`Error processing search term ${searchTerm}:`, error);
      }
      
      await sleep(DELAY_BETWEEN_SEARCHES);
    }
  }
}

// Start the monitoring process
console.log('Starting Vinted catalog monitor...');
monitorCatalog().catch(error => {
  console.error('Fatal error in monitor:', error);
  process.exit(1);
}); 