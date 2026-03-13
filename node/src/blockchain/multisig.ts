/**
 * AXON Multi-Sig (P2SH — Pay to Script Hash)
 *
 * M-of-N threshold signatures.
 * Compatible with the existing P2PKH UTXO model.
 *
 * Script format:
 *   redeemScript:  OP_M <pubkey1> ... <pubkeyN> OP_N OP_CHECKMULTISIG
 *   scriptPubKey:  OP_HASH160 <hash160(redeemScript)> OP_EQUAL
 *   scriptSig:     OP_0 <sig1> ... <sigM> <redeemScript>
 */

import * as crypto from 'crypto';
import { ec as EC } from 'elliptic';

const ec = new EC('secp256k1');

// ── Opcodes ───────────────────────────────────────────────────────────────────
export const OP_0             = 0x00;
export const OP_1             = 0x51;   // OP_1 through OP_16 = 0x51–0x60
export const OP_16            = 0x60;
export const OP_HASH160       = 0xa9;
export const OP_EQUAL         = 0x87;
export const OP_CHECKMULTISIG = 0xae;
export const OP_EQUALVERIFY   = 0x88;
export const OP_DUP           = 0x76;
export const OP_CHECKSIG      = 0xac;

function opN(n: number): number {
  if (n < 1 || n > 16) throw new Error(`OP_N: n must be 1–16, got ${n}`);
  return OP_1 + (n - 1);
}

function pushData(buf: Buffer): Buffer {
  if (buf.length < 0x4c) {
    return Buffer.concat([Buffer.from([buf.length]), buf]);
  }
  if (buf.length <= 0xff) {
    return Buffer.concat([Buffer.from([0x4c, buf.length]), buf]);
  }
  throw new Error('Push data too large');
}

function hash160(buf: Buffer): Buffer {
  const sha = crypto.createHash('sha256').update(buf).digest();
  return crypto.createHash('ripemd160').update(sha).digest();
}

// ── Build redeem script ───────────────────────────────────────────────────────

/**
 * Build an M-of-N redeem script.
 * @param m  Required signatures
 * @param publicKeys  Compressed public keys (hex strings), N total
 */
export function buildRedeemScript(m: number, publicKeys: string[]): Buffer {
  const n = publicKeys.length;
  if (m < 1 || m > n || n > 16) {
    throw new Error(`Invalid M-of-N: ${m}-of-${n}`);
  }

  const parts: Buffer[] = [Buffer.from([opN(m)])];
  for (const pk of publicKeys) {
    parts.push(pushData(Buffer.from(pk, 'hex')));
  }
  parts.push(Buffer.from([opN(n)]));
  parts.push(Buffer.from([OP_CHECKMULTISIG]));

  return Buffer.concat(parts);
}

/**
 * Build scriptPubKey for a P2SH address.
 * Format: OP_HASH160 <20-byte-hash> OP_EQUAL
 */
export function buildP2SHScript(redeemScript: Buffer): Buffer {
  const h = hash160(redeemScript);
  return Buffer.concat([
    Buffer.from([OP_HASH160]),
    pushData(h),
    Buffer.from([OP_EQUAL]),
  ]);
}

/**
 * Derive the P2SH address from a redeem script.
 * Format: axonS1<hash160hex>  (S = script)
 */
export function redeemScriptToAddress(redeemScript: Buffer): string {
  return 'axonS1' + hash160(redeemScript).toString('hex');
}

// ── Create multi-sig address ──────────────────────────────────────────────────

export interface MultiSigWallet {
  m:             number;
  n:             number;
  publicKeys:    string[];
  redeemScript:  string;   // hex
  scriptPubKey:  string;   // hex
  address:       string;   // axonS1...
}

export function createMultiSig(m: number, publicKeys: string[]): MultiSigWallet {
  const redeemScript = buildRedeemScript(m, publicKeys);
  const scriptPubKey = buildP2SHScript(redeemScript);
  return {
    m,
    n:            publicKeys.length,
    publicKeys,
    redeemScript: redeemScript.toString('hex'),
    scriptPubKey: scriptPubKey.toString('hex'),
    address:      redeemScriptToAddress(redeemScript),
  };
}

// ── Sign a multi-sig transaction ──────────────────────────────────────────────

/**
 * Sign a message hash with a private key.
 * Returns DER-encoded signature hex (SIGHASH_ALL appended).
 */
