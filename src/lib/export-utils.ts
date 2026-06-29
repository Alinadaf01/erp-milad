import * as XLSX from "xlsx";

const PRINT_STYLES = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Tahoma, Arial, sans-serif; padding: 16px; color: #111; direction: rtl; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  h2 { font-size: 15px; margin: 16px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: right; }
  th { background: #eee; }
  .meta { font-size: 12px; color: #444; margin-bottom: 8px; }
  .total { margin-top: 10px; font-weight: bold; }
  @media print { .no-print { display: none !important; } }
`;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export function exportToExcel(rows: any[], filename: string, sheetName = "Sheet1") {
  try {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([buf], { type: "application/octet-stream" });
    downloadBlob(blob, `${filename}.xlsx`);
  } catch (e) {
    console.error("exportToExcel failed", e);
    alert("خروجی اکسل ناموفق بود");
  }
}

export function exportSheetsToExcel(sheets: { name: string; rows: any[] }[], filename: string) {
  try {
    const wb = XLSX.utils.book_new();
    sheets.forEach((s) => {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows), s.name.slice(0, 31));
    });
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([buf], { type: "application/octet-stream" });
    downloadBlob(blob, `${filename}.xlsx`);
  } catch (e) {
    console.error("exportSheetsToExcel failed", e);
    alert("خروجی اکسل ناموفق بود");
  }
}

export function printHtml(title: string, bodyHtml: string) {
  const html = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"/><title>${title}</title><style>${PRINT_STYLES}</style></head><body>${bodyHtml}<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},200);};<\/script></body></html>`;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    return;
  }

  // Fallback: hidden iframe if popups are blocked
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  iframe.onload = () => {
    try {
      iframe.contentWindow!.focus();
      iframe.contentWindow!.print();
    } catch (e) {
      console.error("print failed", e);
    }
    setTimeout(() => iframe.parentNode && iframe.parentNode.removeChild(iframe), 1000);
  };
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
  }
}

export function tableHtml(headers: string[], rows: (string | number)[][]) {
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
