"""
PDF generation utilities for settlement reports.
Uses ReportLab to create well-formatted settlement PDFs.
"""
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT


def generate_settlement_pdf(settlement):
    """
    Generates a well-sorted PDF report for a given EODSettlement record.

    The PDF includes:
    - Header with settlement date and ID
    - Summary table (System Cash, System UPI, Physical Cash, Discrepancy)
    - Order breakdown table (all COMPLETED orders in this settlement)
    - Footer with generation timestamp

    Returns a BytesIO buffer containing the PDF content.
    """
    from django.utils import timezone

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=20*mm, bottomMargin=20*mm,
        leftMargin=15*mm, rightMargin=15*mm,
    )

    styles = getSampleStyleSheet()
    elements = []

    # --- Custom Styles ---
    title_style = ParagraphStyle(
        'SettlementTitle', parent=styles['Title'],
        fontSize=18, spaceAfter=4*mm, alignment=TA_CENTER,
    )
    subtitle_style = ParagraphStyle(
        'SettlementSubtitle', parent=styles['Normal'],
        fontSize=10, textColor=colors.grey, alignment=TA_CENTER, spaceAfter=8*mm,
    )
    section_style = ParagraphStyle(
        'SectionHeader', parent=styles['Heading2'],
        fontSize=13, spaceAfter=4*mm, spaceBefore=8*mm,
        textColor=colors.HexColor('#1e293b'),
    )

    # --- Header ---
    elements.append(Paragraph("End-of-Day Settlement Report", title_style))
    closed_time_str = timezone.localtime(settlement.closed_at).strftime('%Y-%m-%d %I:%M %p') if settlement.closed_at else 'N/A'
    elements.append(Paragraph(
        f"Settlement #{settlement.id} &bull; Date: {settlement.shift_date} &bull; "
        f"Closed: {closed_time_str}",
        subtitle_style,
    ))

    # --- Summary Table ---
    elements.append(Paragraph("Settlement Summary", section_style))

    discrepancy_val = float(settlement.discrepancy)
    disc_color = colors.green if discrepancy_val == 0 else colors.red

    summary_data = [
        ['Metric', 'Amount (₹)'],
        ['Cash in hand', f"₹ {settlement.system_cash_total:,.2f}"],
        ['UPI Total', f"₹ {settlement.system_upi_total:,.2f}"],
        ['Combined System Total', f"₹ {(settlement.system_cash_total + settlement.system_upi_total):,.2f}"],
        ['Discrepancy (Physical - System Cash)', f"₹ {settlement.discrepancy:,.2f}"],
    ]

    summary_table = Table(summary_data, colWidths=[120*mm, 50*mm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        # Highlight discrepancy row
        ('TEXTCOLOR', (1, -1), (1, -1), disc_color),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]))
    elements.append(summary_table)

    # --- Order Breakdown ---
    elements.append(Paragraph("Order Breakdown", section_style))

    orders = settlement.orders.filter(status='COMPLETED').order_by('created_at')

    order_data = [['#', 'Time', 'Payment', 'Items', 'Total (₹)']]
    for order in orders:
        item_count = order.items.count()
        order_time = timezone.localtime(order.created_at).strftime('%I:%M %p')
        order_data.append([
            f"#{order.id}",
            order_time,
            order.payment_method or '-',
            str(item_count),
            f"₹ {order.total_amount:,.2f}",
        ])

    if len(order_data) == 1:
        order_data.append(['-', '-', '-', '-', '₹ 0.00'])

    order_table = Table(order_data, colWidths=[20*mm, 25*mm, 30*mm, 20*mm, 40*mm])
    order_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#334155')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('ALIGN', (-1, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(order_table)

    # --- Notes ---
    if settlement.notes:
        elements.append(Spacer(1, 6*mm))
        elements.append(Paragraph("Notes", section_style))
        elements.append(Paragraph(settlement.notes, styles['Normal']))

    # --- Footer ---
    elements.append(Spacer(1, 10*mm))
    footer_style = ParagraphStyle(
        'Footer', parent=styles['Normal'],
        fontSize=7, textColor=colors.grey, alignment=TA_CENTER,
    )
    elements.append(Paragraph(
        f"Generated on {timezone.localtime(timezone.now()).strftime('%Y-%m-%d %I:%M:%S %p')} &bull; Hotel POS System",
        footer_style,
    ))

    doc.build(elements)
    buffer.seek(0)
    return buffer
