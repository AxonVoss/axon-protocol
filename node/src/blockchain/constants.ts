// ─── AXON PROTOCOL CONSTANTS ──────────────────────────────────────────────────

export const COIN = 100_000_000n;               // 1 AXN = 100,000,000 satoshis
export const MAX_SUPPLY = 21_000_000n * COIN;   // 21 million AXN
export const INITIAL_REWARD = 50n * COIN;       // 50 AXN per block, era 1
export const HALVING_INTERVAL = 210_000;        // blocks per era
export const TARGET_BLOCK_TIME = 600;           // 10 minutes in seconds
export const DIFFICULTY_ADJUSTMENT_INTERVAL = 2_016; // blocks between adjustments
export const MAX_BLOCK_SIZE = 4_000_000;        // 4 MB
export const COINBASE_MATURITY = 100;           // blocks before coinbase spendable
export const AUDIT_WINDOW = 100;               // blocks subject to audit challenge

// Genesis block timestamp
export const GENESIS_TIMESTAMP = Math.floor(new Date('2026-03-12T00:00:00Z').getTime() / 1000);

// Genesis message embedded in coinbase scriptSig
export const GENESIS_MESSAGE = 'Mine with intelligence, not just electricity. AXON 2026-03-12';

// Genesis block hash — set to '0'.repeat(64) during initial computation, then hardcoded
// Run: npx ts-node src/tools/compute-genesis.ts  to compute and update this value
// Computed by: npx ts-node src/tools/compute-genesis.ts
// DO NOT CHANGE after mainnet launch — this locks in chain identity
export const GENESIS_HASH = 'f42f19b75d4d94520c4984e715a1703c8216b56fd49d737f36d2678bcf5ae22f';

// Canonical model pinned in genesis
// SHA256 verified: sha256sum ~/.axon/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
export const CANONICAL_MODEL = {
  name:       'TinyLlama-1.1B-Chat-v1.0-Q4_K_M',
  sha256:     '9fecc3b3cd76bba89d504f29b616eedf7da85b96540e490ca5824d3f7d2776a0',
  size_bytes: 638_957_696,  // 638MB actual on disk
  hf_repo:    'TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF',
};

// Initial difficulty targets (testnet — easy for simulation)
export const INITIAL_POW_TARGET = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
export const INITIAL_POAW_TARGET = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
export const TESTNET_POW_TARGET  = '00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
export const TESTNET_POAW_TARGET = '0fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

export const NETWORK_MAGIC = Buffer.from('AXON', 'ascii');
export const DEFAULT_PORT = 8333;
export const RPC_PORT = 8332;

// Hardcoded checkpoints — height → expected block hash.
// Prevents long-range reorg attacks on a young chain.
// Add entries after mainnet is live and chain has sufficient depth.
// Format: [height, hash]
// Testnet checkpoints — added 2026-03-12 after first persistent node run
// These prevent reorganizing away from the established testnet chain.
// Add mainnet checkpoints here after launch.
// Mainnet checkpoints — locked in at block 100 (2026-03-12)
export const CHECKPOINTS: Array<[number, string]> = [
  [10,  'f10ff16203aeac04d0f275db9e3155c04f5aa9969a19cf541ab3ecce581fb69d'],
  [25,  '632866824cad84db97b152da1aa753b4c04ec4da357a7bf5072d55cdbd7c6f78'],
  [50,  '8d9320975d82d278a5f0f9af118fb183bb6e228fc1eb16c845a58d92bc72a56d'],
  [75,  '623cd52038adaa57ab7750c912e2dbb4701865c75c32c4a53ee4f7c318165f87'],
  [100, 'c13ea67d571539952b7b421068af9255f80697a165fca074a36fdef0bdd84f83'],
];

// DNS seed hostnames — these resolve to IPs of stable seed nodes.
// Add your own public node here when launching mainnet.
export const DNS_SEEDS: string[] = [
  'seed1.axonprotocol.net',
  'seed2.axonprotocol.net',
  'seed3.axonprotocol.net',
];
