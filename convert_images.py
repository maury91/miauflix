#!/usr/bin/env python3
from PIL import Image
import os

def convert_png_to_jpg(png_path, jpg_path):
    """Convert PNG to JPG format"""
    try:
        # Open the PNG image
        with Image.open(png_path) as img:
            # Convert to RGB if necessary (JPG doesn't support transparency)
            if img.mode in ('RGBA', 'LA', 'P'):
                # Create a white background
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Save as JPG
            img.save(jpg_path, 'JPEG', quality=95)
            print(f"Converted {png_path} to {jpg_path}")
    except Exception as e:
        print(f"Error converting {png_path}: {e}")

# Convert the action images
convert_png_to_jpg('test-assets/backdrops/action-1.png', 'test-assets/backdrops/action-1.jpg')
convert_png_to_jpg('test-assets/backdrops/action-2.png', 'test-assets/backdrops/action-2.jpg')

print("Conversion complete!")
