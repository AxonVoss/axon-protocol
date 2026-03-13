/**
 * AXON Swap Order Book — LevelDB persistence
 */

import { Level } from 'level';
import * as crypto from 'crypto';

export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'open' | 'filled' | 'cancelled';

export interface SwapOrder {
  id:          string;
  side:        OrderSide;   // 'sell' = offering AXN, 'buy' = wanting AXN
  axnAmount:   string;      // AXN amount (formatted, e.g. "100.00000000")
  priceUsd:    number;      // price per AXN in USD
  pairAsset:   string;      // e.g. 'SOL', 'USD', 'AXN'
  makerAddress: string;     // AXON address of order placer
  status:      OrderStatus;
  filledBy?:   string;      // address of filler
  createdAt:   number;      // unix timestamp
  updatedAt:   number;
  note?:       string;      // optional message from maker
}

export class SwapStore {
  private db: Level<string, string> | null = null;
  private orders: Map<string, SwapOrder> = new Map();
  private persisted: boolean;
  private dbPath: string;

  constructor(chainDir?: string, persist = false) {
    this.persisted = persist && !!chainDir;
    this.dbPath = chainDir ? chainDir + '/swap-orders' : '';
  }

  async open(): Promise<void> {
    if (!this.persisted) return;
    this.db = new Level<string, string>(this.dbPath, { valueEncoding: 'utf8' });
    await (this.db as any).open();
    // Load existing orders
    for await (const [key, value] of (this.db as any).iterator()) {
      if (key.startsWith('order:')) {
        try {
          const order: SwapOrder = JSON.parse(value);
          this.orders.set(order.id, order);
        } catch {}
      }
    }
  }

  async close(): Promise<void> {
    if (this.db) await (this.db as any).close();
  }

  async placeOrder(params: Omit<SwapOrder, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<SwapOrder> {
    const order: SwapOrder = {
      ...params,
      id:        crypto.randomBytes(8).toString('hex'),
      status:    'open',
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    };
    this.orders.set(order.id, order);
    if (this.db) await (this.db as any).put('order:' + order.id, JSON.stringify(order));
    return order;
  }

  async fillOrder(id: string, fillerAddress: string): Promise<SwapOrder | null> {
    const order = this.orders.get(id);
    if (!order || order.status !== 'open') return null;
    order.status    = 'filled';
    order.filledBy  = fillerAddress;
    order.updatedAt = Math.floor(Date.now() / 1000);
    this.orders.set(id, order);
    if (this.db) await (this.db as any).put('order:' + id, JSON.stringify(order));
    return order;
  }

  async cancelOrder(id: string, requesterAddress: string): Promise<SwapOrder | null> {
    const order = this.orders.get(id);
    if (!order || order.status !== 'open') return null;
    if (order.makerAddress !== requesterAddress) return null;
    order.status    = 'cancelled';
    order.updatedAt = Math.floor(Date.now() / 1000);
    this.orders.set(id, order);
    if (this.db) await (this.db as any).put('order:' + id, JSON.stringify(order));
    return order;
  }

  getOpenOrders(): SwapOrder[] {
    return Array.from(this.orders.values())
      .filter(o => o.status === 'open')
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  getOrderHistory(): SwapOrder[] {
    return Array.from(this.orders.values())
      .filter(o => o.status !== 'open')
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 100);
  }

  getOrder(id: string): SwapOrder | null {
    return this.orders.get(id) || null;
  }

  getOrdersByAddress(address: string): SwapOrder[] {
    return Array.from(this.orders.values())
      .filter(o => o.makerAddress === address || o.filledBy === address)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
}
