const StockOutPdf = require("../models/StockOutPdfModule");

class stockOutPdfController {
  async createPdfRecord(req, res) {
    try {
      const {
        docNo,
        date,
        locationId,
        locationName,
        trainerName,
        storeIncharge,
        takenBy,
        veterinarian,
        comments,
        items
      } = req.body;

      if (!docNo || !date || !locationId || !locationName || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Missing mandatory fields to generate PDF record."
        });
      }

      const processedItems = items.map(item => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.sellingPrice || 0);
        const itemTotal = Math.round((qty * price) * 100) / 100;
        let discPct = Number(item.discountPercentage || 0);
        if (isNaN(discPct) || discPct < 0 || discPct > 100) discPct = 0;
        const discountAmount = Math.round((itemTotal * discPct / 100) * 100) / 100;
        const netTotal = Math.round((itemTotal - discountAmount) * 100) / 100;
        return {
          ...item,
          quantity: qty,
          sellingPrice: price,
          discountPercentage: discPct,
          discountAmount,
          itemTotal,
          netTotal
        };
      });

      const subTotal = processedItems.reduce((sum, i) => sum + i.itemTotal, 0);
      const totalDiscount = processedItems.reduce((sum, i) => sum + i.discountAmount, 0);
      const grandTotal = Math.round((subTotal - totalDiscount) * 100) / 100;

      const newPdfRecord = await StockOutPdf.create({
        docNo,
        date: new Date(date),
        locationId,
        locationName,
        trainerName: trainerName || "",
        storeIncharge: storeIncharge || "",
        takenBy: takenBy || "",
        veterinarian: veterinarian || "",
        comments: comments || "",
        subTotal,
        totalDiscount,
        grandTotal,
        items: processedItems
      });

      return res.status(200).json({
        success: true,
        message: "PDF record saved successfully.",
        data: newPdfRecord
      });
    } catch (error) {
      console.error("Error creating StockOutPdf record:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error."
      });
    }
  }

  async getPdfRecordById(req, res) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({
          success: false,
          message: "ID is required."
        });
      }

      const record = await StockOutPdf.findById(id);
      if (!record) {
        return res.status(404).json({
          success: false,
          message: "Stock Out PDF record not found."
        });
      }

      return res.status(200).json({
        success: true,
        data: record
      });
    } catch (error) {
      console.error("Error retrieving StockOutPdf record:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error."
      });
    }
  }

  async getPdfRecordByDocNo(req, res) {
    try {
      const { docNo } = req.params;
      if (!docNo) {
        return res.status(400).json({
          success: false,
          message: "docNo is required."
        });
      }

      const record = await StockOutPdf.findOne({ docNo: parseInt(docNo, 10) }).sort({ createdAt: -1 });
      if (!record) {
        return res.status(404).json({
          success: false,
          message: "Stock Out PDF record not found."
        });
      }

      return res.status(200).json({
        success: true,
        data: record
      });
    } catch (error) {
      console.error("Error retrieving StockOutPdf record by docNo:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Internal server error."
      });
    }
  }
}

module.exports = new stockOutPdfController();
