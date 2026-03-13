/**
 * AXON Multi-Sig API
 * Create M-of-N wallets, collect signatures, broadcast spends
 */

import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import {
  createMultiSig,
  signMultiSig,
  verifyMultiSigSig,
  buildMultiSigScriptSig,
  validateMultiSig,
} from '../blockchain/multisig';

export function multiSigRouter(): Router {
  const router = Router();

  // ── POST /multisig/create ─────────────────────────────────────────────────
  // Create an M-of-N multi-sig address
  // Body: { m: number, publicKeys: string[] }
  // Returns: { address, redeemScript, scriptPubKey, m, n }
  router.post('/create', (req: Request, res: Response) => {
    try {
      const { m, publicKeys } = req.body || {};
      if (!m || !Array.isArray(publicKeys) || publicKeys.length < 1) {
        return res.status(400).json({
          success: false,
          error:   'm (number) and publicKeys (array) required',
        });
      }
      if (m > publicKeys.length) {
        return res.status(400).json({
          success: false,
          error:   `m (${m}) cannot exceed number of public keys (${publicKeys.length})`,
        });
      }

      const wallet = createMultiSig(Number(m), publicKeys);
      res.json({
        success:      true,
        address:      wallet.address,
        redeemScript: wallet.redeemScript,
        scriptPubKey: wallet.scriptPubKey,
        m:            wallet.m,
        n:            wallet.n,
        hint:         `Send AXN to ${wallet.address} — it requires ${wallet.m}-of-${wallet.n} signatures to spend`,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ── POST /multisig/sign ───────────────────────────────────────────────────
  // Sign a transaction hash for use in a multi-sig spend
  // Body: { txHash: string (hex), privateKey: string (hex) }
  // Returns: { signature }
  router.post('/sign', (req: Request, res: Response) => {
    try {
      const { txHash, privateKey } = req.body || {};
      if (!txHash || !privateKey) {
        return res.status(400).json({
          success: false,
          error:   'txHash (hex) and privateKey (hex) required',
        });
      }

      const hashBuf   = Buffer.from(txHash, 'hex');
      const signature = signMultiSig(hashBuf, privateKey);

      res.json({
        success:   true,
        signature,
        hint:      'Collect all required signatures then call /multisig/build to assemble the scriptSig',
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ── POST /multisig/verify-sig ─────────────────────────────────────────────
  // Verify a single signature against a public key
  // Body: { txHash, signature, publicKey }
  router.post('/verify-sig', (req: Request, res: Response) => {
    try {
      const { txHash, signature, publicKey } = req.body || {};
      if (!txHash || !signature || !publicKey) {
        return res.status(400).json({
          success: false,
          error:   'txHash, signature, and publicKey required',
        });
      }

      const valid = verifyMultiSigSig(
        Buffer.from(txHash, 'hex'),
        signature,
        publicKey,
      );

      res.json({ success: true, valid });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ── POST /multisig/build ──────────────────────────────────────────────────
  // Build the scriptSig from collected signatures + redeemScript
  // Body: { signatures: string[], redeemScript: string }
  // Returns: { scriptSig }
  router.post('/build', (req: Request, res: Response) => {
    try {
      const { signatures, redeemScript } = req.body || {};
      if (!Array.isArray(signatures) || !redeemScript) {
        return res.status(400).json({
          success: false,
          error:   'signatures (array) and redeemScript (hex) required',
        });
      }

      const scriptSig = buildMultiSigScriptSig(signatures, redeemScript);
      res.json({
        success:   true,
        scriptSig,
        hint:      'Use this scriptSig when broadcasting the spending transaction via POST /tx',
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ── POST /multisig/validate ───────────────────────────────────────────────
  // Validate a complete multi-sig scriptSig without broadcasting
  // Body: { txHash, scriptSig, redeemScript }
  // Returns: { valid, errors }
  router.post('/validate', (req: Request, res: Response) => {
    try {
      const { txHash, scriptSig, redeemScript } = req.body || {};
      if (!txHash || !scriptSig || !redeemScript) {
        return res.status(400).json({
          success: false,
          error:   'txHash, scriptSig, and redeemScript required',
        });
      }

      const result = validateMultiSig(
        Buffer.from(txHash, 'hex'),
        scriptSig,
        redeemScript,
      );

      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
