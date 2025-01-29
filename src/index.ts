import { analyzeVintedItem } from './imageAnalyzer';
import * as fs from 'fs';

const vintedUrl = "https://www.vinted.co.uk/items/5731915289-nike-joggers?referrer=catalog";

analyzeVintedItem(vintedUrl)
  .then(result => {
    console.log('Analysis result:', result);
    fs.writeFileSync('analysis_result.txt', result);
  })
  .catch(error => {
    console.error('Failed to analyze item:', error);
  }); 