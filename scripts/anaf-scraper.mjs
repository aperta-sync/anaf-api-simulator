import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

/**
 * ANAF Documentation Scraper - High Integrity Version
 * Uses SHA-256 hashing to detect real changes and notifies on updates.
 */

const BASE_DIR = 'docs/anaf/scraped';
// STATE_FILE is no longer a local file path, it's a B2 Key
const STATE_B2_KEY = 'anaf-docs/.scraper-state.json';
const INDEX_URL = 'https://mfinante.gov.ro/ro/web/efactura/informatii-tehnice';
const DISCORD_WEBHOOK = process.env.ANAF_NOTIFIER_WEBHOOK;

let s3Client = null;
if (process.env.B2_ACCESS_KEY_ID && process.env.B2_SECRET_ACCESS_KEY && process.env.B2_BUCKET_NAME) {
  s3Client = new S3Client({
    endpoint: process.env.B2_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com',
    region: process.env.B2_REGION || 'us-east-005',
    credentials: {
      accessKeyId: process.env.B2_ACCESS_KEY_ID,
      secretAccessKey: process.env.B2_SECRET_ACCESS_KEY,
    }
  });
}

const SWAGGER_SOURCES = [];

const CONFIG = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,ro;q=0.8',
    'Connection': 'close'
  },
  timeout: 10000,
  maxRedirects: 5
};

/**
 * Calculates SHA-256 hash of a file.
 */
async function getFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Sends a notification to Discord if configured.
 */
async function sendNotification(message) {
  if (!DISCORD_WEBHOOK) return;
  try {
    await axios.post(DISCORD_WEBHOOK, { content: `🔔 **ANAF Update Detected!**\n${message}` });
  } catch (err) {
    console.error(`  [WARN] Failed to send Discord notification: ${err.message}`);
  }
}

/**
 * Extracts OpenAPI spec from Swagger UI HTML if present.
 * Handles both strict JSON and JS object literals (unquoted keys).
 */
function extractOpenApiSpec(html) {
  const match = html.match(/var\s+spec\s*=\s*(\{[\s\S]+?\});/);
  if (!match) return null;
  const specStr = match[1].trim();
  try {
    // Try standard JSON first
    return JSON.parse(specStr);
  } catch (e) {
    try {
      // If it's a JS object literal (unquoted keys), evaluate it safely
      // We wrap it in parens and return it
      return new Function(`return (${specStr})`)();
    } catch (e2) {
      console.error('    └─ ❌ Failed to parse extracted spec:', e2.message);
      return null;
    }
  }
}

function getFolderForUrl(url) {
  const lower = url.toLowerCase();
  if (lower.includes('prezentare') || lower.includes('specificatii') || lower.includes('swagger') || lower.includes('api')) return 'technical';
  if (lower.includes('ghid') || lower.includes('instructiuni')) return 'guides';
  if (lower.includes('ordin') || lower.includes('lege') || lower.includes('oug')) return 'legislative';
  return 'resources';
}

async function fetchStateFromB2() {
  if (!s3Client) {
    console.warn('⚠️ No B2 credentials found. Scraper state will NOT be saved between runs!');
    return {};
  }
  try {
    const data = await s3Client.send(new GetObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: STATE_B2_KEY
    }));
    const stateStr = await data.Body.transformToString();
    return JSON.parse(stateStr);
  } catch (err) {
    if (err.name === 'NoSuchKey') {
      console.log('ℹ️ No existing state found in B2. Starting fresh.');
      return {};
    }
    console.error(`  [WARN] Failed to fetch state from B2: ${err.message}`);
    return {};
  }
}

async function saveStateToB2(state) {
  if (!s3Client) return;
  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: STATE_B2_KEY,
      Body: JSON.stringify(state, null, 2),
      ContentType: 'application/json'
    }));
    console.log('💾 Successfully saved scraper state back to B2.');
  } catch (err) {
    console.error(`  [WARN] Failed to save state to B2: ${err.message}`);
  }
}

