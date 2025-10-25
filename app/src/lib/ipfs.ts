import * as Storacha from '@storacha/client';
import { StoreMemory } from '@storacha/client/stores/memory';

export type Uploaded = { cid: string; path: string; uri: string }[];

// Project metadata schema
export interface ProjectMetadata {
  version?: string;
  name: string;
  description: string;
  imageURI: string;        // Main project image
  images?: string[];       // Additional gallery images
  location?: {
    address?: string;
    city: string;
    state: string;
    country: string;
  };
  specifications?: {
    squareFeet: number;
    units: number;
    type: string;          // "mixed-use", "residential", "commercial"
  };
}

let storachaClientPromise: Promise<Storacha.Client> | null = null;
let decodedArchive: any;

const STORACHA_ARCHIVE_ENV_KEY = 'VITE_STORACHA_AGENT_ARCHIVE' as const;
const storachaArchiveBase64 = import.meta.env[STORACHA_ARCHIVE_ENV_KEY] as string | undefined;

function decodeBase64(data: string): string {
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    return window.atob(data);
  }
  if (typeof globalThis !== 'undefined' && typeof (globalThis as any).atob === 'function') {
    return (globalThis as any).atob(data);
  }
  const BufferCtor = typeof globalThis !== 'undefined' ? (globalThis as any).Buffer : undefined;
  if (BufferCtor) {
    return BufferCtor.from(data, 'base64').toString('utf-8');
  }
  throw new Error('Base64 decoding is not supported in this environment.');
}

