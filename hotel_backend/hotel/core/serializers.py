from rest_framework import serializers
from .models import MenuItem, OrderItem, Order, VoidAuditLog, EODSettlement
from .validators import validate_positive_rate
from hotel.custom_exceptions import ItemNotCustomizableError


class MenuItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuItem
        fields = ['id', 'name', 'standard_rate', 'category', 'is_available', 'is_customizable']

    def validate_standard_rate(self, value):
        """Delegate rate validation to the centralized validator."""
        return validate_positive_rate(value)


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ['id', 'order', 'menu_item', 'snapshot_rate', 'quantity', 'special_instructions']

    def validate(self, attrs):
        """
        Enforce customizable-item business rules:
        - If the menu item is NOT customizable, reject special_instructions.
        - If the menu item is NOT customizable, snapshot_rate must equal standard_rate.
        """
        menu_item = attrs.get('menu_item')

        if menu_item and not menu_item.is_customizable:
            # Block special instructions on non-customizable items
            if attrs.get('special_instructions'):
                raise ItemNotCustomizableError(
                    "Special instructions are not allowed for non-customizable items."
                )

            # Block rate overrides on non-customizable items
            snapshot_rate = attrs.get('snapshot_rate')
            if snapshot_rate is not None and snapshot_rate != menu_item.standard_rate:
                raise ItemNotCustomizableError(
                    "Rate override is not allowed for non-customizable items. "
                    f"Expected ₹{menu_item.standard_rate}, got ₹{snapshot_rate}."
                )

        return attrs


# ---------------------------------------------------------------------------
# Order Serializers
# ---------------------------------------------------------------------------

class OrderItemReadSerializer(serializers.ModelSerializer):
    """Read-only nested serializer for order items shown inside OrderSerializer."""
    menu_item_name = serializers.CharField(source='menu_item.name', read_only=True)
    menu_item_category = serializers.CharField(source='menu_item.category', read_only=True)
    is_customizable = serializers.BooleanField(source='menu_item.is_customizable', read_only=True)
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = [
            'id', 'menu_item', 'menu_item_name', 'menu_item_category',
            'is_customizable', 'snapshot_rate', 'quantity', 'special_instructions', 'line_total',
        ]

    def get_line_total(self, obj) -> str:
        return str(obj.snapshot_rate * obj.quantity)


class OrderSerializer(serializers.ModelSerializer):
    """Full order representation including nested items and computed totals."""
    items = OrderItemReadSerializer(many=True, read_only=True)
    item_count = serializers.SerializerMethodField()
    payment_summary = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'status', 'total_amount',
            'cash_amount', 'upi_amount', 'card_amount',
            'cash_tendered', 'change_due',
            'table_number',
            'created_at', 'voided_at', 'void_reason',
            'item_count', 'items', 'payment_summary',
        ]

    def get_item_count(self, obj) -> int:
        return sum(item.quantity for item in obj.items.all())

    def get_payment_summary(self, obj) -> str:
        """Human-readable payment breakdown for display."""
        if obj.status == 'DRAFT':
            return ''
        parts = []
        if obj.cash_amount > 0:
            parts.append(f'Cash ₹{obj.cash_amount}')
        if obj.upi_amount > 0:
            parts.append(f'UPI ₹{obj.upi_amount}')
        if obj.card_amount > 0:
            parts.append(f'Card ₹{obj.card_amount}')
        return ' + '.join(parts) if parts else '—'


