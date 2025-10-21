// ABI exports shipped with the frontend to avoid requiring a contracts compile in CI.
import CornerstoneProjectArtifact from './CornerstoneProject.json';
import ProjectRegistryArtifact from './ProjectRegistry.json';
import IERC20Artifact from './IERC20.json';
import TokenFaucetArtifact from './TokenFaucet.json';

type ArtifactWithAbi = { abi: unknown };

// Helper to extract ABI from either raw ABI array or Hardhat artifact
function extractAbi(artifact: unknown): unknown {
  if (Array.isArray(artifact)) {
    return artifact;
  }
  if (artifact && typeof artifact === 'object' && 'abi' in artifact) {
    return (artifact as ArtifactWithAbi).abi;
  }
  throw new Error('Invalid ABI artifact format');
}

export const CornerstoneProjectABI = extractAbi(CornerstoneProjectArtifact);
export const ProjectRegistryABI = extractAbi(ProjectRegistryArtifact);
export const ERC20ABI = extractAbi(IERC20Artifact);
export const TokenFaucetABI = extractAbi(TokenFaucetArtifact);
