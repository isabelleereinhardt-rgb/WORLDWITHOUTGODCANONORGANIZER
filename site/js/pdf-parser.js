/* ============================================================
   The Codex — PDF Parser
   Extract text from PDF files using a lightweight approach.
   ============================================================ */
(function () {
"use strict";

/* Load PDF.js library */
if (!window.pdfjsLib) {
  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  document.head.appendChild(script);
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) {
    await new Promise((resolve) => {
      const checkLib = setInterval(() => {
        if (window.pdfjsLib) { clearInterval(checkLib); resolve(); }
      }, 100);
    });
  }

  const pdf = window.pdfjsLib;
  const arrayBuffer = await file.arrayBuffer();
  
  try {
    const pdfDoc = await pdf.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(" ");
      fullText += pageText + "\n";
    }
    
    return fullText.trim();
  } catch (e) {
    console.error("PDF parsing error:", e);
    throw new Error("Could not read PDF: " + e.message);
  }
}

window.CodexPDF = { extractPdfText };
})();
