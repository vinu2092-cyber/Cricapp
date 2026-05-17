// Simple English to Hindi cricket commentary translation mapping
export const cricketTranslations: Record<string, string> = {
  // General terms
  'runs': 'रन',
  'run': 'रन',
  'wicket': 'विकेट',
  'out': 'आउट',
  'four': 'चौका',
  'six': 'छक्का',
  'no run': 'कोई रन नहीं',
  'dot ball': 'डॉट बॉल',
  'boundary': 'चौका',
  'over': 'ओवर',
  'ball': 'गेंद',
  'bowled': 'बोल्ड',
  'caught': 'कैच',
  'lbw': 'एलबीडब्लू',
  'stumped': 'स्टम्प्ड',
  'run out': 'रन आउट',
  'bowler': 'गेंदबाज',
  'batsman': 'बल्लेबाज',
  'fielder': 'फील्डर',
  'wide': 'वाइड',
  'no ball': 'नो बॉल',
  'bye': 'बाइ',
  'leg bye': 'लेग बाइ',
  
  // Action terms
  'hits': 'मारता है',
  'plays': 'खेलता है',
  'drives': 'ड्राइव करता है',
  'pulls': 'पुल करता है',
  'cuts': 'कट करता है',
  'defends': 'बचाव करता है',
  'misses': 'चूक जाता है',
  'edges': 'किनारे से लगता है',
  
  // Results
  'appeal': 'अपील',
  'given out': 'आउट दिया गया',
  'not out': 'नॉट आउट',
  'review': 'रिव्यू',
  'umpire': 'अंपायर',
  
  // Scores
  'fifty': 'अर्धशतक',
  'hundred': 'शतक',
  'century': 'शतक',
  'partnership': 'साझेदारी',
  
  // Common phrases
  'End of over': 'ओवर समाप्त',
  'Innings Break': 'पारी विराम',
  'Target': 'लक्ष्य',
  'to the': 'की ओर',
  'for': 'के लिए',
  'and': 'और',
  'the': '',
};

export const translateToHindi = (englishText: string): string => {
  if (!englishText) return '';
  
  let translated = englishText;
  
  // Replace common patterns
  Object.entries(cricketTranslations).forEach(([en, hi]) => {
    const regex = new RegExp(`\\b${en}\\b`, 'gi');
    translated = translated.replace(regex, hi);
  });
  
  // Special patterns for numbers with runs
  translated = translated.replace(/(\d+)\s+runs?/gi, '$1 रन');
  translated = translated.replace(/(\d+)\s+wickets?/gi, '$1 विकेट');
  translated = translated.replace(/(\d+)\s+overs?/gi, '$1 ओवर');
  
  // Remove extra spaces
  translated = translated.replace(/\s+/g, ' ').trim();
  
  return translated;
};
