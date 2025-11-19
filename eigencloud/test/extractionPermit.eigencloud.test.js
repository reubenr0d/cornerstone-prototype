const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

// Mock fetch FIRST before requiring anything else
global.fetch = jest.fn();

// Mock retry to pass through the function calls
jest.mock("p-retry", () => {
  return {
    default: jest.fn((fn, options) => fn()),
    __esModule: true
  };
});

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
const { extractPermitAddress, queryVancouverPermits } = require("../src/worker");

describe("Permit Address Extraction and API Query", () => {
  describe("queryVancouverPermits API function", () => {
    beforeEach(() => {
      fetch.mockClear();
    });

    test("should successfully query API with address and permit type", async () => {
      const mockResponse = {
        results: [
          {
            permitnumber: "DB-2021-05595",
            typeofwork: "New Building",
            issuedate: "2022-03-14",
            address: "2709 E 8TH AVENUE",
            projectvalue: 15000
          }
        ]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([["content-type", "application/json"]]),
        json: async () => mockResponse
      });

      const result = await queryVancouverPermits(
        "2709 E 8TH AVENUE Vancouver, BC V5M 1W7",
        "Demolition / Deconstruction"
      );

      expect(result.success).toBe(true);
      expect(result.permits).toHaveLength(1);
      expect(result.permits[0].permitNumber).toBe("DB-2021-05595");
    });

    test("should handle API returning no results", async () => {
      const mockResponse = {
        results: []
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([["content-type", "application/json"]]),
        json: async () => mockResponse
      });

      const result = await queryVancouverPermits(
        "9999 NONEXISTENT STREET Vancouver, BC V6B 1A1",
        "Demolition / Deconstruction"
      );

      expect(result.success).toBe(false);
      expect(result.permits).toHaveLength(0);
    });

    test("should handle HTTP error responses", async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error"
      });

      const result = await queryVancouverPermits(
        "2709 E 8TH AVENUE Vancouver, BC V5M 1W7",
        "Demolition / Deconstruction"
      );

      expect(result.success).toBe(false);
    });
  });

  describe("extractPermitAddress function", () => {
    test("should extract address from building permit PDF", async () => {
      const pdfPath = path.join(__dirname, "..", "..", "documents", "building_permit.pdf");
      
      if (!fs.existsSync(pdfPath)) {
        console.warn(`PDF file not found at ${pdfPath}, skipping test`);
        return;
      }
      
      const dataBuffer = fs.readFileSync(pdfPath);
      const data = await pdfParse(dataBuffer);
      const text = data.text;
      
      const extractedAddress = extractPermitAddress(text);
      expect(extractedAddress).toBeTruthy();
      expect(extractedAddress).toContain("Vancouver");
      expect(extractedAddress).toContain("BC");
    });

    test("should extract address with directional prefix", () => {
      const text = "Location of Permit 2709 E 8TH AVENUE Vancouver, BC V5M 1W7";
      const result = extractPermitAddress(text);
      expect(result).toBe("2709 E 8TH AVENUE Vancouver, BC V5M 1W7");
    });

    test("should handle normalized whitespace", () => {
      const text = "Location of Permit    2709    E    8TH    AVENUE    Vancouver,    BC    V5M    1W7";
      const result = extractPermitAddress(text);
      expect(result).toContain("2709 E 8TH AVENUE");
      expect(result).toContain("Vancouver, BC V5M 1W7");
    });
  });

  describe("Integration: Address extraction + API query", () => {
    beforeEach(() => {
      fetch.mockClear();
    });

    test("should extract address and query API", async () => {
      const pdfText = `
        City of Vancouver
        Location of Permit 2709 E 8TH AVENUE Vancouver, BC V5M 1W7
        Demolition permit details...
      `;

      const mockApiResponse = {
        results: [
          {
            permitnumber: "DB-2021-05595",
            typeofwork: "Demolition / Deconstruction",
            issuedate: "2022-03-14",
            address: "2709 E 8TH AVENUE",
            projectvalue: 15000
          }
        ]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([["content-type", "application/json"]]),
        json: async () => mockApiResponse
      });

      const extractedAddress = extractPermitAddress(pdfText);
      expect(extractedAddress).toBe("2709 E 8TH AVENUE Vancouver, BC V5M 1W7");

      const apiResult = await queryVancouverPermits(
        extractedAddress,
        "Demolition / Deconstruction"
      );

      expect(apiResult.success).toBe(true);
      expect(apiResult.permits[0].permitNumber).toBe("DB-2021-05595");
    });
  });
});