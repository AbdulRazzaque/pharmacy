const InventoryTransaction = require('../models/InventoryTransactionModule');

const recentActivityController = {
  /**
   * GET /api/recentActivity
   * Returns the latest activities (Stock IN, Stock OUT, Stock Adjustment, etc.) sorted by createdAt desc.
   */
  async getRecentActivity(req, res) {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 50);

      const transactions = await InventoryTransaction.find({})
        .populate('productId', 'name companyName unit')
        .populate('locationId', 'name doctorName')
        .populate('createdBy', 'userName')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      const activities = transactions.map((t) => {
        let type = 'Stock Movement';
        let typeCode = 'txn';

        if (t.transactionType === 'STOCK_IN') {
          type = 'Stock In';
          typeCode = 'stock_in';
        } else if (t.transactionType === 'STOCK_OUT') {
          type = 'Stock Out';
          typeCode = 'stock_out';
        } else if (t.transactionType === 'STOCK_ADJUSTMENT') {
          type = t.quantityDelta >= 0 ? 'Stock Adjustment IN' : 'Stock Adjustment OUT';
          typeCode = t.quantityDelta >= 0 ? 'adj_in' : 'adj_out';
        }

        return {
          _id: t._id,
          type,
          typeCode,
          productName: t.productId?.name || 'Unknown Product',
          companyName: t.productId?.companyName || '',
          quantity: Math.abs(t.quantityDelta),
          unit: t.productId?.unit || '',
          price: t.sellingPrice || t.unitCost || 0,
          docNo: t.docNo || null,
          location: t.locationId?.name || null,
          userName: t.createdBy?.userName || 'Unknown',
          createdAt: t.createdAt,
        };
      });

      return res.status(200).json({ msg: 'success', result: activities });
    } catch (err) {
      console.error('Error fetching recent activity:', err);
      return res.status(500).json({ msg: 'error', error: err.message });
    }
  },
};

module.exports = recentActivityController;
