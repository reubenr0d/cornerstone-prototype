// Temporary constructor args for CornerstoneProject verification
// Order:
// (address developer, address usdc, string name, string symbol,
//  uint256 minRaise, uint256 maxRaise, uint256 fundraiseDeadline,
//  uint256[6] phaseAPRsBps, uint256[6] phaseDurations, uint256[6] phaseCapsBps)

module.exports = [
  "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9", // developer
  "0x5FbDB2315678afecb367f032d93F642f64180aa3", // usdc
  "Cornerstone-asd", // name
  "CST-ASD", // symbol
  100000000, // minRaise
  1000000000000, // maxRaise
  1763105804, // fundraiseDeadline (unix seconds)
  [0, 1500, 1200, 900, 500, 300], // phaseAPRsBps (0..5)
  [0, 0, 0, 0, 0, 0], // phaseDurations (0..5)
  [0, 500, 500, 1000, 3000, 0], // phaseCapsBps (0..5)
];
