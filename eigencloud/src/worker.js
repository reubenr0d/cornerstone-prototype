/* eslint-disable no-console */
const { ethers } = require("ethers");
const retry = require("p-retry").default || require("p-retry");
const pdfParse = require("pdf-parse");
require("dotenv").config();

const RPC_URL = process.env.RPC_URL;
const REGISTRY_ADDRESS = (process.env.REGISTRY_ADDRESS || "").trim();
const START_BLOCK = Number(process.env.START_BLOCK || 0);
const PROJECT_ADDRESSES = (process.env.PROJECT_ADDRESSES || "")
  .split(",")
  .map((a) => a.trim())
  .filter(Boolean);
const IPFS_GATEWAYS = (process.env.IPFS_GATEWAYS || "https://w3s.link/ipfs/,https://ipfs.io/ipfs/")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

if (!RPC_URL) {
  throw new Error("RPC_URL is required");
}
if (!REGISTRY_ADDRESS && !PROJECT_ADDRESSES.length) {
  throw new Error("Set REGISTRY_ADDRESS or PROJECT_ADDRESSES");
}

// Prefer EigenCloud-injected mnemonic, fallback to local private key for dev
const mnemonic = process.env.MNEMONIC;
const pk = process.env.WORKER_PRIVATE_KEY;
if (!mnemonic && !pk) {
  throw new Error("Set MNEMONIC (EigenCloud) or WORKER_PRIVATE_KEY (local)");
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = mnemonic
  ? ethers.Wallet.fromPhrase(mnemonic, provider)
  : new ethers.Wallet(pk, provider);

// DocID enum mapping (must match contract)
const DocID = {
  TITLE_DOCUMENT: 0,
  TITLE_INSURANCE: 1,
  DESIGN_PLAN: 2,
  NEW_HOME_REGISTRATION: 3,
  WARRANTY_ENROLMENT: 4,
  DEMOLITION_PERMIT: 5,
  ABATEMENT_PERMIT: 6,
  BUILDING_PERMIT: 7,
  OCCUPANCY_PERMIT: 8,
  APPRAISER_REPORTS: 9,
};

// Map DocID to Vancouver permit type
const PERMIT_TYPE_MAPPING = {
  [DocID.DEMOLITION_PERMIT]: "Demolition / Deconstruction",
  [DocID.ABATEMENT_PERMIT]: "Salvage and Abatement",
  [DocID.BUILDING_PERMIT]: "New Building",
  [DocID.OCCUPANCY_PERMIT]: "Occupancy"
};

const VERIFICATION_ABI = [
  "event VerificationRequested(bytes32 indexed jobId, address indexed project, uint8 docId, string docUri, bytes32 docHash)",
  "function setVerificationResult(bytes32 jobId, bytes32 docHash, bool success, string extractedText) external",
];

const REGISTRY_ABI = [
  "event ProjectCreated(address indexed project, address indexed token, address indexed creator, string metadataURI)",
];

const handlers = new Map();
const attachedProjects = new Set();

function log(level, msg, meta = {}) {
  const levels = { error: 0, warn: 1, info: 2, debug: 3 };
  if ((levels[level] ?? 2) > (levels[LOG_LEVEL] ?? 2)) return;
  console.log(JSON.stringify({ level, msg, ...meta, ts: new Date().toISOString() }));
}

function gatewayUrl(uri, gateway) {
  if (uri.startsWith("ipfs://")) {
    const path = uri.replace("ipfs://", "");
    return `${gateway.replace(/\/+$/, "")}/${path}`;
  }
  return uri;
}

async function fetchPdf(uri) {
  // If it's a direct HTTP/HTTPS URL, fetch it directly
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    return retry(
      async () => {
        try {
          log("info", "fetching direct url", { url: uri });
          const res = await fetch(uri);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          const arrayBuf = await res.arrayBuffer();
          const buf = Buffer.from(arrayBuf);
          log("info", "direct url fetch success", { url: uri, size: buf.length });
          return buf;
        } catch (err) {
          log("error", "direct url fetch failed", { url: uri, error: err?.message });
          throw err;
        }
      },
      { retries: 3, minTimeout: 1500 }
    );
  }
  
  // For IPFS URLs, try multiple gateways
  return retry(
    async () => {
      let lastErr;
      for (const gw of IPFS_GATEWAYS) {
        const url = gatewayUrl(uri, gw);
        try {
          const res = await fetch(url);
          if (!res.ok) {
            lastErr = new Error(`HTTP ${res.status}`);
            continue;
          }
          const arrayBuf = await res.arrayBuffer();
          const buf = Buffer.from(arrayBuf);
          return buf;
        } catch (err) {
          lastErr = err;
          log("warn", "fetch failed", { url, error: err?.message });
        }
      }
      throw lastErr || new Error("all gateways failed");
    },
    { retries: 3, minTimeout: 1500 }
  );
}