class CartActionSerializer(serializers.Serializer):
    """
    Validates the unified cart endpoint payload.
    action: 'add' | 'update' | 'remove'
    Supports optional snapshot_rate override and special_instructions for customizable items.
    """
    ACTION_CHOICES = [('add', 'Add'), ('update', 'Update'), ('remove', 'Remove')]

    action = serializers.ChoiceField(choices=ACTION_CHOICES)
    menu_item_id = serializers.IntegerField(required=False)
    order_item_id = serializers.IntegerField(required=False)
    quantity = serializers.IntegerField(required=False, min_value=0, default=1)
    snapshot_rate = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False,
        min_value=0,  # strict MinValueValidator — no negative rates
    )
    special_instructions = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        action = attrs.get('action')
        if action == 'add' and not attrs.get('menu_item_id'):
            raise serializers.ValidationError({'menu_item_id': 'Required for add action.'})
        if action in ('update', 'remove') and not attrs.get('order_item_id'):
            raise serializers.ValidationError({'order_item_id': f'Required for {action} action.'})
        return attrs


class CheckoutSerializer(serializers.Serializer):
    """
    Validates checkout payload for split payments.
    The sum of cash_amount + upi_amount + card_amount must equal the order total.
    cash_tendered is required when cash_amount > 0.
    """
    cash_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=0, min_value=0,
    )
    upi_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=0, min_value=0,
    )
    card_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=0, min_value=0,
    )
    cash_tendered = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, min_value=0,
    )

    def validate(self, attrs):
        from decimal import Decimal
        cash = attrs.get('cash_amount') or Decimal('0')
        upi = attrs.get('upi_amount') or Decimal('0')
        card = attrs.get('card_amount') or Decimal('0')
        total_payment = cash + upi + card

        if total_payment <= 0:
            raise serializers.ValidationError(
                'At least one payment amount must be greater than zero.'
            )

        if cash > 0:
            tendered = attrs.get('cash_tendered')
            if not tendered or tendered <= 0:
                raise serializers.ValidationError(
                    {'cash_tendered': 'Cash tendered is required when paying with cash.'}
                )
            if tendered < cash:
                raise serializers.ValidationError(
                    {'cash_tendered': f'Cash tendered must be at least ₹{cash}.'}
                )
        return attrs


class CreateDraftSerializer(serializers.Serializer):
    """Validates draft order creation payload."""
    table_number = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')


class VoidOrderSerializer(serializers.Serializer):
    """
    Validates the void-order payload: Admin PIN + reason text.
    """
    pin = serializers.CharField(max_length=128)
    reason = serializers.CharField(max_length=500)

    def validate_reason(self, value):
        if not value.strip():
            raise serializers.ValidationError('A void reason is required.')
        return value.strip()


class VoidAuditLogSerializer(serializers.ModelSerializer):
    """Read-only serializer for the void audit trail."""
    order_id = serializers.IntegerField(source='order.id', read_only=True)
    voided_by_username = serializers.CharField(
        source='voided_by.username', read_only=True, default=None,
    )

    class Meta:
        model = VoidAuditLog
        fields = [
            'id', 'order_id', 'previous_status', 'void_reason',
            'pin_verified', 'voided_by_username', 'timestamp',
        ]


class SettingsSerializer(serializers.Serializer):
    """
    Validates settings updates for the frontend Settings panel.
    """
    upi_id = serializers.CharField(max_length=100, allow_blank=True, required=False)
    upi_payee_name = serializers.CharField(max_length=200, allow_blank=True, required=False)
    admin_pin = serializers.CharField(max_length=128, required=False, allow_blank=True)


class EODSettlementSerializer(serializers.ModelSerializer):
    """Read-only serializer for settlement history."""
    order_count = serializers.SerializerMethodField()

    class Meta:
        model = EODSettlement
        fields = [
            'id', 'shift_date', 'system_cash_total', 'system_upi_total',
            'physical_cash_counted', 'discrepancy', 'opened_at', 'closed_at',
            'notes', 'order_count',
        ]

    def get_order_count(self, obj) -> int:
        return obj.orders.filter(status='COMPLETED').count()


class SettlementCreateSerializer(serializers.Serializer):
    """Validates the settlement creation payload."""
    physical_cash_counted = serializers.DecimalField(max_digits=12, decimal_places=2)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
