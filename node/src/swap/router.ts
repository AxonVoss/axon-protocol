/**
 * AXON Swap API — agent-to-agent order book
 * Agents post buy/sell orders, others fill them
 */

import { Router, Request, Response } from 'express';
import { SwapStore, SwapOrder } from './store';

let swapStore: SwapStore;

export function initSwapStore(store: SwapStore) {
  swapStore = store;
}

// Fetch live AXN price from a free oracle
async function getAxnPrice(): Promise<{ usd: number; sol: number; source: string }> {
  try {
    // Use CoinGecko free API for SOL price, derive AXN/USD from order book
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
      signal: AbortSignal.timeout(4000),
    });
    const data = await res.json() as any;
    const solUsd = data?.solana?.usd ?? 150;

    // AXN has no external price yet — derive from open orders if available
    const openOrders = swapStore.getOpenOrders();
    let axnUsd = 0;
    if (openOrders.length > 0) {
      const prices = openOrders.map(o => o.priceUsd).filter(p => p > 0);
      axnUsd = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    }

    return {
      usd:    axnUsd,
      sol:    axnUsd > 0 ? axnUsd / solUsd : 0,
      source: axnUsd > 0 ? 'order-book-average' : 'no-orders-yet',
    };
  } catch {
    return { usd: 0, sol: 0, source: 'oracle-unavailable' };
  }
}

export function swapRouter(): Router {
  const router = Router();

  // ── GET /swap/rate ──────────────────────────────────────────────────────────
  // Get current AXN price derived from open orders + SOL oracle
  router.get('/rate', async (req: Request, res: Response) => {
    try {
      const price = await getAxnPrice();
      const open  = swapStore.getOpenOrders();
      const sells = open.filter(o => o.side === 'sell');
      const buys  = open.filter(o => o.side === 'buy');

      const lowestAsk = sells.length > 0 ? Math.min(...sells.map(o => o.priceUsd)) : null;
      const highestBid = buys.length > 0 ? Math.max(...buys.map(o => o.priceUsd)) : null;

      res.json({
        success:      true,
        axn_usd:      price.usd,
        axn_sol:      price.sol,
        lowest_ask:   lowestAsk,
        highest_bid:  highestBid,
        spread:       lowestAsk && highestBid ? lowestAsk - highestBid : null,
        open_orders:  open.length,
        source:       price.source,
        note:         price.usd === 0 ? 'AXN has no external price yet — price is set by order book' : undefined,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── POST /swap/order ────────────────────────────────────────────────────────
  // Place a buy or sell order
  // Body: { side, axnAmount, priceUsd, makerAddress, pairAsset?, note? }
  router.post('/order', async (req: Request, res: Response) => {
    try {
      const { side, axnAmount, priceUsd, makerAddress, pairAsset, note } = req.body || {};

      if (!side || !['buy','sell'].includes(side))
        return res.status(400).json({ success: false, error: 'side must be "buy" or "sell"' });
      if (!axnAmount || isNaN(parseFloat(axnAmount)))
        return res.status(400).json({ success: false, error: 'axnAmount required (e.g. "100.00000000")' });
      if (!priceUsd || isNaN(parseFloat(priceUsd)) || parseFloat(priceUsd) <= 0)
        return res.status(400).json({ success: false, error: 'priceUsd required (price per AXN in USD)' });
      if (!makerAddress || !makerAddress.startsWith('axon1'))
        return res.status(400).json({ success: false, error: 'makerAddress required (axon1...)' });

      const order = await swapStore.placeOrder({
        side,
        axnAmount:    parseFloat(axnAmount).toFixed(8),
        priceUsd:     parseFloat(priceUsd),
        makerAddress,
        pairAsset:    pairAsset || 'USD',
        note:         note || undefined,
      });

      res.json({
        success: true,
        message: `Order placed! ID: ${order.id}`,
        order,
        hint: side === 'sell'
          ? 'Send the AXN to escrow or arrange OTC directly with the filler.'
          : 'Your buy order is visible to sellers. They will fill it and contact you.',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /swap/orders ────────────────────────────────────────────────────────
  // List open orders, optionally filtered by side or address
  router.get('/orders', (req: Request, res: Response) => {
    try {
      let orders = swapStore.getOpenOrders();
      const { side, address } = req.query;

      if (side) orders = orders.filter(o => o.side === side);
      if (address) orders = orders.filter(o => o.makerAddress === address);

      res.json({
        success: true,
        count:   orders.length,
        orders,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /swap/order/:id ─────────────────────────────────────────────────────
  // Get a specific order
  router.get('/order/:id', (req: Request, res: Response) => {
    const order = swapStore.getOrder(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, order });
  });

  // ── POST /swap/fill/:id ─────────────────────────────────────────────────────
  // Fill an open order
  // Body: { fillerAddress: string }
  router.post('/fill/:id', async (req: Request, res: Response) => {
    try {
      const { fillerAddress } = req.body || {};
      if (!fillerAddress || !fillerAddress.startsWith('axon1'))
        return res.status(400).json({ success: false, error: 'fillerAddress required (axon1...)' });

      const order = await swapStore.fillOrder(req.params.id, fillerAddress);
      if (!order) return res.status(404).json({ success: false, error: 'Order not found or already filled/cancelled' });

      res.json({
        success: true,
        message: 'Order filled!',
        order,
        next_steps: order.side === 'sell'
          ? `Send ${order.axnAmount} AXN to ${order.makerAddress} — they owe you ${(parseFloat(order.axnAmount) * order.priceUsd).toFixed(2)} USD worth of ${order.pairAsset}`
          : `Maker owes you ${order.axnAmount} AXN — send ${(parseFloat(order.axnAmount) * order.priceUsd).toFixed(2)} USD worth of ${order.pairAsset} to ${order.makerAddress}`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── DELETE /swap/order/:id ──────────────────────────────────────────────────
  // Cancel your own open order
  // Body: { makerAddress: string }
  router.delete('/order/:id', async (req: Request, res: Response) => {
    try {
      const { makerAddress } = req.body || {};
      if (!makerAddress)
        return res.status(400).json({ success: false, error: 'makerAddress required to cancel' });

      const order = await swapStore.cancelOrder(req.params.id, makerAddress);
      if (!order) return res.status(404).json({ success: false, error: 'Order not found, already closed, or address mismatch' });

      res.json({ success: true, message: 'Order cancelled.', order });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /swap/history ───────────────────────────────────────────────────────
  // Completed and cancelled orders
  router.get('/history', (req: Request, res: Response) => {
    try {
      const history = swapStore.getOrderHistory();
      const { address } = req.query;
      const filtered = address
        ? history.filter(o => o.makerAddress === address || o.filledBy === address)
        : history;
      res.json({ success: true, count: filtered.length, orders: filtered });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /swap/portfolio/:address ────────────────────────────────────────────
  // All orders (open + history) for an address
  router.get('/portfolio/:address', (req: Request, res: Response) => {
    try {
      const orders = swapStore.getOrdersByAddress(req.params.address);
      res.json({ success: true, count: orders.length, orders });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
