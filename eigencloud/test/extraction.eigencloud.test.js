const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

// Mock the dependencies that cause issues
jest.mock("p-retry", () => ({
  default: jest.fn()
}));

jest.mock("ethers", () => ({
  ethers: {
    JsonRpcProvider: jest.fn(),
    Wallet: jest.fn(),
    Contract: jest.fn(),
    getAddress: jest.fn(),
    keccak256: jest.fn(),
    hexlify: jest.fn()
  }
}));

// Now require the worker module after mocks are set up
const { extractAddress } = require("../src/worker");

describe("Address Extraction", () => {
  describe("extractAddress function", () => {
    test("should extract address with Registered Owner/Mailing Address pattern", () => {
      const sampleText = `
        Some preamble text
        Registered Owner/Mailing Address: SEKIGO DEVELOPMENTS CORPORATION, INC.NO. BC1234606 PO BOX 97198 DELTA RPO SCOTTSDALE MALL, BC V4E 0A7
        Some other text
      `;
      
      const result = extractAddress(sampleText);
      expect(result).toContain("SEKIGO DEVELOPMENTS CORPORATION");
      expect(result).toContain("PO BOX 97198");
      expect(result).toContain("V4E 0A7");
    });

    test("should extract address from actual PDF document", async () => {
      // Path to the sample PDF document (from tests/ to documents/)
      const pdfPath = path.join(__dirname, "..", "..", "documents", "title.pdf");
      
      // Check if file exists
      if (!fs.existsSync(pdfPath)) {
        console.warn(`PDF file not found at ${pdfPath}, skipping test`);
        return;
      }
      
      // Read and parse the PDF
      const dataBuffer = fs.readFileSync(pdfPath);
      const data = await pdfParse(dataBuffer);
      const text = data.text;
      
      // Extract address
      const extractedAddress = extractAddress(text);
      
      // Verify the extracted address matches expected format
      expect(extractedAddress).toBeTruthy();
      expect(extractedAddress.length).toBeGreaterThan(0);
      
      // Check for key components from the sample address
      expect(extractedAddress).toContain("SEKIGO DEVELOPMENTS CORPORATION");
      expect(extractedAddress).toContain("BC1234606");
      expect(extractedAddress).toContain("PO BOX 97198");
      expect(extractedAddress).toContain("DELTA RPO SCOTTSDALE MALL");
      expect(extractedAddress).toContain("V4E 0A7");
      
      console.log("Extracted address:", extractedAddress);
    });

    test("should return empty string for text without address pattern", () => {
      const textWithoutAddress = "This is some random text without any address information";
      const result = extractAddress(textWithoutAddress);
      expect(result).toBe("");
    });

    test("should handle text with Canadian postal code format", () => {
      const textWithPostalCode = `
        Registered Owner/Mailing Address: ACME CORPORATION 123 MAIN ST VANCOUVER, BC V6B 2W9
      `;
      const result = extractAddress(textWithPostalCode);
      expect(result).toContain("ACME CORPORATION");
      expect(result).toContain("V6B 2W9");
    });

    test("should handle fallback pattern for company names", () => {
      const textWithCompany = `
        Some text EXAMPLE CORPORATION, INC. 456 TEST AVENUE TORONTO, ON M5H 2N2 more text
      `;
      const result = extractAddress(textWithCompany);
      expect(result).toContain("EXAMPLE CORPORATION");
      expect(result).toContain("M5H 2N2");
    });
  });
});