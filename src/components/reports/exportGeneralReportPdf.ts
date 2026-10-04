import { format } from 'date-fns';
import jsPDF from 'jspdf';

export type ReportPdfSection = {
  title: string;
  headers: string[];
  rows: string[][];
};

export type GeneralReportPdfData = {
  businessName: string;
  startDate: string;
  endDate: string;
  metrics: { label: string; value: string }[];
  sections: ReportPdfSection[];
};

const pageMargin = 12;
const footerSpace = 12;
const pageBottom = 198;
const accentColor: [number, number, number] = [194, 65, 12];
const textColor: [number, number, number] = [31, 41, 55];
const mutedColor: [number, number, number] = [100, 116, 139];
const borderColor: [number, number, number] = [203, 213, 225];

const addReportHeader = (doc: jsPDF, data: GeneralReportPdfData, pageWidth: number) => {
  doc.setFillColor(...accentColor);
  doc.rect(0, 0, pageWidth, 3, 'F');

  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(data.businessName || 'MotoFix', pageMargin, 15);

  doc.setFontSize(13);
  doc.text('Relatório gerencial', pageMargin, 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...mutedColor);
  doc.text(`Período: ${data.startDate} a ${data.endDate}`, pageMargin, 28);
  doc.text(`Emitido em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - pageMargin, 28, { align: 'right' });
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.3);
  doc.line(pageMargin, 32, pageWidth - pageMargin, 32);
};

const addSectionHeading = (doc: jsPDF, title: string, y: number, pageWidth: number) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...textColor);
  doc.text(title, pageMargin, y);
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.2);
  doc.line(pageMargin, y + 2, pageWidth - pageMargin, y + 2);
  return y + 7;
};

export const exportGeneralReportPdf = (data: GeneralReportPdfData) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - pageMargin * 2;
  let y = 38;

  addReportHeader(doc, data, pageWidth);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  data.metrics.forEach((metric, index) => {
    const gap = 3;
    const cardWidth = (contentWidth - gap * (data.metrics.length - 1)) / data.metrics.length;
    const x = pageMargin + index * (cardWidth + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...borderColor);
    doc.roundedRect(x, y, cardWidth, 20, 2, 2, 'FD');
    doc.setTextColor(...mutedColor);
    doc.setFontSize(7);
    doc.text(metric.label, x + 3, y + 6);
    doc.setTextColor(...textColor);
    doc.setFontSize(11);
    doc.text(metric.value, x + 3, y + 15);
  });
  y += 27;

  doc.setFillColor(255, 247, 237);
  doc.setDrawColor(254, 215, 170);
  doc.roundedRect(pageMargin, y, contentWidth, 13, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...textColor);
  doc.text('Resumo: resultado de caixa = total recebido menos gastos. Resultado previsto = total vendido menos gastos.', pageMargin + 4, y + 8);
  y += 21;

  const addPage = () => {
    doc.addPage();
    addReportHeader(doc, data, pageWidth);
    y = 39;
  };

  data.sections.forEach((section) => {
    if (y > pageBottom - 15) addPage();
    y = addSectionHeading(doc, section.title, y, pageWidth);

    const columnCount = Math.max(section.headers.length, 1);
    const columnWidth = contentWidth / columnCount;
    const headerHeight = 7;
    const drawTableHeader = () => {
      doc.setFillColor(241, 245, 249);
      doc.rect(pageMargin, y, contentWidth, headerHeight, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(51, 65, 85);
      section.headers.forEach((header, index) => {
        const cellX = pageMargin + index * columnWidth + 2;
        const available = columnWidth - 4;
        const wrappedHeader = doc.splitTextToSize(header, available);
        doc.text(wrappedHeader[0] || '', cellX, y + 4.7);
      });
      y += headerHeight;
    };

    drawTableHeader();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...textColor);

    if (section.rows.length === 0) {
      doc.setTextColor(...mutedColor);
      doc.text('Nenhum registro no período selecionado.', pageMargin + 2, y + 5);
      y += 9;
      return;
    }

    section.rows.forEach((row, rowIndex) => {
      const wrappedCells = section.headers.map((_, columnIndex) => {
        const cell = row[columnIndex] || '-';
        const lines = doc.splitTextToSize(cell, Math.max(8, columnWidth - 4)) as string[];
        return lines.length > 3 ? [...lines.slice(0, 2), `${lines[2].slice(0, 24)}...`] : lines;
      });
      const rowHeight = Math.max(7, Math.max(...wrappedCells.map(lines => lines.length)) * 3.5 + 3);

      if (y + rowHeight > pageHeight - footerSpace) {
        addPage();
        y = addSectionHeading(doc, `${section.title} (continuação)`, y, pageWidth);
        drawTableHeader();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...textColor);
      }

      if (rowIndex % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(pageMargin, y, contentWidth, rowHeight, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.15);
      doc.line(pageMargin, y + rowHeight, pageWidth - pageMargin, y + rowHeight);
      wrappedCells.forEach((lines, columnIndex) => {
        doc.text(lines, pageMargin + columnIndex * columnWidth + 2, y + 4);
      });
      y += rowHeight;
    });
    y += 7;
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.2);
    doc.line(pageMargin, pageHeight - 8, pageWidth - pageMargin, pageHeight - 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...mutedColor);
    doc.text(data.businessName || 'MotoFix', pageMargin, pageHeight - 4);
    doc.text(`Página ${page} de ${pageCount}`, pageWidth - pageMargin, pageHeight - 4, { align: 'right' });
  }

  const safeName = (data.businessName || 'MotoFix')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-|-$/g, '');
  doc.save(`Relatorio-${safeName}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};
