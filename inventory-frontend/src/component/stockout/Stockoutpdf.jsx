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
              // window.print();
            }, 1500);
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

  // Convert number to Arabic words (Tafqeet in Qatari Riyals and Dirhams)
  const numberToArabicWords = (number) => {
    if (number === null || number === undefined || isNaN(number)) return '';

    const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
    const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
    const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

    const convertChunk = (n) => {
      if (n === 0) return '';
      let res = [];
      const h = Math.floor(n / 100);
      const rem = n % 100;

      if (h > 0) {
        res.push(hundreds[h]);
      }

      if (rem > 0) {
        if (rem < 20) {
          res.push(ones[rem]);
        } else {
          const t = Math.floor(rem / 10);
          const o = rem % 10;
          if (o > 0) {
            res.push(ones[o] + ' و' + tens[t]);
          } else {
            res.push(tens[t]);
          }
        }
      }
      return res.join(' و');
    };

    const convertWholeNumber = (n) => {
      if (n === 0) return 'صفر';

      const parts = [];

      // Millions
      const millions = Math.floor(n / 1000000);
      const remMillion = n % 1000000;
      if (millions > 0) {
        if (millions === 1) parts.push('مليون');
        else if (millions === 2) parts.push('مليونان');
        else if (millions >= 3 && millions <= 10) parts.push(convertChunk(millions) + ' ملايين');
        else parts.push(convertChunk(millions) + ' مليون');
      }

      // Thousands
      const thousands = Math.floor(remMillion / 1000);
      const remThousand = remMillion % 1000;
      if (thousands > 0) {
        if (thousands === 1) parts.push('ألف');
        else if (thousands === 2) parts.push('ألفان');
        else if (thousands >= 3 && thousands <= 10) parts.push(convertChunk(thousands) + ' آلاف');
        else parts.push(convertChunk(thousands) + ' ألف');
      }

      // Remaining hundreds/tens/ones
      if (remThousand > 0) {
        parts.push(convertChunk(remThousand));
      }

      return parts.join(' و');
    };

    const rounded = Number(number).toFixed(2);
    const [wholeStr, decStr] = rounded.split('.');
    const whole = parseInt(wholeStr, 10);
    const dec = parseInt(decStr, 10);

    let result = 'فقط ';
    if (whole > 0) {
      result += convertWholeNumber(whole) + ' ريالاً قطرياً';
    }

    if (dec > 0) {
      if (whole > 0) result += ' و';
      result += convertChunk(dec) + ' درهماً';
    }

    if (whole === 0 && dec === 0) {
      result += 'صفر ريال قطري';
    }

    result += ' لا غير';
    return result;
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
          className="px-4 py-2 bg-gray-800 text-white font-semibold rounded hover:bg-gray-700 transition flex items-center gap-2 shadow"
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

      <div className="pdf-page-container">
        {itemChunks.map((chunk, pageIndex) => (
          <div key={pageIndex} className="pdf-page">
            {/* 1. Header Banner: Side-by-Side Images */}
            <div className="pdf-banner">
              <img src="/images/imstharb.png" alt="Tharb Camel Hospital Logo" className="pdf-banner-logo" />
              <img src="/images/tharbName.png" alt="Tharb Camel Hospital Name" className="pdf-banner-name" />
            </div>

            {/* 2. Header Fields: Date & Title */}
            <div className="pdf-header-fields">
              <div className="pdf-title-container">
                <h1 className="pdf-title">Invoice & Delivery Note</h1>
              </div>


            </div>

            <div className="pdf-header-fields">
              <div className="pdf-header-left">
                <span className="pdf-field-label">Date:</span>
                <span className="pdf-field-line pdf-date-line">
                  {moment(pdfData.date).format('DD/MM/YYYY')}
                </span>
              </div>
              <div className="pdf-header-right">
                <span className="pdf-field-label pdf-document-number-label">Document No: </span>
                <span className="pdf-field-line pdf-date-line">
                  {pdfData.docNo}
                </span>
              </div>
            </div>

            {/* 3. Meta Row: Location & Trainer */}
            <div className="pdf-meta-row">
              <div className="pdf-meta-left">
                <span className="pdf-field-label">Location:</span>
                <span className="pdf-field-line pdf-location-line">
                  {pdfData.locationName}
                </span>
              </div>

              <div className="pdf-meta-right">
                <span className="pdf-field-label">Trainer:</span>
                <span className="pdf-field-line pdf-trainer-line">
                  {pdfData.trainerName}
                </span>


              </div>
            </div>

            {/* 4. Items Table (Exactly 15 rows) */}
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
                      <td className="pdf-cell-item">{item ? `${item.productName}` : ''}</td>
                      <td>{item ? item.unit : ''}</td>
                      <td>{item ? item.quantity : ''}</td>
                      <td className="pdf-cell-num">{item ? `QR ${unitPrice.toFixed(2)}` : ''}</td>
                      <td className="pdf-cell-num">{item ? `QR ${totalPrice.toFixed(2)}` : ''}</td>
                    </tr>
                  );
                })}
                {/* Grand Total Row on the last page */}
                {pageIndex === itemChunks.length - 1 && (
                  <tr className="pdf-total-row">
                    <td colSpan="4" className="pdf-total-words" dir="rtl">
                      {numberToArabicWords(getGrandTotal())}
                    </td>
                    <td className="pdf-total-label">Grand Total:</td>
                    <td className="pdf-total-value">QR{getGrandTotal().toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* 5. Delivery Confirmation Notice */}
            <p className="pdf-delivery-note">
              Delivery Confirmation :- I confirm that the above items have been received in good condition.
            </p>

            {/* 6. Signatures Section */}
            <div className="pdf-signatures-section">
              <h2 className="pdf-signatures-title">Signatures:</h2>
              <div className="pdf-signatures-grid">
                <div className="pdf-sig-left">
                  <div className="pdf-sig-row">
                    <span className="pdf-field-label">Store Incharge:</span>
                    <span className="pdf-field-line pdf-sig-line"></span>
                  </div>
                  <div className="pdf-sig-row" style={{ marginTop: '18px' }}>
                    <span className="pdf-field-label">Accountant:</span>
                    <span className="pdf-field-line pdf-sig-line"></span>
                  </div>
                </div>

                <div className="pdf-sig-right">
                  <div className="pdf-sig-role">Trainer / ASST. Trainer</div>
                  <div className="pdf-sig-row">
                    <span className="pdf-field-label">Received by:</span>
                    <span className="pdf-field-line-dotted pdf-sig-line"></span>
                  </div>
                  <div className="pdf-sig-row">
                    <span className="pdf-field-label">Veterinarian:</span>
                    <span className="pdf-field-line pdf-sig-line"></span>
                  </div>
                </div>
              </div>
            </div>

            {/* 7. Comments Section */}
            <div className="pdf-comments-section">
              <strong className="pdf-comments-title">Comments:</strong>
              <div className="pdf-comments-lines">
                <div className="pdf-comment-line-solid"></div>
                <div className="pdf-comment-line-dotted"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Stockoutpdf;
