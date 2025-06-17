// Node.js script to generate icon PNGs
// This creates simple placeholder icons for the extension

const fs = require('fs');
const { createCanvas } = require('canvas');

function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#2196F3');
  gradient.addColorStop(1, '#1976D2');
  
  // Draw rounded rectangle background
  const radius = size * 0.2;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  
  // Draw sound wave icon
  ctx.strokeStyle = 'white';
  ctx.lineWidth = size * 0.06;
  ctx.lineCap = 'round';
  
  // Center wave
  const centerX = size / 2;
  const centerY = size / 2;
  const waveHeight = size * 0.3;
  
  // Draw three sound waves
  for (let i = 0; i < 3; i++) {
    const offset = (i - 1) * size * 0.15;
    const height = waveHeight * (1 - Math.abs(i - 1) * 0.3);
    
    ctx.beginPath();
    ctx.moveTo(centerX + offset, centerY - height);
    ctx.lineTo(centerX + offset, centerY + height);
    ctx.stroke();
  }
  
  return canvas.toBuffer('image/png');
}

// Generate icons
const sizes = [16, 48, 128];

sizes.forEach(size => {
  const buffer = createIcon(size);
  fs.writeFileSync(`icon${size}.png`, buffer);
  console.log(`Created icon${size}.png`);
});

console.log('All icons created successfully!');