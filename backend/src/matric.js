const { ethers } = require("ethers");

// Babcock matric format: two digits, slash, four digits -> "00/0000"
const MATRIC_RE = /^\d{2}\/\d{4}$/;

function normalizeMatric(raw) {
  return String(raw || "").trim();
}

function isValidMatric(matric) {
  return MATRIC_RE.test(matric);
}

// Must match BVS.matricHashOf: keccak256(abi.encodePacked(string)) == keccak256(utf8 bytes)
function matricHash(matric) {
  return ethers.keccak256(ethers.toUtf8Bytes(matric));
}

module.exports = { normalizeMatric, isValidMatric, matricHash, MATRIC_RE };