export function signMultiSig(txHash: Buffer, privateKeyHex: string): string {
  const keyPair = ec.keyFromPrivate(privateKeyHex, 'hex');
  const sig = keyPair.sign(txHash, { canonical: true });
  const der = Buffer.from(sig.toDER());
  // Append SIGHASH_ALL byte
  return Buffer.concat([der, Buffer.from([0x01])]).toString('hex');
}

/**
 * Verify a multi-sig signature.
 */
export function verifyMultiSigSig(
  txHash: Buffer,
  signatureHex: string,
  publicKeyHex: string,
): boolean {
  try {
    const keyPair = ec.keyFromPublic(publicKeyHex, 'hex');
    // Strip SIGHASH byte
    const sigBuf = Buffer.from(signatureHex, 'hex');
    const der = sigBuf.slice(0, sigBuf.length - 1);
    return keyPair.verify(txHash, der);
  } catch {
    return false;
  }
}

/**
 * Build the scriptSig for a P2SH multi-sig spend.
 * Format: OP_0 <sig1> ... <sigM> <redeemScript>
 * Signatures must be in the same order as their corresponding public keys.
 */
export function buildMultiSigScriptSig(
  signatures: string[],
  redeemScript: string,
): string {
  const parts: Buffer[] = [Buffer.from([OP_0])];
  for (const sig of signatures) {
    parts.push(pushData(Buffer.from(sig, 'hex')));
  }
  const rs = Buffer.from(redeemScript, 'hex');
  parts.push(pushData(rs));
  return Buffer.concat(parts).toString('hex');
}

// ── Validate multi-sig scriptSig ──────────────────────────────────────────────

/**
 * Validate a multi-sig spend against its redeem script.
 * Returns { valid, errors }
 */
export function validateMultiSig(
  txHash: Buffer,
  scriptSigHex: string,
  redeemScriptHex: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    const rs = Buffer.from(redeemScriptHex, 'hex');

    // Parse redeem script: OP_M pubkeys... OP_N OP_CHECKMULTISIG
    let offset = 0;
    const m = rs[offset++] - OP_1 + 1;
    const pubkeys: string[] = [];

    while (offset < rs.length - 2) {
      const len = rs[offset++];
      const pk = rs.slice(offset, offset + len).toString('hex');
      pubkeys.push(pk);
      offset += len;
    }

    const n = rs[offset++] - OP_1 + 1;
    const checkMultisig = rs[offset];

    if (checkMultisig !== OP_CHECKMULTISIG) {
      errors.push('Redeem script missing OP_CHECKMULTISIG');
      return { valid: false, errors };
    }

    if (pubkeys.length !== n) {
      errors.push(`Expected ${n} public keys, got ${pubkeys.length}`);
      return { valid: false, errors };
    }

    // Parse scriptSig: OP_0 sigs... redeemScript
    const ss = Buffer.from(scriptSigHex, 'hex');
    let ssOffset = 0;
    if (ss[ssOffset++] !== OP_0) {
      errors.push('scriptSig must start with OP_0');
      return { valid: false, errors };
    }

    const sigs: string[] = [];
    while (ssOffset < ss.length) {
      let len: number;
      const first = ss[ssOffset++];
      if (first === 0x4c) {
        // OP_PUSHDATA1 — next byte is the length
        len = ss[ssOffset++];
      } else {
        len = first;
      }
      if (len === 0 || ssOffset + len > ss.length) break;
      const chunk = ss.slice(ssOffset, ssOffset + len).toString('hex');
      sigs.push(chunk);
      ssOffset += len;
    }

    // Last chunk is the redeemScript, remove it
    const embeddedRS = sigs.pop();
    if (embeddedRS !== redeemScriptHex) {
      errors.push('Embedded redeem script does not match');
      return { valid: false, errors };
    }

    if (sigs.length < m) {
      errors.push(`Need ${m} signatures, got ${sigs.length}`);
      return { valid: false, errors };
    }

    // Verify each signature against public keys in order
    let pkIdx = 0;
    let validSigs = 0;
    for (const sig of sigs) {
      while (pkIdx < pubkeys.length) {
        if (verifyMultiSigSig(txHash, sig, pubkeys[pkIdx++])) {
          validSigs++;
          break;
        }
      }
    }

    if (validSigs < m) {
      errors.push(`Only ${validSigs} valid signatures, need ${m}`);
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  } catch (err: any) {
    errors.push('Validation error: ' + err.message);
    return { valid: false, errors };
  }
}
