#!/usr/bin/env node

/**
 * Download copyright-free real images from Unsplash for Storybook visual testing
 * All images are copyright-free and safe for commercial use
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Curated copyright-free images from Unsplash
const ASSETS_COLLECTION = {
  // Action/Adventure themed backdrops
  backdrops: [
    {
      url: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1920&h=1080&fit=crop&crop=center',
      name: 'action-1.jpg',
      description: 'City skyline at night - action theme',
      credit: 'Photo by Sebastian Herrmann on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&h=1080&fit=crop&crop=center',
      name: 'drama-1.jpg',
      description: 'Forest landscape - drama theme',
      credit: 'Photo by Casey Horner on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop&crop=center',
      name: 'scifi-1.jpg',
      description: 'Mountain landscape - sci-fi theme',
      credit: 'Photo by Denys Nevozhai on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1519904981063-b0cf448d479e?w=1920&h=1080&fit=crop&crop=center',
      name: 'horror-1.jpg',
      description: 'Dark alley - horror theme',
      credit: 'Photo by Gabriel Benois on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1920&h=1080&fit=crop&crop=center',
      name: 'comedy-1.jpg',
      description: 'Beach sunset - comedy theme',
      credit: 'Photo by Olia Gozha on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=1920&h=1080&fit=crop&crop=center',
      name: 'kids-1.jpg',
      description: 'Colorful balloons - kids theme',
      credit: 'Photo by Wes Hicks on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1920&h=1080&fit=crop&crop=center',
      name: 'action-2.jpg',
      description: 'Industrial landscape - action theme',
      credit: 'Photo by Luca Bravo on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=1920&h=1080&fit=crop&crop=center',
      name: 'drama-2.jpg',
      description: 'Lake reflection - drama theme',
      credit: 'Photo by Toa Heftiba on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=1920&h=1080&fit=crop&crop=center',
      name: 'scifi-2.jpg',
      description: 'Aurora borealis - sci-fi theme',
      credit: 'Photo by Vincent Guth on Unsplash'
    }
  ],
  
  // Poster-style vertical images
  posters: [
    {
      url: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=500&h=750&fit=crop&crop=center',
      name: 'action-poster-1.jpg',
      description: 'Urban cityscape - action poster',
      credit: 'Photo by Sebastian Herrmann on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=500&h=750&fit=crop&crop=center',
      name: 'drama-poster-1.jpg',
      description: 'Forest path - drama poster',
      credit: 'Photo by Casey Horner on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&h=750&fit=crop&crop=center',
      name: 'scifi-poster-1.jpg',
      description: 'Mountain vista - sci-fi poster',
      credit: 'Photo by Denys Nevozhai on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1519904981063-b0cf448d479e?w=500&h=750&fit=crop&crop=center',
      name: 'horror-poster-1.jpg',
      description: 'Dark corridor - horror poster',
      credit: 'Photo by Gabriel Benois on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=500&h=750&fit=crop&crop=center',
      name: 'comedy-poster-1.jpg',
      description: 'Beach scene - comedy poster',
      credit: 'Photo by Olia Gozha on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=500&h=750&fit=crop&crop=center',
      name: 'kids-poster-1.jpg',
      description: 'Colorful scene - kids poster',
      credit: 'Photo by Wes Hicks on Unsplash'
    }
  ],
  
  // Logo/brand style images
  logos: [
    {
      url: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=400&h=200&fit=crop&crop=center',
      name: 'action-logo-1.jpg',
      description: 'Abstract geometric - action logo',
      credit: 'Photo by Markus Spiske on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1551033406-611cf9a28f67?w=400&h=200&fit=crop&crop=center',
      name: 'drama-logo-1.jpg',
      description: 'Minimal abstract - drama logo',
      credit: 'Photo by Pawel Czerwinski on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=400&h=200&fit=crop&crop=center',
      name: 'scifi-logo-1.jpg',
      description: 'Tech abstract - sci-fi logo',
      credit: 'Photo by Sebastian Herrmann on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1574169208507-84376144848b?w=400&h=200&fit=crop&crop=center',
      name: 'horror-logo-1.jpg',
      description: 'Dark abstract - horror logo',
      credit: 'Photo by Pawel Czerwinski on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=200&fit=crop&crop=center',
      name: 'comedy-logo-1.jpg',
      description: 'Bright abstract - comedy logo',
      credit: 'Photo by Pawel Czerwinski on Unsplash'
    },
    {
      url: 'https://images.unsplash.com/photo-1553356084-58ef4a67b2a7?w=400&h=200&fit=crop&crop=center',
      name: 'kids-logo-1.jpg',
      description: 'Colorful abstract - kids logo',
      credit: 'Photo by Steve Johnson on Unsplash'
    }
  ]
};

/**
 * Download an image from URL
 */
async function downloadImage(url, outputPath, description) {
  try {
    console.log(`  📥 Downloading: ${description}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
    
    console.log(`  ✅ Saved: ${path.basename(outputPath)}`);
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to download ${description}:`, error.message);
    return false;
  }
}

/**
 * Download all assets
 */
async function downloadAssets() {
  console.log('🎬 Downloading copyright-free real images from Unsplash...\n');
  
  const outputDir = path.join(__dirname, '..', 'frontend', 'src', '__test-utils__', 'assets');
  
  let successCount = 0;
  let totalCount = 0;
  const credits = [];
  
  // Download each category
  for (const [category, assets] of Object.entries(ASSETS_COLLECTION)) {
    console.log(`📁 Downloading ${category}...`);
    
    for (const asset of assets) {
      totalCount++;
      const outputPath = path.join(outputDir, category, asset.name);
      const success = await downloadImage(asset.url, outputPath, asset.description);
      
      if (success) {
        successCount++;
        credits.push({
          file: `${category}/${asset.name}`,
          credit: asset.credit,
          description: asset.description
        });
      }
      
      // Add small delay to be respectful to Unsplash
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('');
  }
  
  // Create credits file
  const creditsContent = `# Image Credits

All images are copyright-free and sourced from Unsplash (unsplash.com).
These images are free for commercial use with no attribution required.

## Asset Credits

${credits.map(item => 
  `### ${item.file}
**Description**: ${item.description}
**Credit**: ${item.credit}
**License**: Unsplash License (free for commercial use)
`).join('\n')}

## Unsplash License Summary

All images from Unsplash are released under the Unsplash License:
- ✅ Free for commercial use
- ✅ No attribution required (though appreciated)
- ✅ Can be modified and distributed
- ✅ Can be used in products for sale

Full license details: https://unsplash.com/license
`;

  fs.writeFileSync(path.join(outputDir, 'CREDITS.md'), creditsContent);
  
  console.log(`🎉 Downloaded ${successCount}/${totalCount} copyright-free images successfully!`);
  console.log(`📍 Assets saved to: ${outputDir}`);
  console.log(`📄 Credits saved to: ${path.join(outputDir, 'CREDITS.md')}`);
  
  if (successCount < totalCount) {
    console.log(`⚠️  ${totalCount - successCount} downloads failed. Check your internet connection and try again.`);
  }
}

// Run the downloader
downloadAssets().catch(console.error);