/**
 * Extract address from PDF text
 * Looks for pattern: "Registered owner" followed by address lines
 * Stops at Canadian postal code (format: A1A 1A1)
 */
function extractAddress(text) {
  try {
    // Remove extra whitespace and normalize
    const normalized = text.replace(/\r\n/g, "\n").replace(/\s+/g, " ");
    
    // Pattern: Registered Owner/Mailing Address up to and including Canadian postal code
    // Canadian postal code format: Letter-Digit-Letter Space Digit-Letter-Digit
    const addressPattern = /Registered Owner\/Mailing Address:\s*(.+?[A-Z]\d[A-Z]\s*\d[A-Z]\d)/i;
    const match = normalized.match(addressPattern);
    
    if (match) {
      let addressText = match[1].trim();
      
      // Clean up: remove multiple spaces, keep comma separation
      addressText = addressText.replace(/\s+/g, " ");
      
      // If there are line breaks in the original, try to preserve structure
      const lines = addressText.split(/\s{2,}|\n+/);
      if (lines.length > 1) {
        addressText = lines.map(l => l.trim()).filter(Boolean).join(", ");
      }
      
      return addressText;
    }
    
    // Fallback: Look for company name through postal code pattern
    const fullPattern = /([A-Z\s&,.']+(?:INC\.|CORPORATION|LTD\.).*?[A-Z]\d[A-Z]\s*\d[A-Z]\d)/i;
    const fallbackMatch = text.match(fullPattern);
    
    if (fallbackMatch) {
      return fallbackMatch[0].replace(/\s+/g, " ").trim();
    }
    
    return "";
  } catch (err) {
    log("error", "address.extraction.error", { error: err?.message });
    return "";
  }
}

/**
 * Extract full address for permit lookup
 * Extracts complete address including city and postal code from "Location of Permit" section
 * Example: "2709 E 8TH AVENUE Vancouver, BC V5M 1W7"
 */
function extractPermitAddress(text) {
  try {
    // Remove extra whitespace and normalize
    const normalized = text.replace(/\r\n/g, "\n").replace(/\s+/g, " ");
    
    // Pattern 1: Look for "Location of Permit" section - captures full address with postal code
    // More specific: looks for street pattern starting with 1-5 digit house number
    const locationPattern = /Location of Permit[:\s]+(\d{1,5}\s+(?:[EWNS]\s+)?[0-9A-Z]+(?:TH|ST|ND|RD)?\s+(?:STREET|ST|AVENUE|AVE|ROAD|RD|DRIVE|DR|WAY|BOULEVARD|BLVD|LANE|LN)\s+Vancouver,\s*BC\s+[A-Z]\d[A-Z]\s*\d[A-Z]\d)/i;
    let match = normalized.match(locationPattern);
    
    if (match) {
      return match[1].trim();
    }
    
    // Pattern 2: Look for address with directional prefix (E, W, N, S) before street name
    // This pattern is more specific to avoid capturing extra numbers
    const directionalPattern = /\b(\d{1,5}\s+[EWNS]\s+\d+(?:TH|ST|ND|RD)\s+(?:STREET|AVENUE|AVE|ROAD|RD|DRIVE|DR|WAY|BOULEVARD|BLVD|LANE|LN)\s+Vancouver,\s*BC\s+[A-Z]\d[A-Z]\s*\d[A-Z]\d)\b/i;
    match = normalized.match(directionalPattern);
    
    if (match) {
      return match[1].trim();
    }
    
    // Pattern 3: Look for full address pattern with Vancouver, BC and postal code
    // General pattern for addresses without directional prefix
    const fullAddressPattern = /\b(\d{1,5}\s+[A-Z][A-Z0-9\s]+(?:STREET|ST|AVENUE|AVE|ROAD|RD|DRIVE|DR|WAY|BOULEVARD|BLVD|LANE|LN)\s+Vancouver,\s*BC\s+[A-Z]\d[A-Z]\s*\d[A-Z]\d)\b/i;
    match = normalized.match(fullAddressPattern);
    
    if (match) {
      return match[1].trim();
    }
    
    return "";
  } catch (err) {
    console.error("street.address.extraction.error", err?.message);
    return "";
  }
}

// Test the function
const testText = `
Some text 1643 other info
Location of Permit 2709 E 8TH AVENUE Vancouver, BC V5M 1W7
More text
`;

console.log("Extracted:", extractPermitAddress(testText));

/**
 * Query Vancouver Open Data API for building permits
 */
async function queryVancouverPermits(address, permitType) {
  try {
    const baseUrl = "https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/issued-building-permits/records";
    
    // Build WHERE clause conditions
    const whereConditions = [];
    
    // Add permit type filter
    if (permitType) {
      whereConditions.push(`typeofwork="${permitType}"`);
    }
    
    // Add address filter using wildcard operator
    if (address) {
      // Use * as wildcard for the API's FQL language
      whereConditions.push(`address like '*${address}*'`);
    }
    
    const whereClause = whereConditions.join(" AND ");
    
    // Build URL with proper encoding
    let url = baseUrl + "?limit=10";
    
    if (whereClause) {
      url += "&where=" + encodeURIComponent(whereClause);
    }
    
    log("info", "querying vancouver api", { url, address, permitType });
    
    // Make the fetch request directly without retry wrapper
    // to debug what's happening
    const res = await fetch(url);
    
    if (!res.ok) {
      log("error", "api http error", { 
        status: res.status, 
        statusText: res.statusText,
        url 
      });
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    let response;
    try {
      response = await res.json();
    } catch (parseErr) {
      log("error", "api json parse error", { 
        error: parseErr?.message,
        contentType: res.headers.get("content-type")
      });
      throw parseErr;
    }
    
    log("debug", "api raw response", { response });
    
    if (!response) {
      log("error", "api response is null/undefined", { response });
      return { success: false, permits: [] };
    }
    
    if (!Array.isArray(response.results)) {
      log("warn", "invalid api response structure", { 
        response,
        hasResults: "results" in response,
        resultsIsArray: Array.isArray(response.results)
      });
      return { success: false, permits: [] };
    }
    
    const permits = response.results;
    log("info", "api query result", { 
      permitCount: permits.length,
      address,
      permitType
    });
    
    return {
      success: permits.length > 0,
      permits: permits.map(p => ({
        permitNumber: p.permitnumber || "",
        permitType: p.typeofwork || "",
        issueDate: p.issuedate || "",
        address: p.address || "",
        projectValue: p.projectvalue || 0
      }))
    };
    
  } catch (err) {
    log("error", "vancouver api query failed", { 
      error: err?.message,
      stack: err?.stack,
      address, 
      permitType 
    });
    return { success: false, permits: [] };
  }
}

/**
 * Verify permit document by querying Vancouver API
 */
async function verifyPermitDocument(pdfBuf, docId, meta) {
  try {
    // Parse PDF to extract text
    const data = await pdfParse(pdfBuf);
    const text = data.text;
    
    log("debug", "pdf.text.extracted", { 
      jobId: meta.jobId, 
      docId,
      textLength: text.length,
      preview: text.substring(0, 200) 
    });
    
    // Extract street address from PDF
    const address = extractPermitAddress(text);
    
    if (!address) {
      log("warn", "street.address.not.found", { jobId: meta.jobId, docId });
      return { success: false, extractedText: "" };
    }
    
    log("info", "street.address.extracted", { 
      jobId: meta.jobId,
      docId,
      address: address 
    });
    
    // Get permit type for this docId
    const permitType = PERMIT_TYPE_MAPPING[docId];
    
    if (!permitType) {
      log("warn", "unknown.permit.type", { jobId: meta.jobId, docId });
      return { success: false, extractedText: address };
    }
    
    // Query Vancouver API
    const apiResult = await queryVancouverPermits(address, permitType);
    
    if (!apiResult.success || apiResult.permits.length === 0) {
      log("warn", "permit.not.found.in.api", { 
        jobId: meta.jobId,
        docId,
        address,
        permitType
      });
      return { success: false, extractedText: address };
    }
    
    // Format permit information
    const permitInfo = apiResult.permits[0];
    const extractedText = `Address: ${permitInfo.address}, Permit: ${permitInfo.permitNumber}, Type: ${permitInfo.permitType}, Issued: ${permitInfo.issueDate}`;
    
    log("info", "permit.verified", { 
      jobId: meta.jobId,
      docId,
      permitInfo: extractedText
    });
    
    return { success: true, extractedText };
    
  } catch (err) {
    log("error", "permit.verification.error", { 
      jobId: meta.jobId,
      docId,
      error: err?.message 
    });
    return { success: false, extractedText: "" };
  }
}

/**
 * Verify title/ownership document and extract address
 */
async function verifyTitleDocument(pdfBuf, meta) {
  try {
    // Parse PDF to extract text
    const data = await pdfParse(pdfBuf);
    const text = data.text;
    
    log("debug", "pdf.text.extracted", { 
      jobId: meta.jobId, 
      textLength: text.length,
      preview: text.substring(0, 200) 
    });
    
    // Extract address from text
    const extractedAddress = extractAddress(text);
    
    if (!extractedAddress) {
      log("warn", "address.not.found", { jobId: meta.jobId });
      return { success: false, extractedText: "" };
    }
    
    log("info", "address.extracted", { 
      jobId: meta.jobId, 
      address: extractedAddress 
    });
    
    // Verification succeeds if we found an address
    return { success: true, extractedText: extractedAddress };
    
  } catch (err) {
    log("error", "verification.error", { 
      jobId: meta.jobId, 
      error: err?.message 
    });
    return { success: false, extractedText: "" };
  }
}

/**
 * Route to appropriate verification function based on DocID
 */
async function verifyDocument(pdfBuf, docId, meta) {
  // DocIDs 5-8 are permit documents that need API verification
  if (docId >= DocID.DEMOLITION_PERMIT && docId <= DocID.OCCUPANCY_PERMIT) {
    return verifyPermitDocument(pdfBuf, docId, meta);
  }
  
  // DocIDs 0-3 and 8 use standard address extraction
  return verifyTitleDocument(pdfBuf, meta);
}

async function processJob(contract, event) {
  const [jobId, , docId, docUri, docHash] = event.args;
  const jobKey = jobId.toLowerCase();
  if (handlers.get(jobKey)) {
    return;
  }
  handlers.set(jobKey, true);

  const meta = {
    jobId,
    docId: Number(docId),
    docUri,
    docHash,
  };

  log("info", "job.received", meta);
  try {
    const pdfBuf = await fetchPdf(docUri);
    const rehashed = ethers.keccak256(pdfBuf);
    if (rehashed !== ethers.hexlify(docHash)) {
      throw new Error(`docHash mismatch: expected ${docHash}, got ${rehashed}`);
    }
    
    const { success, extractedText } = await verifyDocument(pdfBuf, meta.docId, meta);
    
    const tx = await contract
      .connect(signer)
      .setVerificationResult(jobId, docHash, success, extractedText);
    await tx.wait();
    
    log("info", "job.completed", { 
      ...meta, 
      txHash: tx.hash, 
      success, 
      extractedText 
    });
  } catch (err) {
    log("error", "job.failed", { ...meta, error: err?.message });
  } finally {
    handlers.delete(jobKey);
  }
}

async function attachProject(addr) {
  const address = ethers.getAddress(addr);
  if (attachedProjects.has(address)) return;
  attachedProjects.add(address);
  const contract = new ethers.Contract(address, VERIFICATION_ABI, provider);
  contract.on("VerificationRequested", (...args) => {
    const event = args[args.length - 1];
    processJob(contract, event);
  });
  log("info", "project.listen", { address });
}

async function main() {
  log("info", "starting worker", {
    signer: await signer.getAddress(),
    registry: REGISTRY_ADDRESS || null,
    projectsSeed: PROJECT_ADDRESSES,
    gateways: IPFS_GATEWAYS,
    startBlock: START_BLOCK,
  });

  // Seed with configured projects
  for (const addr of PROJECT_ADDRESSES) {
    await attachProject(addr);
  }

  // Discover from registry: backfill + live
  if (REGISTRY_ADDRESS) {
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
    
    // Backfill existing projects in chunks to avoid Alchemy rate limits
    try {
      const filter = registry.filters.ProjectCreated();
      const latestBlock = await provider.getBlockNumber();
      const startBlock = START_BLOCK || latestBlock;
      const CHUNK_SIZE = 10; // Alchemy free tier limit
      
      let allEvents = [];
      
      // Only backfill if we're not starting from latest
      if (startBlock < latestBlock) {
        for (let from = startBlock; from <= latestBlock; from += CHUNK_SIZE) {
          const to = Math.min(from + CHUNK_SIZE - 1, latestBlock);
          try {
            const events = await registry.queryFilter(filter, from, to);
            allEvents = allEvents.concat(events);
            if (LOG_LEVEL === "debug") {
              log("debug", "registry.backfill.chunk", { from, to, count: events.length });
            }
          } catch (err) {
            log("warn", "registry.backfill.chunk.error", { from, to, error: err?.message });
          }
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      for (const ev of allEvents) {
        const addr = ev.args[0];
        await attachProject(addr);
      }
      log("info", "registry.backfill.complete", { count: allEvents.length });
    } catch (err) {
      log("warn", "registry.backfill.error", { error: err?.message });
    }

    // Live subscription
    registry.on("ProjectCreated", async (project, _token, _creator, _uri) => {
      await attachProject(project);
    });
    log("info", "registry.listen", { address: REGISTRY_ADDRESS });
  }
}

if (require.main === module) {
  main().catch((err) => {
    log("error", "fatal", { error: err?.message });
    process.exit(1);
  });
}

module.exports = { extractAddress, extractPermitAddress, queryVancouverPermits };