function reviveArchiveValue(value: unknown): any {
  if (Array.isArray(value)) {
    return value.map((item) => reviveArchiveValue(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const record = value as Record<string, unknown>;
  if ('$map' in record && Array.isArray((record as any).$map)) {
    const entries = (record as any).$map as [unknown, unknown][];
    return new Map(entries.map(([key, val]) => [key, reviveArchiveValue(val)]));
  }
  if ('$bytes' in record && Array.isArray((record as any).$bytes)) {
    return new Uint8Array((record as any).$bytes);
  }
  if ('$url' in record && typeof (record as any).$url === 'string') {
    try {
      return new URL((record as any).$url);
    } catch {
      return (record as any).$url;
    }
  }
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    result[key] = reviveArchiveValue(val);
  }
  return result;
}

async function getStoreWithArchive() {
  if (!storachaArchiveBase64) {
    throw new Error(`Storacha agent archive missing. Set ${STORACHA_ARCHIVE_ENV_KEY} in your environment.`);
  }
  if (!decodedArchive) {
    let json: string;
    try {
      json = decodeBase64(storachaArchiveBase64);
    } catch (error) {
      throw new Error('Failed to decode Storacha agent archive from base64.');
    }
    try {
      decodedArchive = reviveArchiveValue(JSON.parse(json));
    } catch {
      throw new Error('Storacha agent archive is not valid JSON.');
    }
  }
  const store = new StoreMemory();
  await store.save(decodedArchive);
  return store;
}

const LOG_PREFIX = '[Storacha]';
function log(...args: unknown[]) {
  // Centralized logger for easier filtering
  // Using console.info to surface in most consoles without being too noisy
  // Switch to console.debug if you want them hidden by default
  // eslint-disable-next-line no-console
  console.info(LOG_PREFIX, ...args);
}

function resolveDid(space: any): string | undefined {
  try {
    if (!space) return undefined;
    // Prefer calling the method to preserve `this` binding for private fields
    if (typeof space.did === 'function') {
      const v = space.did();
      return typeof v === 'string' ? v : undefined;
    }
    const v = space.did;
    return typeof v === 'string' ? v : undefined;
  } catch {
    return undefined;
  }
}

async function getStorachaClient(): Promise<Storacha.Client> {
  if (!storachaClientPromise) {
    log('Creating Storacha client...');
    storachaClientPromise = getStoreWithArchive()
      .then((store) => Storacha.create({ store }))
      .then((c) => {
      try {
        const spaces = c.spaces?.() || [];
        const dids = spaces.map((s: any) => resolveDid(s)).filter(Boolean) as string[];
        log('Client created. Existing spaces:', spaces.length, dids.length ? `dids=${dids.join(',')}` : '');
      } catch {
        // ignore
      }
      return c;
    });
  }
  return storachaClientPromise;
}

async function ensureStorachaReady(client: Storacha.Client) {
  try {
    await (client as any).capability?.access?.claim?.();
  } catch (error) {
    log('Failed to refresh Storacha delegations', error);
  }

  const spaces = client.spaces();
  log('ensureStorachaReady: spaces count =', spaces?.length || 0);
  if (!spaces || spaces.length === 0) {
    throw new Error('Storacha agent archive is missing delegations for any space. Update the archive env variable.');
  }
  // Use the first existing space if no current space set
  const current = client.currentSpace?.();
  const currentDid = resolveDid(current);
  log('Current space =', currentDid || 'none');
  if (!current) {
    const did = resolveDid(spaces[0]);
    if (!did) throw new Error('Storacha: could not resolve Space DID');
    await client.setCurrentSpace(did as any);
    log('Selected first existing space as current:', did);
  }
}

export async function ipfsUpload(files: File[]): Promise<Uploaded> {
  const client = await getStorachaClient();
  await ensureStorachaReady(client);
  let cid: unknown;
  try {
    log('Uploading directory with files:', files.map(f => ({ name: f.name, size: f.size, type: f.type })));
  } catch {
    // ignore
  }
  try {
    // Ensure any pending delegations are claimed right before upload.
    try { await (client as any).capability?.access?.claim?.(); } catch {}
    cid = await client.uploadDirectory(files);
    log('Upload completed. CID =', String(cid));
  } catch (e: any) {
    const msg = e?.message || String(e);
    // eslint-disable-next-line no-console
    console.error(LOG_PREFIX, 'Upload error:', e);
    if (/no proofs/i.test(msg) || /capability/i.test(msg)) {
      throw new Error('Storacha is not authorized for this browser. Please complete the magic-link login, then retry.');
    }
    throw e;
  }
  return files.map((f) => ({ cid: String(cid), path: f.name, uri: `ipfs://${cid}/${f.name}` }));
}

/**
 * Upload project metadata JSON to IPFS/Storacha
 * @param metadata Project metadata object
 * @returns IPFS URI (e.g., ipfs://Qm...)
 */
export async function uploadProjectMetadata(metadata: ProjectMetadata): Promise<string> {
  const client = await getStorachaClient();
  await ensureStorachaReady(client);
  
  try {
    // Convert metadata to JSON blob
    const metadataJson = JSON.stringify(metadata, null, 2);
    const blob = new Blob([metadataJson], { type: 'application/json' });
    const file = new File([blob], 'metadata.json', { type: 'application/json' });
    
    log('Uploading project metadata:', metadata.name);
    
    // Upload to Storacha
    try { await (client as any).capability?.access?.claim?.(); } catch {}
    const cid = await client.uploadDirectory([file]);
    
    const uri = `ipfs://${cid}/metadata.json`;
    log('Metadata uploaded. URI =', uri);
    return uri;
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error(LOG_PREFIX, 'Metadata upload error:', e);
    if (/no proofs/i.test(msg) || /capability/i.test(msg)) {
      throw new Error('Storacha is not authorized for this browser. Please complete the magic-link login, then retry.');
    }
    throw e;
  }
}

/**
 * Fetch project metadata from IPFS
 * @param uri IPFS URI (e.g., ipfs://Qm.../metadata.json)
 * @returns Parsed metadata object or null on error
 */
export async function fetchProjectMetadata(uri: string): Promise<ProjectMetadata | null> {
  if (!uri) return null;
  
  try {
    // Convert ipfs:// URI to HTTP gateway URL
    const httpUrl = resolveImageUri(uri);
    
    log('Fetching project metadata from:', httpUrl);
    const response = await fetch(httpUrl);
    
    if (!response.ok) {
      console.warn('Failed to fetch metadata:', response.status, response.statusText);
      return null;
    }
    
    const metadata = await response.json();
    log('Metadata fetched successfully');
    return metadata as ProjectMetadata;
  } catch (error) {
    console.error('Error fetching project metadata:', error);
    return null;
  }
}

/**
 * Convert IPFS URI to HTTP gateway URL
 * @param uri IPFS URI or regular HTTP URL
 * @returns HTTP URL for accessing the resource
 */
export function resolveImageUri(uri: string): string {
  if (!uri) return '';
  
  // If already HTTP/HTTPS, return as-is
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }
  
  // Convert ipfs:// to gateway URL
  if (uri.startsWith('ipfs://')) {
    const path = uri.replace('ipfs://', '');
    return `https://w3s.link/ipfs/${path}`;
  }
  
  // If it's just a CID or path, prepend gateway
  return `https://w3s.link/ipfs/${uri}`;
}
