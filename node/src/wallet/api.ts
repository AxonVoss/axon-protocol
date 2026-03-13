/**
 * AXON Wallet API — designed for AI agents
 * Clean REST endpoints, JSON in/out, no UI required
 */

import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import {
  generateWallet,
  keypairFromMnemonic,
  signTx,
  verifyTxSig,
  formatAXN,
} from './wallet';

export function walletRouter(): Router {
  const router = Router();

  // ── POST /wallet/new ────────────────────────────────────────────────────────
  // Generate a new AXON wallet
  // Body: { passphrase?: string }
  // Returns: { address, mnemonic, encrypted, warning }
  router.post('/new', (req: Request, res: Response) => {
    try {
      const passphrase = req.body?.passphrase || '';
      const w = generateWallet();
      res.json({
        success:   true,
        address:   w.keypair.address,
        mnemonic:  w.mnemonic,
        path:      `m/44'/7777'/0'/0/0`,
        warning:   '⚠️ Save your mnemonic. It cannot be recovered. Never share it.',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── POST /wallet/recover ────────────────────────────────────────────────────
  // Recover wallet from mnemonic
  // Body: { mnemonic: string }
  // Returns: { address, path }
  router.post('/recover', (req: Request, res: Response) => {
    try {
      const { mnemonic } = req.body || {};
      if (!mnemonic) return res.status(400).json({ success: false, error: 'mnemonic required' });
      const kp = keypairFromMnemonic(mnemonic.trim());
      res.json({
        success: true,
        address: kp.address,
        path:    `m/44'/7777'/0'/0/0`,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: 'Invalid mnemonic: ' + err.message });
    }
  });

  // ── POST /wallet/sign ───────────────────────────────────────────────────────
  // Sign an arbitrary message with a private key
  // Body: { message: string, privateKey: string }
  // Returns: { signature, address }
  router.post('/sign', (req: Request, res: Response) => {
    try {
      const { message, privateKey } = req.body || {};
      if (!message || !privateKey) {
        return res.status(400).json({ success: false, error: 'message and privateKey required' });
      }
      const hash = crypto.createHash('sha256').update(message).digest();
      const { ec } = require('../blockchain/block');
      const keyPair = ec.keyFromPrivate(privateKey, 'hex');
      const sig = keyPair.sign(hash);
      res.json({
        success:   true,
        message,
        signature: sig.toDER('hex'),
        address:   req.body.address || null,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ── POST /wallet/verify ─────────────────────────────────────────────────────
  // Verify a message signature
  // Body: { message: string, signature: string, publicKey: string }
  // Returns: { valid: boolean }
  router.post('/verify', (req: Request, res: Response) => {
    try {
      const { message, signature, publicKey } = req.body || {};
      if (!message || !signature || !publicKey) {
        return res.status(400).json({ success: false, error: 'message, signature, publicKey required' });
      }
      const hash = crypto.createHash('sha256').update(message).digest();
      const { ec } = require('../blockchain/block');
      const keyPair = ec.keyFromPublic(publicKey, 'hex');
      const valid = keyPair.verify(hash, Buffer.from(signature, 'hex'));
      res.json({ success: true, valid });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
