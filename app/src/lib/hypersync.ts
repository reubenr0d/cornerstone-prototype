import { ethers } from 'ethers';
import { Address } from './eth';

interface HyperSyncLog {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
  transactionHash?: string;
  logIndex?: string;
}

interface HyperSyncResponse {
  data?: Array<{
    logs?: HyperSyncLog[];
  }>;
}

export async function fetchPhaseDocsViaHyperSync(projectAddress: Address) {
  try {
    // PhaseClosed event signature
    const phaseClosedTopic = ethers.id("PhaseClosed(uint8,string[],bytes32[],string[])");

    const query = {
      from_block: 0,
      logs: [
        {
          address: [projectAddress.toLowerCase()],
          topics: [[phaseClosedTopic]]
        }
      ],
      field_selection: {
        log: [
          "block_number",
          "log_index",
          "transaction_hash",
          "data",
          "topics",
          "address"
        ]
      }
    };

    console.log('[hypersync] sending query:', JSON.stringify(query, null, 2));

    const response = await fetch('https://sepolia.hypersync.xyz/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(query)
    });

    const responseText = await response.text();
    console.log('[hypersync] response status:', response.status);

    if (!response.ok) {
      throw new Error(`HyperSync API error: ${response.status} - ${responseText}`);
    }

    const res: HyperSyncResponse = JSON.parse(responseText);

    // Create ABI coder to decode event data
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    const eventSignature = "event PhaseClosed(uint8 indexed phaseId, string[] docTypes, bytes32[] docHashes, string[] metadataURIs)";
    const iface = new ethers.Interface([eventSignature]);

    const docsByPhase: Array<{
      id: string;
      name: string;
      type: 'image' | 'pdf';
      url: string;
      hash: string;
    }>[] = [[], [], [], [], [], []];

    if (res.data && Array.isArray(res.data)) {
      let allLogs: HyperSyncLog[] = [];

      for (const container of res.data) {
        if (container?.logs && Array.isArray(container.logs)) {
          allLogs = allLogs.concat(container.logs);
        }
      }

      if (allLogs.length > 0) {
        console.log('[hypersync] found logs:', allLogs.length);

        allLogs.sort((a, b) => {
          const blockA = Number(a.blockNumber || 0);
          const blockB = Number(b.blockNumber || 0);
          return blockA - blockB;
        });

        let currentPhaseId = 0;

        for (const log of allLogs) {
          try {
            if (!log.data) {
              console.warn('[hypersync] log missing data');
              continue;
            }

            const phaseId = currentPhaseId;
            currentPhaseId++;

            console.log('[hypersync] assigned phaseId:', phaseId);

            if (phaseId < 0 || phaseId > 5) {
              console.warn('[hypersync] phaseId out of range:', phaseId);
              continue;
            }

            console.log('[hypersync] proceeding with phaseId:', phaseId);

            // Decode only the non-indexed parameters from data
            // Event: PhaseClosed(uint8 indexed phaseId, string[] docTypes, bytes32[] docHashes, string[] metadataURIs)
            const decoded = abiCoder.decode(
              ['string[]', 'bytes32[]', 'string[]'],
              log.data
            );

            const docTypes = Array.from(decoded[0] || [], (t: any) => 
              typeof t === 'string' ? t : String(t)
            );
            const docHashes = Array.from(decoded[1] || [], (h: any) => 
              typeof h === 'string' ? h : String(h)
            );
            const metadataURIs = Array.from(decoded[2] || [], (u: any) => 
              typeof u === 'string' ? u : String(u)
            );

            console.log('[hypersync] phase', phaseId, 'docs:', docTypes.length);

            const phaseDocs = [];
            for (let i = 0; i < docTypes.length; i++) {
              const docType = docTypes[i] || 'unknown';
              const hash = docHashes[i] || '0x';
              const uri = metadataURIs[i] || '';

              const isImage = docType.includes('image') || uri.includes('image') || 
                             ['jpg', 'jpeg', 'png', 'gif', 'webp'].some(ext => 
                               uri.toLowerCase().includes(ext)
                             );

              phaseDocs.push({
                id: `phase${phaseId}-doc${i}-${hash.slice(0, 10)}`,
                name: uri.split('/').at(-1) || `Document ${i + 1}`,
                type: isImage ? 'image' as const : 'pdf' as const,
                url: uri.startsWith('ipfs://') 
                  ? `https://ipfs.io/ipfs/${uri.replace('ipfs://', '')}` 
                  : uri || 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                hash: hash,
              });
            }

            docsByPhase[phaseId] = phaseDocs;
          } catch (parseError) {
            console.error('[hypersync] failed to parse log:', parseError);
          }
        }
      } else {
        console.log('[hypersync] no logs found in response');
      }
    } else {
      console.log('[hypersync] no logs found in response');
    }

    return docsByPhase;
  } catch (error) {
    console.error('[hypersync] fetch failed:', error);
    throw error;
  }
}