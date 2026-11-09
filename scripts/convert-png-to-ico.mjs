import fs from 'fs';
import path from 'path';

const pngPath = path.join(process.cwd(), 'assets', 'aca-logo.png');
const icoPath = path.join(process.cwd(), 'assets', 'icon.ico');

// Read the PNG file
const pngData = fs.readFileSync(pngPath);

// ICO format: ICONDIR header + ICONDIRENTRIES + image data
// For PNG images in ICO (Windows Vista+), width=0 and height=0 mean 256px

const imageCount = 1;
const entrySize = 16;
const headerSize = 6 + entrySize * imageCount;
const pngSize = pngData.length;
const offset = headerSize; // PNG data starts right after directory entries

const buffer = Buffer.alloc(headerSize + pngSize);

// Write ICONDIR header
buffer.writeUInt16LE(0, 0);           // Reserved (must be 0) at offset 0
buffer.writeUInt16LE(1, 2);           // Type: 1 = icon at offset 2
buffer.writeUInt16LE(imageCount, 4);  // Number of images at offset 4

// Write ICONDIRENTRIES
let entryOffset = 6;
buffer.writeUInt8(0, entryOffset);       // Width (0 = 256)
buffer.writeUInt8(0, entryOffset + 1);   // Height (0 = 256)
buffer.writeUInt8(0, entryOffset + 2);   // Color count (0 for PNG)
buffer.writeUInt8(0, entryOffset + 3);   // Reserved (0)
buffer.writeUInt16LE(0, entryOffset + 4); // Color planes (0 for PNG)
buffer.writeUInt16LE(32, entryOffset + 6); // Bits per pixel (32 for PNG)
buffer.writeUInt32LE(pngSize, entryOffset + 8); // Size of image data
buffer.writeUInt32LE(offset, entryOffset + 12); // Offset to image data

// Write PNG data
pngData.copy(buffer, offset);

fs.writeFileSync(icoPath, buffer);
console.log(`Created ${icoPath} (${buffer.length} bytes)`);

// Verify the ICO file can be read back
const verifyBuffer = fs.readFileSync(icoPath);
const verifyReserved = verifyBuffer.readUInt16LE(0);
const verifyType = verifyBuffer.readUInt16LE(2);
const verifyCount = verifyBuffer.readUInt16LE(4);
console.log(`Verification: reserved=${verifyReserved}, type=${verifyType}, count=${verifyCount}`);
console.log(`Icon file is valid: ${verifyReserved === 0 && verifyType === 1 && verifyCount === 1}`);
