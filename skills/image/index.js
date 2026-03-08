/**
 * Image Skill
 * Generate images (DALL-E), analyze images (GPT-4o Vision), OCR.
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import OpenAI from 'openai';
import axios from 'axios';

export default async function execute({ action, prompt, url, path: imgPath, size = '1024x1024', quality = 'standard', output_path }, context = {}) {
  const apiKey = process.env.OPENAI_API_KEY || context.config?.ai?.openaiApiKey;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const client = new OpenAI({ apiKey });

  switch (action) {
    case 'generate': return generateImage(client, prompt, size, quality, output_path);
    case 'analyze':  return analyzeImage(client, url, imgPath, 'Describe this image in detail.');
    case 'ocr':      return analyzeImage(client, url, imgPath, 'Extract and return ALL text visible in this image. Format it clearly.');
    default: throw new Error(`Unknown action: ${action}. Use: generate, analyze, ocr`);
  }
}

async function generateImage(client, prompt, size, quality, outputPath) {
  if (!prompt) throw new Error('prompt is required for generate');

  const res = await client.images.generate({
    model: 'dall-e-3',
    prompt,
    size,
    quality,
    n: 1,
  });

  const imageUrl = res.data[0].url;
  const revised = res.data[0].revised_prompt;

  // Download and save locally
  const savePath = outputPath || join(process.env.HOME || '/tmp', '.openbot', `image-${Date.now()}.png`);
  const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
  writeFileSync(savePath, Buffer.from(imgRes.data));

  return `✅ Image generated and saved to: ${savePath}\nRevised prompt: ${revised}\nURL (expires): ${imageUrl}`;
}

async function analyzeImage(client, url, imgPath, instruction) {
  let imageContent;

  if (imgPath) {
    if (!existsSync(imgPath)) throw new Error(`Image file not found: ${imgPath}`);
    const data = readFileSync(imgPath);
    const ext = imgPath.split('.').pop().toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
    const mime = mimeMap[ext] || 'image/jpeg';
    imageContent = { type: 'image_url', image_url: { url: `data:${mime};base64,${data.toString('base64')}` } };
  } else if (url) {
    imageContent = { type: 'image_url', image_url: { url } };
  } else {
    throw new Error('Either url or path is required for analyze/ocr');
  }

  const res = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: [{ type: 'text', text: instruction }, imageContent],
    }],
  });

  return res.choices[0].message.content;
}
