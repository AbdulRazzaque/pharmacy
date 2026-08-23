import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getToken } from '../../utils/auth';
import moment from 'moment';
import './stockoutpdf.css';

const Stockoutpdf = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pdfData, setPdfData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (id) {
      axios.get(`${process.env.REACT_APP_DEVELOPMENT}/api/stockOutPdf/${id}`, {
        headers: { token: getToken() }
      })
        .then(res => {
          setPdfData(res.data.data);
          setLoading(false);

          // Check if we should automatically print
          const queryParams = new URLSearchParams(window.location.search);
          const autoPrint = queryParams.get('autoPrint') !== 'false';
          if (autoPrint) {
            setTimeout(() => {
              window.print();
            }, 2000);
          }
        })
        .catch(err => {
          console.error("Error fetching PDF record:", err);
          setError("Failed to load PDF data.");
          setLoading(false);
        });
    }
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center p-6 bg-white rounded-lg shadow-md">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-700 font-semibold">Loading PDF document...</p>
        </div>
      </div>
    );
  }

  if (error || !pdfData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center p-6 bg-white rounded-lg shadow-md max-w-md">
          <div className="text-red-600 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error || "Could not retrieve document."}</p>
          <button
            onClick={() => navigate('/dashboard/stockout')}
            className="px-4 py-2 bg-red-600 text-white font-semibold rounded hover:bg-red-700 transition"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const items = pdfData.items || [];

  // Calculate the Grand Total of the entire document
  const getGrandTotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity * (item.sellingPrice ?? 0)), 0);
  };

  // Helper to chunk items into arrays of size 15
  const chunkArray = (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  };

  const itemChunks = items.length > 0 ? chunkArray(items, 15) : [[]];

  return (
    <div className="pdf-viewport">
      {/* Action Bar (Hidden during printing) */}
      <div className="pdf-action-bar no-print">
        <button
          onClick={() => navigate('/dashboard/stockout')}
          className="px-4 py-2 bg-gray-800 text-white font-semibold rounded hover:bg-gray-900 transition flex items-center gap-2 shadow"
        >
          ← Back to Application
        </button>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-red-600 text-white font-semibold rounded hover:bg-red-700 transition flex items-center gap-2 shadow"
        >
          🖨️ Print PDF
        </button>
      </div>

      {itemChunks.map((chunk, pageIndex) => (
        <div key={pageIndex} className="pdf-page">
          {/* Banner */}
          <div className="pdf-banner">
            <img src="/images/banner.png" alt="Tharb Camel Hospital Banner" />
          </div>

          {/* Date and Title Row */}
          <div className="pdf-header-fields">
            <div className="pdf-date-field">
              Date: <span className="pdf-field-line">{moment(pdfData.date).format('DD/MM/YYYY')}</span>
            </div>
            <div className="pdf-title-container">
              <h1 className="pdf-title">Drug Issued form</h1>
            </div>
          </div>

          {/* Location and Trainer Row */}
          <div className="pdf-meta-row">
            <div>
              Location: <span className="pdf-field-line">{pdfData.locationName}</span>
            </div>
            <div>
              Trainer: <span className="pdf-field-line" style={{ minWidth: '240px' }}>{pdfData.trainerName}</span>
            </div>
          </div>

          {/* Table of exactly 15 rows */}
          <table className="pdf-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Item</th>
                <th>Unit</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Total Price</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 15 }).map((_, index) => {
                const itemIndex = pageIndex * 15 + index;
                const item = chunk[index];
                const unitPrice = item ? (item.sellingPrice ?? 0) : 0;
                const totalPrice = item ? (item.quantity * unitPrice) : 0;
                return (
                  <tr key={index}>
                    <td>{itemIndex + 1}</td>
                    <td>{item ? `${item.productName}` : ''}</td>
                    <td>{item ? item.unit : ''}</td>
                    <td>{item ? item.quantity : ''}</td>
                    <td>{item ? `QR${unitPrice.toFixed(2)}` : ''}</td>
                    <td>{item ? `QR${totalPrice.toFixed(2)}` : ''}</td>
                  </tr>
                );
              })}
              {/* Grand Total Row on the last page */}
              {pageIndex === itemChunks.length - 1 && (
                <tr className="pdf-total-row">
                  <td colSpan="5" style={{ textAlign: 'right', fontWeight: 'bold' }}>Grand Total:</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>QR{getGrandTotal().toFixed(2)}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Signatures section */}
          <div className="pdf-signatures-section">
            <h2 className="pdf-signatures-title">Signatures:</h2>
            <div className="pdf-signatures-grid">
              <div className="pdf-sig-left">
                <div>
                  Store Incharge: <span className="pdf-field-line" style={{ minWidth: '160px' }}></span>
                </div>
              </div>
              <div className="pdf-sig-right">
                <div className="font-bold">Trainer / ASST. Trainer</div>
                <div>
                  Taken by: <span className="pdf-field-line-dashed"></span>
                </div>
                <div>
                  Veterinarian: <span className="pdf-field-line" style={{ minWidth: '160px' }}></span>
                </div>
              </div>
            </div>
          </div>

          {/* Comments section with exact template spacing */}
          <div className="pdf-comments-section">
            <strong>Comments:</strong>
            <div className="pdf-comments-row">
              <div className="pdf-comment-line">

              </div>
              <div className="pdf-comment-line">

              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Stockoutpdf;
