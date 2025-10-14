// ABI exports sourced directly from sibling contracts artifacts
// Vite server.fs.allow permits reading outside project root

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - JSON imports with .abi property
import CornerstoneProjectJson from '../../../contracts/artifacts/src/core/CornerstoneProject.sol/CornerstoneProject.json';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import ProjectRegistryJson from '../../../contracts/artifacts/src/core/ProjectRegistry.sol/ProjectRegistry.json';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import IERC20Json from '../../../contracts/artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json';

export const CornerstoneProjectABI = (CornerstoneProjectJson as any).abi as any;
export const ProjectRegistryABI = (ProjectRegistryJson as any).abi as any;
export const ERC20ABI = (IERC20Json as any).abi as any;
