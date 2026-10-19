const { orderNumber, formatPeso, escapeHtml } = require('./orderHelpers');

const baseTemplate = (title, bodyContent) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5EFE6;font-family:Segoe UI,Arial,sans-serif;color:#3F5B4A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFE6;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(63,91,74,0.12);">
        <tr>
          <td style="background:#A8D5BA;padding:28px;text-align:center;">
            <h1 style="margin:0;color:#3F5B4A;font-size:28px;letter-spacing:1px;">The Pop Stop</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 28px;">
            <h2 style="margin:0 0 16px;color:#6FAE88;font-size:22px;">${title}</h2>
            ${bodyContent}
          </td>
        </tr>
        <tr>
          <td style="background:#3F5B4A;padding:18px;text-align:center;">
            <p style="margin:0;color:#CFE8D5;font-size:12px;">&copy; ${new Date().getFullYear()} The Pop Stop. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// list of products with quantity, unit price and subtotal
const buildOrderItemsTable = (order) => {
    let rows = '';
    (order.orderItems || []).forEach((item) => {
        const series = item.series
            ? `<div style="margin-top:4px;font-size:12px;line-height:1.4;color:#8FA89A;">${escapeHtml(item.series)}</div>` : '';
        const subtotal = Number(item.price) * item.quantity;
        rows += `
            <tr>
              <td style="padding:12px;border-bottom:1px solid #E8DCC8;vertical-align:top;line-height:1.4;"><strong style="display:block;line-height:1.4;">${escapeHtml(item.name)}</strong>${series}</td>
              <td style="padding:12px;border-bottom:1px solid #E8DCC8;text-align:center;">${item.quantity}</td>
              <td style="padding:12px;border-bottom:1px solid #E8DCC8;text-align:right;">${formatPeso(item.price)}</td>
              <td style="padding:12px;border-bottom:1px solid #E8DCC8;text-align:right;">${formatPeso(subtotal)}</td>
            </tr>`;
    });
    return `
    <h3 style="color:#6FAE88;margin:24px 0 12px;">Order Details</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="background:#6FAE88;color:#ffffff;">
          <th style="padding:12px;text-align:left;">Product</th>
          <th style="padding:12px;text-align:center;">Qty</th>
          <th style="padding:12px;text-align:right;">Unit Price</th>
          <th style="padding:12px;text-align:right;">Subtotal</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
};

// subtotal, discount and grand total
const buildOrderTotals = (order) => {
    const subtotal = Number(order.itemsPrice || order.totalPrice || 0);
    const discount = Number(order.discountAmount || 0);
    const total = Number(order.totalPrice || 0);
    let discountRow = '';
    if (discount > 0) {
        discountRow = `<tr><td style="padding:6px 0;color:#2E7D4F;">Discount${order.discountCode ? ` (${escapeHtml(order.discountCode)})` : ''}</td><td style="padding:6px 0;text-align:right;color:#2E7D4F;">-${formatPeso(discount)}</td></tr>`;
    }
    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;font-size:14px;">
      <tr><td style="padding:6px 0;">Subtotal</td><td style="padding:6px 0;text-align:right;">${formatPeso(subtotal)}</td></tr>
      ${discountRow}
      <tr><td style="padding:10px 0;font-size:18px;font-weight:bold;color:#6FAE88;">Grand Total</td><td style="padding:10px 0;text-align:right;font-size:18px;font-weight:bold;color:#6FAE88;">${formatPeso(total)}</td></tr>
    </table>`;
};

const buildShipping = (order) => {
    const shipping = order.shippingInfo || {};
    const lines = [shipping.address, shipping.postalCode, shipping.phoneNo ? `Tel: ${shipping.phoneNo}` : '']
        .filter(Boolean).map(l => escapeHtml(l)).join('<br>');
    return `
      <div style="background:#F5EFE6;border-radius:8px;padding:16px;margin-top:20px;">
        <strong style="color:#3F5B4A;">&#128205; Shipping Address:</strong><br>
        <span style="color:#5F7F6C;">${lines}</span>
      </div>`;
};

const receiptDownload = (downloadUrl) => `
      <p style="margin:24px 0 0;">
        <a href="${escapeHtml(downloadUrl)}" style="display:inline-block;background:#6FAE88;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;">Download PDF receipt</a>
      </p>
      <p style="margin:12px 0 0;font-size:13px;color:#5F7F6C;">The same PDF is attached to this email. Open the attachment, or use the button above, to save your receipt.</p>`

exports.orderConfirmationEmail = (user, order, downloadUrl) => {
    const body = `
      <p style="margin:0 0 12px;font-size:15px;">Dear <strong>${escapeHtml(user.name)}</strong>,</p>
      <p style="margin:0 0 20px;font-size:15px;">Thank you for your order! Your order <strong>#${orderNumber(order)}</strong> has been placed successfully.</p>
      <div style="background:#CFE8D5;border-left:4px solid #6FAE88;padding:16px 20px;border-radius:8px;margin-bottom:20px;">
        <strong style="color:#3F5B4A;">Status: ${order.orderStatus}</strong>
      </div>
      ${buildOrderItemsTable(order)}
      ${buildOrderTotals(order)}
      ${buildShipping(order)}
      <p style="margin:24px 0 0;font-size:14px;color:#5F7F6C;">Payment Method: <strong>${escapeHtml((order.paymentInfo && order.paymentInfo.method) || 'N/A')}</strong></p>
      <p style="margin:16px 0 0;font-size:14px;">Thank you for shopping with The Pop Stop!</p>
      ${receiptDownload(downloadUrl)}`;
    return baseTemplate('Order Confirmed', body);
};

exports.orderStatusUpdateEmail = (user, order, status, downloadUrl) => {
    const body = `
      <p style="margin:0 0 12px;font-size:15px;">Dear <strong>${escapeHtml(user.name)}</strong>,</p>
      <p style="margin:0 0 20px;font-size:15px;">Your order <strong>#${orderNumber(order)}</strong> status has been updated to:</p>
      <div style="background:#CFE8D5;border-left:4px solid #6FAE88;padding:16px 20px;border-radius:8px;margin-bottom:20px;">
        <strong style="color:#3F5B4A;font-size:16px;">Status: ${status}</strong>
      </div>
      ${buildOrderItemsTable(order)}
      ${buildOrderTotals(order)}
      ${buildShipping(order)}
      <p style="margin:24px 0 0;font-size:14px;">Thank you for shopping with The Pop Stop!</p>
      ${receiptDownload(downloadUrl)}
      <p style="margin:8px 0 0;font-size:13px;color:#8FA89A;">If you have any questions, please contact us.</p>`;
    return baseTemplate('Order Status Update', body);
};
