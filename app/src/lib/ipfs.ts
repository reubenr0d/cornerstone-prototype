import * as Storacha from '@storacha/client';

export type Uploaded = { cid: string; path: string; uri: string }[];

let storachaClientPromise: Promise<Storacha.Client> | null = null;

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
    storachaClientPromise = Storacha.create().then((c) => {
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
  // If no spaces configured, guide the user through login and space setup once.
  const spaces = client.spaces();
  log('ensureStorachaReady: spaces count =', spaces?.length || 0);
  if (!spaces || spaces.length === 0) {
    // Prompt for email to authorize this agent. This triggers a magic-link flow.
    const email = typeof window !== 'undefined'
      ? window.prompt('Enter your email to login to Storacha (magic link will be sent):') || ''
      : '';
    if (!email) throw new Error('Storacha login required to upload documents.');
    // Request login (sends magic link).
    log('Initiating login for email', email.replace(/(^.).*(@.*$)/, '$1***$2'));
    await client.login(email);
    log('Login initiated. Waiting for delegations (proofs)...');
    // Attempt to claim any delegations granted via magic-link and wait briefly
    // for the user to click the link. We poll for up to ~60 seconds.
    let hasAccount = false;
    for (let i = 0; i < 60; i++) {
      try { await (client as any).capability?.access?.claim?.(); } catch {}
      const accs = (client as any).accounts?.();
      const count = accs ? Object.keys(accs).length : 0;
      log(`Claim attempt #${i + 1}: accounts=${count}`);
      if (count > 0) { hasAccount = true; break; }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!hasAccount) {
      throw new Error('Storacha login not completed. Please click the magic-link in your email, then retry the upload.');
    }
    // After login, create a space if still none exist.
    const postLoginSpaces = client.spaces();
    const postLoginDids = (postLoginSpaces || []).map((s: any) => resolveDid(s)).filter(Boolean) as string[];
    log('Post-login spaces count =', postLoginSpaces?.length || 0, postLoginDids.length ? `dids=${postLoginDids.join(',')}` : '');
    if (!postLoginSpaces || postLoginSpaces.length === 0) {
      let space;
      try {
        space = await client.createSpace('Cornerstone');
        log('Created new space:', resolveDid(space));
      } catch (e:any) {
        const msg = e?.message || String(e);
        if (/no proofs/i.test(msg)) {
          throw new Error('Storacha is not authorized yet. After clicking the magic link, wait a moment and retry.');
        }
        log('createSpace error:', msg);
        throw e;
      }
      {
        const did = resolveDid(space);
        if (!did) throw new Error('Storacha: could not resolve new Space DID');
        await client.setCurrentSpace(did as any);
        log('Set current space to newly created space:', did);
      }
    } else {
      const first = postLoginSpaces[0];
      const did = resolveDid(first);
      log('Resolved DID from first post-login space:', did || typeof (first as any)?.did);
      if (!did) throw new Error('Storacha: could not resolve existing Space DID');
      await client.setCurrentSpace(did as any);
      log('Set current space to existing space:', did);
    }
    return;
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

  // Even if spaces exist, the agent may still lack proofs.
  // First try a quick claim, then if still no accounts, prompt login + claim loop.
  try { await (client as any).capability?.access?.claim?.(); } catch {}
  let accs = (client as any).accounts?.();
  let count = accs ? Object.keys(accs).length : 0;
  log('Post-select accounts count =', count);

  if (!count) {
    // Prompt for email to re-authorize this agent
    const email = typeof window !== 'undefined'
      ? window.prompt('Storacha authorization required. Enter your email to receive a magic link:') || ''
      : '';
    if (!email) throw new Error('Storacha login required to upload documents.');
    log('Re-login to obtain proofs for existing space.');
    await client.login(email);
    for (let i = 0; i < 60; i++) {
      try { await (client as any).capability?.access?.claim?.(); } catch {}
      accs = (client as any).accounts?.();
      count = accs ? Object.keys(accs).length : 0;
      log(`Re-claim attempt #${i + 1}: accounts=${count}`);
      if (count > 0) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!count) {
      throw new Error('Storacha login not completed. Please click the magic link and retry.');
    }
    // Ensure a current space is set now that we have proofs
    const cur = client.currentSpace?.();
    const curDid = resolveDid(cur);
    log('After re-login, current space =', curDid || 'none');
    if (!cur) {
      const did = resolveDid(spaces[0]);
      if (!did) throw new Error('Storacha: could not resolve Space DID after re-login');
      await client.setCurrentSpace(did as any);
      log('After re-login, set current space to:', did);
    }
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