async function runScraper() {
  console.log('\n🚀 ANAF High-Integrity Scraper Started');
  console.log(`📡 Fetching index: ${INDEX_URL}`);

  let state = await fetchStateFromB2();

  const updates = [];

  try {
    const response = await axios.get(INDEX_URL, CONFIG);
    const html = response.data;
    const linkRegex = /href="([^"]+\.(?:pdf|zip|txt|html))"/gi;
    const discoveredLinks = new Set();
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      let url = match[1];
      if (url.startsWith('/')) url = `https://mfinante.gov.ro${url}`;
      else if (!url.startsWith('http')) url = `https://mfinante.gov.ro/ro/web/efactura/${url}`;
      
      if (url.toLowerCase().endsWith('.html') && !url.includes('/static/10/eFactura/')) {
        continue;
      }
      discoveredLinks.add(url);
    }

    console.log(`🔎 Found ${discoveredLinks.size} resource links.\n`);

    for (const source of SWAGGER_SOURCES) {
      discoveredLinks.add(source.url);
    }

    for (const url of discoveredLinks) {
      const swaggerSource = SWAGGER_SOURCES.find(s => s.url === url);
      const filename = swaggerSource ? swaggerSource.name : path.basename(url);
      
      let folder;
      if (swaggerSource) {
        folder = 'technical/swagger';
      } else if (url.toLowerCase().endsWith('.html')) {
        folder = 'technical/endpoints';
      } else {
        folder = getFolderForUrl(url);
      }
      
      const targetDir = path.join(BASE_DIR, folder);
      const targetPath = path.join(targetDir, filename);
      const tempPath = `${targetPath}.tmp`;
      
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

      const entryState = state[url] || {};

      try {
        process.stdout.write(`◌ Checking ${filename}...`);
        
        const headResponse = await axios.head(url, CONFIG).catch(() => null);
        const etag = headResponse?.headers['etag'];
        const lastModified = headResponse?.headers['last-modified'];

        const stateMatches = etag && etag === entryState.etag && lastModified && lastModified === entryState.lastModified;

        if (headResponse && stateMatches) {
          // If the file hasn't changed on the server and is already in B2, we can skip it entirely,
          // even if it doesn't exist locally (e.g. ignored large files in CI).
          if (entryState.b2Uploaded) {
            process.stdout.write(' [SKIP: State Match]\n');
            continue;
          }

          // If it hasn't changed but needs a retroactive B2 upload, we need it locally
          if (fs.existsSync(targetPath)) {
            process.stdout.write(' [SKIP: Header Match]\n');
            
            if (s3Client && !entryState.b2Uploaded) {
              try {
                process.stdout.write(`    └─ Uploading existing file to B2...`);
                const fileStream = fs.createReadStream(targetPath);
                await s3Client.send(new PutObjectCommand({
                  Bucket: process.env.B2_BUCKET_NAME,
                  Key: `anaf-docs/${folder}/${filename}`,
                  Body: fileStream
                }));
                console.log(' [DONE]');
                state[url] = { ...entryState, b2Uploaded: true };
              } catch (b2Error) {
                console.log(` [FAILED: ${b2Error.message}]`);
              }
            }
            continue;
          }
          // If it needs a B2 upload but isn't local, it will fall through and download it
        }

        process.stdout.write(' [DOWNLOAD]\n');
        const downloadResponse = await axios.get(url, { ...CONFIG, responseType: 'stream' });
        const writer = fs.createWriteStream(tempPath);

        let receivedBytes = 0;
        downloadResponse.data.on('data', (chunk) => { receivedBytes += chunk.length; });

        await new Promise((resolve, reject) => {
          downloadResponse.data.pipe(writer);
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        const newHash = await getFileHash(tempPath);

        if (fs.existsSync(targetPath) && newHash === entryState.hash) {
          process.stdout.write(`    └─ No change (Checksum verified: ${newHash.slice(0, 8)}...)\n`);
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          continue;
        }

        if (fs.existsSync(tempPath)) fs.renameSync(tempPath, targetPath);
        // --- B2 Upload ---
        let b2Success = false;
        if (s3Client) {
          try {
            process.stdout.write(`    └─ Uploading to B2...`);
            const fileStream = fs.createReadStream(targetPath);
            await s3Client.send(new PutObjectCommand({
              Bucket: process.env.B2_BUCKET_NAME,
              Key: `anaf-docs/${folder}/${filename}`,
              Body: fileStream
            }));
            console.log(' [DONE]');
            b2Success = true;
          } catch (b2Error) {
            console.log(` [FAILED: ${b2Error.message}]`);
          }
        }
        state[url] = { etag, lastModified, hash: newHash, downloadedAt: new Date().toISOString(), b2Uploaded: b2Success };
        // -----------------

        // --- Extract OpenAPI Spec from HTML ---
        if (url.toLowerCase().endsWith('.html')) {
          const content = fs.readFileSync(targetPath, 'utf-8');
          const spec = extractOpenApiSpec(content);
          if (spec) {
            const swaggerDir = path.join(BASE_DIR, 'technical/swagger');
            if (!fs.existsSync(swaggerDir)) fs.mkdirSync(swaggerDir, { recursive: true });
            const jsonFilename = filename.replace('.html', '.json');
            fs.writeFileSync(path.join(swaggerDir, jsonFilename), JSON.stringify(spec, null, 2));
            console.log(`    └─ Extracted OpenAPI spec to ${jsonFilename}`);
          }
        }
        // --------------------------------------

        const changeType = fs.existsSync(targetPath) ? 'UPDATED' : 'NEW';
        updates.push(`[${changeType}] ${filename} (${(receivedBytes / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`    └─ ${changeType}! New checksum: ${newHash.slice(0, 8)}...`);

      } catch (error) {
        if (error.response?.status === 401) {
          console.error(`\n    └─ 🔒 Restricted (401): ${url}`);
        } else {
          console.error(`\n    └─ ❌ Error fetching ${url}: ${error.message}`);
        }
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    }

    if (updates.length > 0) {
      const summary = updates.join('\n');
      console.log('\n🔔 --- UPDATE SUMMARY ---');
      console.log(summary);
      console.log('--------------------------\n');
      await sendNotification(summary);
    } else {
      console.log('\n✅ All files are up to date. No changes detected.');
    }

  } catch (error) {
    console.error(`\n🚨 Critical error: ${error.message}`);
  }

  await saveStateToB2(state);
  console.log('🏁 Scraper Finished\n');
  process.exit(0);
}

runScraper();
