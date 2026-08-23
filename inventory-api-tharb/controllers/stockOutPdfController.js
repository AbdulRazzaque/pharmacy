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
        items
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
