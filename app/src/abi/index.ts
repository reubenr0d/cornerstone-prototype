// ABI exports shipped with the frontend to avoid requiring a contracts compile in CI.
import CornerstoneProjectArtifact from './CornerstoneProject.json';
import ProjectRegistryArtifact from './ProjectRegistry.json';
import IERC20Artifact from './IERC20.json';

type ArtifactWithAbi = { abi: unknown };

export const CornerstoneProjectABI = (CornerstoneProjectArtifact as ArtifactWithAbi).abi;
export const ProjectRegistryABI = (ProjectRegistryArtifact as ArtifactWithAbi).abi;
export const ERC20ABI = (IERC20Artifact as ArtifactWithAbi).abi;
