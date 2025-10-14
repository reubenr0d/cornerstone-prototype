import { Web3Storage, File as W3File } from 'web3.storage';

export type Uploaded = { cid: string; path: string; uri: string }[];

function getClient(): Web3Storage | null {
  const token = import.meta.env.VITE_WEB3STORAGE_TOKEN as string | undefined;
  if (!token) return null;
  try {
    return new Web3Storage({ token });
  } catch {
    return null;
  }
}

export async function ipfsUpload(files: File[]): Promise<Uploaded> {
  const client = getClient();
  if (!client) throw new Error('IPFS token missing (VITE_WEB3STORAGE_TOKEN)');
  const w3files = files.map((f) => new W3File([f], f.name, { type: f.type }));
  const cid = await client.put(w3files, { wrapWithDirectory: true });
  return w3files.map((f) => ({ cid, path: f.name, uri: `ipfs://${cid}/${f.name}` }));
}

