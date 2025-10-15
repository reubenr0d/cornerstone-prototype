// Temporary constructor args for CornerstoneProject verification
// Order:
// (address developer, address usdc, string name, string symbol,
//  uint256 minRaise, uint256 maxRaise, uint256 fundraiseDeadline,
//  uint256[6] phaseAPRsBps, uint256[6] phaseDurations, uint256[6] phaseCapsBps)

module.exports = [
  "0x218F56910B3d1265c72c8b53A207f045fe7f5042", // developer
  "0xA5Da203704c02D008476c233da56CfF1D1a7650B", // usdc
  "Cornerstone-ree", // name
  "CST-REE", // symbol
  1000000000, // minRaise
  10000000000000, // maxRaise
  1763131837, // fundraiseDeadline (unix seconds)
  [0, 1500, 1200, 900, 500, 300], // phaseAPRsBps (0..5)
  [0, 0, 0, 0, 0, 0], // phaseDurations (0..5)
  [5000, 500, 500, 1000, 3000, 0], // phaseCapsBps (0..5)
];
