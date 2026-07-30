from django.db import connection
from .models import MenuItem


def check_database_health() -> dict:
    """
    Checks if the database is accessible.
    Returns a dictionary with status details.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": "disconnected", "details": str(e)}


def toggle_menu_item_availability(menu_item: MenuItem) -> MenuItem:
    """
    Flips the is_available flag on a MenuItem and saves it.
    Returns the updated instance.
    """
    menu_item.is_available = not menu_item.is_available
    menu_item.save(update_fields=['is_available'])
    return menu_item


def get_filtered_menu_items(category: str = None):
    """
    Returns a queryset of MenuItems, optionally filtered by category.
    """
    queryset = MenuItem.objects.all().order_by('category', 'name')
    if category:
        queryset = queryset.filter(category__iexact=category)
    return queryset


# ---------------------------------------------------------------------------
# Order / Cart Services
# ---------------------------------------------------------------------------

def recalculate_order_total(order):
    """
    Sums snapshot_rate * quantity for every item in the order and persists
    the total. Returns the updated order instance.
    """
    from django.db.models import F, Sum, DecimalField
    from decimal import Decimal

    agg = order.items.aggregate(
        total=Sum(F('snapshot_rate') * F('quantity'), output_field=DecimalField())
    )
    order.total_amount = agg['total'] or Decimal('0.00')
    order.save(update_fields=['total_amount'])
    return order


def create_draft_order():
    """
    Creates a new Order in DRAFT status.
    Attaches the current open shift if one exists.
    """
    from .models import Order, EODSettlement
    from django.utils import timezone

    # Try to attach to the current open shift
    current_shift = EODSettlement.objects.filter(closed_at__isnull=True).order_by('-opened_at').first()

    order = Order.objects.create(
        status=Order.StatusChoices.DRAFT,
        shift=current_shift,
    )
    return order


def handle_cart_action(order, action, data):
    """
    Unified cart mutation handler. Dispatches to add / update / remove
    based on the 'action' field.

    Supports customization: if snapshot_rate or special_instructions are
    provided in the data, they will be applied (with is_customizable enforcement).

    Returns the updated order instance (with items prefetched).

    Raises OrderNotEditableError if the order is not in DRAFT status.
    Raises MenuItemUnavailableError if the item is not available (add only).
    Raises ItemNotCustomizableError if overrides target a non-customizable item.
    """
    from .models import Order, OrderItem, MenuItem
    from hotel.custom_exceptions import (
        OrderNotEditableError, MenuItemUnavailableError, ItemNotCustomizableError,
        OrderLockedError,
    )

    # Gate: settled shift orders are permanently locked
    if order.shift_id is not None:
        raise OrderLockedError()

    # Gate: only DRAFT orders may be edited
    if order.status != Order.StatusChoices.DRAFT:
        raise OrderNotEditableError()

    if action == 'add':
        menu_item_id = data.get('menu_item_id')
        quantity = data.get('quantity', 1)
        special_instructions = data.get('special_instructions', '')
        custom_rate = data.get('snapshot_rate')  # optional override

        menu_item = MenuItem.objects.get(pk=menu_item_id)
        if not menu_item.is_available:
            raise MenuItemUnavailableError()

        # Determine the rate to use
        rate = menu_item.standard_rate
        if custom_rate is not None and custom_rate != menu_item.standard_rate:
            if not menu_item.is_customizable:
                raise ItemNotCustomizableError(
                    "Rate override is not allowed for non-customizable items. "
                    f"Expected ₹{menu_item.standard_rate}, got ₹{custom_rate}."
                )
            rate = custom_rate

        # Enforce special_instructions rule
        if special_instructions and not menu_item.is_customizable:
            raise ItemNotCustomizableError(
                "Special instructions are not allowed for non-customizable items."
            )

        # If a custom rate or instructions are provided, always create a new
        # line item (don't merge with existing) so each customization is distinct.
        has_customization = (custom_rate is not None and custom_rate != menu_item.standard_rate) or bool(special_instructions)

        if not has_customization:
            # Standard item — atomically increment via F()
            from django.db.models import F as DbF
            updated_rows = order.items.filter(menu_item=menu_item).update(
                quantity=DbF('quantity') + quantity
            )
            if not updated_rows:
                OrderItem.objects.create(
                    order=order,
                    menu_item=menu_item,
                    snapshot_rate=rate,
                    quantity=quantity,
                    special_instructions='',
                )
        else:
            # Customized item — always a new line
            OrderItem.objects.create(
                order=order,
                menu_item=menu_item,
                snapshot_rate=rate,
                quantity=quantity,
                special_instructions=special_instructions or '',
            )

    elif action == 'update':
        order_item_id = data.get('order_item_id')
        quantity = data.get('quantity', 1)
        special_instructions = data.get('special_instructions')
        custom_rate = data.get('snapshot_rate')

        item = order.items.select_related('menu_item').get(pk=order_item_id)

        # Enforce customization rules on update
        if custom_rate is not None and custom_rate != item.menu_item.standard_rate:
            if not item.menu_item.is_customizable:
                raise ItemNotCustomizableError(
                    "Rate override is not allowed for non-customizable items."
                )
            item.snapshot_rate = custom_rate

        if special_instructions is not None:
            if special_instructions and not item.menu_item.is_customizable:
                raise ItemNotCustomizableError(
                    "Special instructions are not allowed for non-customizable items."
                )
            item.special_instructions = special_instructions

        if quantity <= 0:
            item.delete()
        else:
            item.quantity = quantity
            item.save(update_fields=['quantity', 'snapshot_rate', 'special_instructions'])

    elif action == 'remove':
        order_item_id = data.get('order_item_id')
        order.items.filter(pk=order_item_id).delete()

    recalculate_order_total(order)
    # Refresh items for the response
    order.refresh_from_db()
    return order


def checkout_order(order, payment_method, cash_tendered=None):
    """
    Finalizes a DRAFT order to COMPLETED.

    - Explicitly locks the order row via select_for_update to prevent races.
    - Validates status == DRAFT (raises OrderNotEditableError otherwise).
    - Validates that the order has at least one item (raises EmptyOrderError).
    - Computes total from frozen snapshot_rate × quantity (never re-reads MenuItem).
    - Sets payment_method, computes change_due for CASH, transitions to COMPLETED.

    Returns the updated order.
    """
    from .models import Order
    from hotel.custom_exceptions import OrderNotEditableError, EmptyOrderError, OrderLockedError
    from decimal import Decimal

    # Lock the order row for the duration of this transaction
    locked_order = Order.objects.select_for_update().get(pk=order.pk)

    # Gate: settled shift orders are permanently locked
    if locked_order.shift_id is not None:
        raise OrderLockedError()

    # Explicit DRAFT gate
    if locked_order.status != Order.StatusChoices.DRAFT:
        raise OrderNotEditableError()

    # Must have items
    if not locked_order.items.exists():
        raise EmptyOrderError()

    # Compute total from snapshot_rates (already frozen at add-time)
    recalculate_order_total(locked_order)
    locked_order.refresh_from_db()

    # Set payment details
    locked_order.payment_method = payment_method

    if payment_method == 'CASH' and cash_tendered is not None:
        locked_order.cash_tendered = cash_tendered
        locked_order.change_due = cash_tendered - locked_order.total_amount
    else:
        locked_order.cash_tendered = None
        locked_order.change_due = Decimal('0.00')

    # Transition to COMPLETED
    locked_order.status = Order.StatusChoices.COMPLETED
    locked_order.save(update_fields=[
        'status', 'payment_method', 'total_amount',
        'cash_tendered', 'change_due',
    ])

    return locked_order


def void_order(order, pin, reason, voided_by_user=None):
    """
    Voids a COMPLETED order after PIN verification.

    - Only COMPLETED orders can be voided (DRAFT can be discarded, already-voided are rejected).
    - Verifies the provided PIN against the single AdminProfile.void_pin.
    - Transitions to CANCELLED-VOIDED, sets voided_at, void_reason.
    - Creates a VoidAuditLog entry recording who did it and when.

    Returns the updated order.

    Raises OrderNotVoidableError if order is not COMPLETED.
    Raises InvalidPinError if the PIN does not match.
    """
    from .models import Order, AdminProfile, VoidAuditLog
    from hotel.custom_exceptions import OrderNotVoidableError, InvalidPinError, OrderLockedError
    from django.utils import timezone
    from django.contrib.auth.hashers import check_password

    # Lock the order row
    locked_order = Order.objects.select_for_update().get(pk=order.pk)

    # Gate: settled shift orders are permanently locked
    if locked_order.shift_id is not None:
        raise OrderLockedError()

    # Only COMPLETED orders may be voided
    if locked_order.status != Order.StatusChoices.COMPLETED:
        if locked_order.status == Order.StatusChoices.DRAFT:
            raise OrderNotVoidableError(
                "DRAFT orders do not need voiding — simply discard them."
            )
        raise OrderNotVoidableError(
            "This order has already been voided or is not in a voidable state."
        )

    # Verify PIN against the single AdminProfile
    admin_profile = AdminProfile.objects.first()
    if not admin_profile:
        raise InvalidPinError("No Admin profile found. Cannot verify PIN.")

    if not check_password(pin, admin_profile.void_pin):
        raise InvalidPinError()

    # Record previous state for audit
    previous_status = locked_order.status

    # Transition to CANCELLED-VOIDED
    locked_order.status = Order.StatusChoices.CANCELLED_VOIDED
    locked_order.voided_at = timezone.now()
    locked_order.void_reason = reason
    locked_order.save(update_fields=['status', 'voided_at', 'void_reason'])

    # Create immutable audit log entry
    VoidAuditLog.objects.create(
        order=locked_order,
        previous_status=previous_status,
        void_reason=reason,
        pin_verified=True,
        voided_by=voided_by_user,
    )

    return locked_order


def get_daily_analytics(target_date=None):
    """
    Computes revenue and top-selling items for a given date.
    Explicitly excludes CANCELLED-VOIDED orders from all calculations.
    Defaults to today if no date is specified.

    Returns a dict with:
      - date
      - total_revenue
      - total_orders
      - total_voided
      - revenue_by_payment_method
      - top_items (top 10 by total quantity sold)
    """
    from .models import Order, OrderItem
    from django.db.models import Sum, Count, F, DecimalField, Q
    from django.utils import timezone
    from decimal import Decimal

    if target_date is None:
        target_date = timezone.localdate()

    # Base querysets for the target date
    all_today = Order.objects.filter(created_at__date=target_date)
    completed = all_today.filter(status=Order.StatusChoices.COMPLETED)
    voided = all_today.filter(status=Order.StatusChoices.CANCELLED_VOIDED)

    # Revenue aggregation (completed only)
    revenue_agg = completed.aggregate(
        total=Sum('total_amount', output_field=DecimalField())
    )
    total_revenue = revenue_agg['total'] or Decimal('0.00')

    # Revenue by payment method
    by_method = (
        completed
        .values('payment_method')
        .annotate(method_total=Sum('total_amount', output_field=DecimalField()))
        .order_by('payment_method')
    )
    revenue_by_method = {
        entry['payment_method']: str(entry['method_total'] or Decimal('0.00'))
        for entry in by_method
    }

    # Top-selling items today (from COMPLETED orders only)
    top_items = (
        OrderItem.objects
        .filter(order__in=completed)
        .values('menu_item__name', 'menu_item__category')
        .annotate(
            total_qty=Sum('quantity'),
            total_revenue=Sum(
                F('snapshot_rate') * F('quantity'),
                output_field=DecimalField()
            ),
        )
        .order_by('-total_qty')[:10]
    )

    top_items_list = [
        {
            'name': item['menu_item__name'],
            'category': item['menu_item__category'],
            'total_qty': item['total_qty'],
            'total_revenue': str(item['total_revenue'] or Decimal('0.00')),
        }
        for item in top_items
    ]

    return {
        'date': str(target_date),
        'total_revenue': str(total_revenue),
        'total_orders': completed.count(),
        'total_voided': voided.count(),
        'revenue_by_payment_method': revenue_by_method,
        'top_items': top_items_list,
    }


def generate_upi_link(order):
    """
    Builds a standard UPI deep-link string for the given order.

    Uses the hotel's configured UPI merchant ID and payee name
    from StoreConfiguration. Injects the Order ID as the transaction
    reference (tr) so it appears on both the customer's phone and
    the hotel's bank statement.

    Returns a dict with the deep_link string.
    Raises UpiNotConfiguredError if the merchant VPA is not set.
    """
    from .models import StoreConfiguration
    from hotel.custom_exceptions import UpiNotConfiguredError
    from urllib.parse import quote

    config = StoreConfiguration.load()
    if not config.upi_id:
        raise UpiNotConfiguredError()

    amount = f"{order.total_amount:.2f}"
    txn_ref = f"ORD-{order.id}"

    deep_link = (
        f"upi://pay"
        f"?pa={quote(config.upi_id)}"
        f"&pn={quote(config.upi_payee_name)}"
        f"&am={amount}"
        f"&cu=INR"
        f"&tr={txn_ref}"
    )

    return {
        'deep_link': deep_link,
        'upi_id': config.upi_id,
        'payee_name': config.upi_payee_name,
        'amount': amount,
        'transaction_ref': txn_ref,
    }

def get_food_ranking():
    """
    Returns ALL menu items ranked by quantity sold from COMPLETED orders
    in the trailing 24 hours.

    Uses conditional aggregation so items with zero sales still appear
    at the bottom of the list.
    """
    from .models import MenuItem, Order
    from django.db.models import Sum, Q, IntegerField
    from django.db.models.functions import Coalesce
    from django.utils import timezone
    from datetime import timedelta

    since = timezone.now() - timedelta(hours=24)

    ranking = (
        MenuItem.objects.all()
        .annotate(
            total_qty=Coalesce(
                Sum(
                    'order_items__quantity',
                    filter=Q(
                        order_items__order__status=Order.StatusChoices.COMPLETED,
                        order_items__order__created_at__gte=since,
                    ),
                ),
                0,
                output_field=IntegerField(),
            )
        )
        .order_by('-total_qty', 'name')
    )

    return [
        {
            'id': item.id,
            'name': item.name,
            'category': item.category,
            'total_qty': item.total_qty,
            'is_available': item.is_available,
        }
        for item in ranking
    ]


def run_eod_settlement(physical_cash_counted, notes=''):
    """
    Runs the End-of-Day settlement.

    Aggregates all COMPLETED orders that are NOT yet attached to any
    settlement (shift__isnull=True), regardless of calendar date.
    This ensures the settlement captures everything since the last
    settlement, even across midnight.

    - Computes system_cash_total and system_upi_total.
    - Computes discrepancy = physical_cash_counted - system_cash_total.
    - Creates an EODSettlement record.
    - Bulk-updates all unattached orders to link to this settlement (locks them).

    Returns the created EODSettlement.
    Raises ShiftAlreadySettledError if no unattached orders exist.
    """
    from .models import Order, EODSettlement
    from hotel.custom_exceptions import ShiftAlreadySettledError
    from django.db.models import Sum, DecimalField, Q
    from django.utils import timezone
    from decimal import Decimal

    # All completed, unattached orders
    unsettled = Order.objects.filter(
        shift__isnull=True,
        status=Order.StatusChoices.COMPLETED,
    )

    if not unsettled.exists():
        raise ShiftAlreadySettledError()

    # Aggregate system totals
    agg = unsettled.aggregate(
        cash_total=Sum(
            'total_amount',
            filter=Q(payment_method=Order.PaymentMethodChoices.CASH),
            output_field=DecimalField(),
        ),
        upi_total=Sum(
            'total_amount',
            filter=Q(payment_method=Order.PaymentMethodChoices.UPI),
            output_field=DecimalField(),
        ),
    )

    system_cash = agg['cash_total'] or Decimal('0.00')
    system_upi = agg['upi_total'] or Decimal('0.00')
    discrepancy = Decimal(str(physical_cash_counted)) - system_cash

    # Create EODSettlement record
    settlement = EODSettlement.objects.create(
        shift_date=timezone.localdate(),
        system_cash_total=system_cash,
        system_upi_total=system_upi,
        physical_cash_counted=physical_cash_counted,
        discrepancy=discrepancy,
        closed_at=timezone.now(),
        notes=notes or '',
    )

    # Lock all unsettled orders (COMPLETED + VOIDED + DRAFT) by attaching to this shift
    Order.objects.filter(shift__isnull=True).update(shift=settlement)

    return settlement


def preview_eod_settlement():
    """
    Returns a read-only preview of the current unsettled shift totals.

    Does NOT create any records or lock any orders.
    Used by the frontend Settlement screen to display system totals
    before the admin enters the physical cash count (Blind Drop pattern).

    Returns a dict with:
      - system_cash_total
      - system_upi_total
      - unsettled_order_count
    """
    from .models import Order
    from django.db.models import Sum, DecimalField, Q
    from decimal import Decimal

    unsettled = Order.objects.filter(
        shift__isnull=True,
        status=Order.StatusChoices.COMPLETED,
    )

    count = unsettled.count()

    if count == 0:
        return {
            'system_cash_total': '0.00',
            'system_upi_total': '0.00',
            'unsettled_order_count': 0,
        }

    agg = unsettled.aggregate(
        cash_total=Sum(
            'total_amount',
            filter=Q(payment_method=Order.PaymentMethodChoices.CASH),
            output_field=DecimalField(),
        ),
        upi_total=Sum(
            'total_amount',
            filter=Q(payment_method=Order.PaymentMethodChoices.UPI),
            output_field=DecimalField(),
        ),
    )

    return {
        'system_cash_total': str(agg['cash_total'] or Decimal('0.00')),
        'system_upi_total': str(agg['upi_total'] or Decimal('0.00')),
        'unsettled_order_count': count,
    }
