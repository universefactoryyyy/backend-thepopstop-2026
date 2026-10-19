const PDFDocument = require('pdfkit');
const { orderNumber, formatPHP } = require('./orderHelpers');

// Pastel green + beige palette (same as the storefront theme)
const COLORS = {
    green500: '#6FAE88',
    green300: '#A8D5BA',
    green100: '#CFE8D5',
    cream: '#F5EFE6',
    beige: '#E8DCC8',
    border: '#E8DCC8',
    textDark: '#3F5B4A',
    textMedium: '#5F7F6C',
    textLight: '#8FA89A',
    success: '#2E7D4F',
    white: '#ffffff'
};

const drawRoundedRect = (doc, x, y, w, h, r, fill, stroke) => {
    if (fill && stroke) {
        doc.roundedRect(x, y, w, h, r).fillAndStroke(fill, stroke);
        return;
    }
    if (fill) doc.roundedRect(x, y, w, h, r).fill(fill);
    else if (stroke) doc.roundedRect(x, y, w, h, r).stroke(stroke);
};

// Builds the official PDF receipt for a Mongoose order (order.user should be populated) and resolves with a Buffer
const generateOrderReceipt = (order) => {
    return new Promise((resolve, reject) => {
        const margin = 48;
        const doc = new PDFDocument({ margin, size: 'A4', bufferPages: true });
        const buffers = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const contentWidth = pageWidth - margin * 2;
        const footerH = 52;
        const bottomLimit = pageHeight - margin - footerH - 12;

        // Header band
        doc.rect(0, 0, pageWidth, 80).fill(COLORS.green500);
        doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(22)
            .text('THE POP STOP', margin, 22, { align: 'center', width: contentWidth, lineBreak: false });
        doc.font('Helvetica').fontSize(10)
            .text('Official Order Receipt', margin, 50, { align: 'center', width: contentWidth, lineBreak: false });

        let y = 96;

        // Order summary card
        const summaryHeight = 100;
        drawRoundedRect(doc, margin, y, contentWidth, summaryHeight, 8, COLORS.cream, COLORS.border);

        const colW = contentWidth / 2 - 12;
        const customer = order.user && order.user.name ? `${order.user.name}${order.user.email ? ` (${order.user.email})` : ''}` : '';

        doc.fillColor(COLORS.textLight).font('Helvetica').fontSize(8)
            .text('ORDER NO.', margin + 14, y + 12, { lineBreak: false });
        doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(12)
            .text(`#${orderNumber(order)}`, margin + 14, y + 24, { lineBreak: false });

        doc.fillColor(COLORS.textLight).font('Helvetica').fontSize(8)
            .text('STATUS', margin + 14 + colW, y + 12, { lineBreak: false });
        doc.fillColor(COLORS.green500).font('Helvetica-Bold').fontSize(11)
            .text(order.orderStatus || 'Pending', margin + 14 + colW, y + 24, { width: colW - 8, lineBreak: false });

        doc.fillColor(COLORS.textLight).font('Helvetica').fontSize(8)
            .text('DATE', margin + 14, y + 50, { lineBreak: false });
        doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(9)
            .text(new Date(order.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }), margin + 14, y + 62, { width: colW, lineBreak: false });

        doc.fillColor(COLORS.textLight).font('Helvetica').fontSize(8)
            .text('PAYMENT', margin + 14 + colW, y + 50, { lineBreak: false });
        doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(9)
            .text((order.paymentInfo && order.paymentInfo.method) || 'N/A', margin + 14 + colW, y + 62, { width: colW - 8, lineBreak: false });

        if (customer) {
            doc.fillColor(COLORS.textLight).font('Helvetica').fontSize(8)
                .text('CUSTOMER', margin + 14, y + 80, { lineBreak: false });
            doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(9)
                .text(customer, margin + 80, y + 79, { width: contentWidth - 100, lineBreak: false });
        }

        y += summaryHeight + 16;

        // Shipping address - dynamic height
        const shipping = order.shippingInfo || {};
        const addressText = [shipping.address, shipping.postalCode, shipping.phoneNo ? `Tel: ${shipping.phoneNo}` : '']
            .filter(Boolean).join(' | ').replace(/\n/g, ' ') || 'N/A';
        doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(9);
        const addressHeight = doc.heightOfString(addressText, { width: contentWidth - 28 });
        const shipHeight = 28 + Math.max(addressHeight, 14);
        drawRoundedRect(doc, margin, y, contentWidth, shipHeight, 8, COLORS.white, COLORS.border);
        doc.fillColor(COLORS.textLight).font('Helvetica').fontSize(8)
            .text('SHIPPING ADDRESS', margin + 14, y + 10, { lineBreak: false });
        doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(9)
            .text(addressText, margin + 14, y + 24, { width: contentWidth - 28 });

        y += shipHeight + 18;

        // Items table
        const colProduct = contentWidth * 0.46;
        const colQty = contentWidth * 0.12;
        const colPrice = contentWidth * 0.21;
        const colSub = contentWidth * 0.21;

        const drawTableHeader = () => {
            doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(11)
                .text('Order Items', margin, y, { lineBreak: false });
            y += 16;
            doc.rect(margin, y, contentWidth, 24).fill(COLORS.green500);
            doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(8);
            doc.text('Product', margin + 8, y + 8, { width: colProduct - 8, lineBreak: false });
            doc.text('Qty', margin + colProduct, y + 8, { width: colQty, align: 'center', lineBreak: false });
            doc.text('Unit Price', margin + colProduct + colQty, y + 8, { width: colPrice, align: 'right', lineBreak: false });
            doc.text('Subtotal', margin + colProduct + colQty + colPrice, y + 8, { width: colSub - 8, align: 'right', lineBreak: false });
            y += 24;
        };

        drawTableHeader();

        (order.orderItems || []).forEach((item, index) => {
            const name = item.name || 'Product';
            const series = item.series || '';
            const unitPrice = Number(item.price);
            const subtotal = unitPrice * item.quantity;

            doc.font('Helvetica-Bold').fontSize(8);
            const nameHeight = doc.heightOfString(name, { width: colProduct - 12 });
            doc.font('Helvetica').fontSize(7);
            const seriesHeight = series ? doc.heightOfString(series, { width: colProduct - 12 }) : 0;
            const rowH = Math.max(40, 16 + nameHeight + (series ? 4 + seriesHeight : 0));

            if (y + rowH > bottomLimit) {
                doc.addPage();
                y = margin;
                drawTableHeader();
            }

            const bg = index % 2 === 0 ? COLORS.white : COLORS.cream;
            doc.rect(margin, y, contentWidth, rowH).fill(bg);
            doc.rect(margin, y + rowH - 1, contentWidth, 1).fill(COLORS.border);

            let productY = y + 10;

            doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(8)
                .text(name, margin + 8, productY, { width: colProduct - 12 });
            productY += nameHeight + 2;
            if (series) {
                doc.fillColor(COLORS.textLight).font('Helvetica').fontSize(7)
                    .text(series, margin + 8, productY, { width: colProduct - 12 });
            }

            doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(8)
                .text(String(item.quantity), margin + colProduct, y + rowH / 2 - 4, { width: colQty, align: 'center', lineBreak: false });
            doc.text(formatPHP(unitPrice), margin + colProduct + colQty, y + rowH / 2 - 4, { width: colPrice, align: 'right', lineBreak: false });
            doc.font('Helvetica-Bold')
                .text(formatPHP(subtotal), margin + colProduct + colQty + colPrice, y + rowH / 2 - 4, { width: colSub - 8, align: 'right', lineBreak: false });

            y += rowH;
        });

        y += 16;

        // Totals box
        const discount = Number(order.discountAmount || 0);
        const hasDiscount = discount > 0;
        const totalsW = 230;
        const totalsH = hasDiscount ? 104 : 84;
        if (y + totalsH > bottomLimit) {
            doc.addPage();
            y = margin;
        }
        const totalsX = margin + contentWidth - totalsW;
        drawRoundedRect(doc, totalsX, y, totalsW, totalsH, 8, COLORS.cream, COLORS.border);

        const subtotal = Number(order.itemsPrice || order.totalPrice || 0);
        const total = Number(order.totalPrice || 0);

        let ty = y + 16;
        const drawTotalRow = (label, value, bold, valueColor) => {
            doc.fillColor(COLORS.textMedium).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 8)
                .text(label, totalsX + 14, ty, { width: 110, lineBreak: false });
            doc.fillColor(valueColor || COLORS.textDark).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 8)
                .text(value, totalsX + 14, ty, { width: totalsW - 28, align: 'right', lineBreak: false });
            ty += bold ? 22 : 16;
        };

        drawTotalRow('Subtotal', formatPHP(subtotal), false);
        if (hasDiscount) {
            const label = order.discountCode ? `Discount (${order.discountCode})` : 'Discount';
            drawTotalRow(label, `- ${formatPHP(discount)}`, false, COLORS.success);
        }
        doc.moveTo(totalsX + 14, ty - 4).lineTo(totalsX + totalsW - 14, ty - 4).strokeColor(COLORS.border).lineWidth(1).stroke();
        drawTotalRow('Grand Total', formatPHP(total), true, COLORS.green500);

        // Footer on every page
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            const footerY = pageHeight - margin - footerH;
            doc.rect(margin, footerY, contentWidth, footerH).fill(COLORS.textDark);
            doc.fillColor(COLORS.green100).font('Helvetica').fontSize(8)
                .text('Thank you for shopping with The Pop Stop!', margin, footerY + 14, { align: 'center', width: contentWidth, lineBreak: false });
            doc.fillColor(COLORS.green300).fontSize(7)
                .text(`\u00A9 ${new Date().getFullYear()} The Pop Stop. All rights reserved.  |  Page ${i + 1} of ${pageCount}`, margin, footerY + 30, { align: 'center', width: contentWidth, lineBreak: false });
        }

        doc.end();
    });
};

module.exports = { generateOrderReceipt };
