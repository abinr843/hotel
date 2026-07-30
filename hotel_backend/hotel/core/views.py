from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.throttling import ScopedRateThrottle
from django.db import transaction
from drf_spectacular.utils import extend_schema, OpenApiResponse, inline_serializer
from rest_framework import serializers as drf_serializers

from .models import MenuItem, Order, VoidAuditLog, EODSettlement
from .serializers import (
    MenuItemSerializer, OrderSerializer, CartActionSerializer,
    CheckoutSerializer, VoidOrderSerializer, VoidAuditLogSerializer,
    EODSettlementSerializer, SettlementCreateSerializer,
)
from .services import (
    check_database_health,
    toggle_menu_item_availability,
    get_filtered_menu_items,
    create_draft_order,
    handle_cart_action,
    checkout_order,
    void_order,
    get_daily_analytics,
    generate_upi_link,
    get_food_ranking,
    run_eod_settlement,
    preview_eod_settlement,
)


@extend_schema(
    summary='Health Check',
    description='Returns database connectivity status.',
    responses={200: OpenApiResponse(description='Database is healthy'), 503: OpenApiResponse(description='Database unreachable')},
    tags=['System'],
)
@api_view(['GET'])
@permission_classes([AllowAny])
def health_check_view(request):
    """
    Minimal view for the health check. Delegates logic to services.py.
    """
    health_status = check_database_health()
    status_code = 200 if health_status.get("status") == "ok" else 503
    return Response(health_status, status=status_code)


class MenuItemViewSet(viewsets.ModelViewSet):
    """
    Full CRUD ViewSet for MenuItem.
    Supports category filtering via ?category=<value> query param.
    """
    serializer_class = MenuItemSerializer

    def get_queryset(self):
        """Delegate filtering to the service layer."""
        category = self.request.query_params.get('category')
        return get_filtered_menu_items(category=category)

    @extend_schema(
        summary='Toggle Availability',
        description='Flips the is_available flag on a menu item.',
        request=None,
        responses={200: MenuItemSerializer},
        tags=['Menu'],
    )
    @action(detail=True, methods=['patch'], url_path='toggle-availability')
    def toggle_availability(self, request, pk=None):
        """
        Instantly flips the is_available flag on a single menu item.
        No other field changes are accepted.
        """
        menu_item = self.get_object()
        updated_item = toggle_menu_item_availability(menu_item)
        serializer = self.get_serializer(updated_item)
        return Response(serializer.data)


class OrderViewSet(viewsets.GenericViewSet):
    """
    Manages Order lifecycle.
    - POST /orders/create-draft/  → create a new DRAFT order
    - GET  /orders/{id}/          → retrieve full order state
    - GET  /orders/               → list orders (filterable by status, today only)
    - POST /orders/{id}/cart/     → unified add / update / remove
    - POST /orders/{id}/checkout/ → finalize DRAFT → COMPLETED
    - POST /orders/{id}/void/     → void COMPLETED → CANCELLED-VOIDED (PIN-gated)
    - GET  /orders/{id}/upi-link/ → generate UPI deep link for the order
    """
    serializer_class = OrderSerializer

    def get_queryset(self):
        return Order.objects.prefetch_related('items__menu_item').all()

    def list(self, request):
        """
        List orders, optionally filtered by ?status= and defaulting to today.
        Supports: ?status=COMPLETED&date=today (or YYYY-MM-DD)
        """
        from django.utils import timezone

        queryset = self.get_queryset()

        # Filter by status
        status_filter = request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Filter by date (defaults to today)
        date_filter = request.query_params.get('date', 'today')
        if date_filter == 'today':
            queryset = queryset.filter(created_at__date=timezone.localdate())
        elif date_filter != 'all':
            queryset = queryset.filter(created_at__date=date_filter)

        queryset = queryset.order_by('-created_at')
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        """Return full order with nested items."""
        order = self.get_object()
        serializer = self.get_serializer(order)
        return Response(serializer.data)

    @extend_schema(
        summary='Create Draft Order',
        description='Creates a new empty DRAFT order.',
        request=None,
        responses={201: OrderSerializer},
        tags=['Orders'],
    )
    @action(detail=False, methods=['post'], url_path='create-draft')
    def create_draft(self, request):
        """Create a new empty DRAFT order."""
        order = create_draft_order()
        serializer = self.get_serializer(order)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        summary='Cart Mutation',
        description='Add, update, or remove items from a DRAFT order.',
        request=CartActionSerializer,
        responses={200: OrderSerializer},
        tags=['Orders'],
    )
    @action(detail=True, methods=['post'], url_path='cart')
    def cart(self, request, pk=None):
        """
        Unified cart mutation endpoint.
        Body: { action: "add"|"update"|"remove", menu_item_id?, order_item_id?, quantity?,
                snapshot_rate?, special_instructions? }
        """
        order = self.get_object()
        cart_serializer = CartActionSerializer(data=request.data)
        cart_serializer.is_valid(raise_exception=True)

        validated = cart_serializer.validated_data
        updated_order = handle_cart_action(order, validated['action'], validated)

        serializer = self.get_serializer(updated_order)
        return Response(serializer.data)

    @extend_schema(
        summary='Checkout',
        description='Finalize a DRAFT order to COMPLETED.',
        request=CheckoutSerializer,
        responses={200: OrderSerializer},
        tags=['Orders'],
    )
    @action(detail=True, methods=['post'], url_path='checkout')
    def checkout(self, request, pk=None):
        """
        Finalize a DRAFT order to COMPLETED.
        Body: { payment_method: "CASH"|"UPI"|"CARD", cash_tendered?: decimal }
        """
        order = self.get_object()
        checkout_serializer = CheckoutSerializer(data=request.data)
        checkout_serializer.is_valid(raise_exception=True)

        validated = checkout_serializer.validated_data
        with transaction.atomic():
            completed_order = checkout_order(
                order,
                payment_method=validated['payment_method'],
                cash_tendered=validated.get('cash_tendered'),
            )

        serializer = self.get_serializer(completed_order)
        return Response(serializer.data)

    @extend_schema(
        summary='Void Order',
        description='Void a COMPLETED order. Requires Manager PIN. Rate-limited to 5 attempts/minute.',
        request=VoidOrderSerializer,
        responses={200: OrderSerializer},
        tags=['Orders'],
    )
    @action(detail=True, methods=['post'], url_path='void',
            throttle_classes=[ScopedRateThrottle])
    def void(self, request, pk=None):
        """
        Void a COMPLETED order (PIN-gated).
        Body: { pin: "1234", reason: "Customer complaint" }
        """
        self.throttle_scope = 'void_attempt'
        order = self.get_object()
        void_serializer = VoidOrderSerializer(data=request.data)
        void_serializer.is_valid(raise_exception=True)

        validated = void_serializer.validated_data
        with transaction.atomic():
            voided_order = void_order(
                order,
                pin=validated['pin'],
                reason=validated['reason'],
                voided_by_user=request.user if request.user.is_authenticated else None,
            )

        serializer = self.get_serializer(voided_order)
        return Response(serializer.data)

    @extend_schema(
        summary='Generate UPI Link',
        description='Generates a UPI deep-link string for the order, usable as a QR code.',
        request=None,
        responses={200: OpenApiResponse(description='UPI deep link payload')},
        tags=['Orders'],
    )
    @action(detail=True, methods=['get'], url_path='upi-link')
    def upi_link(self, request, pk=None):
        """
        Generate a UPI deep-link string for the order.
        Returns { deep_link, upi_id, payee_name, amount, transaction_ref }.
        The deep_link can be rendered as a QR code on the frontend.
        """
        order = self.get_object()
        data = generate_upi_link(order)
        return Response(data)


class VoidAuditLogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    Read-only viewset for the void audit trail.
    GET /api/void-logs/ → list all void audit entries (newest first).
    """
    serializer_class = VoidAuditLogSerializer

    def get_queryset(self):
        return VoidAuditLog.objects.select_related('order', 'voided_by').all()


@extend_schema(
    summary='Daily Analytics',
    description='Revenue, order counts, and top-selling items. Supports ?date=YYYY-MM-DD.',
    responses={200: OpenApiResponse(description='Analytics payload')},
    tags=['Analytics'],
)
@api_view(['GET'])
@permission_classes([AllowAny])
def analytics_view(request):
    """
    Daily analytics: revenue, order counts, top items.
    Voided orders are explicitly excluded from revenue totals.
    Supports ?date=YYYY-MM-DD for past-day queries (defaults to today).
    """
    from datetime import date as date_type

    date_param = request.query_params.get('date')
    target_date = None

    if date_param:
        try:
            target_date = date_type.fromisoformat(date_param)
        except ValueError:
            return Response(
                {'error': True, 'message': 'Invalid date format. Use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    data = get_daily_analytics(target_date=target_date)
    return Response(data)


@extend_schema(
    summary='Store Settings',
    description='GET returns current settings. POST updates UPI config and/or Admin PIN.',
    request=inline_serializer(
        name='SettingsRequest',
        fields={
            'upi_id': drf_serializers.CharField(required=False),
            'upi_payee_name': drf_serializers.CharField(required=False),
            'admin_pin': drf_serializers.CharField(required=False),
        },
    ),
    responses={200: inline_serializer(
        name='SettingsResponse',
        fields={
            'upi_id': drf_serializers.CharField(),
            'upi_payee_name': drf_serializers.CharField(),
            'has_admin_pin': drf_serializers.BooleanField(),
            'message': drf_serializers.CharField(required=False),
        },
    )},
    tags=['Settings'],
)
@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def settings_view(request):
    """
    Manages global store settings and Admin PIN.
    GET: Returns upi_id, upi_payee_name, has_admin_pin
    POST: Updates StoreConfiguration. If admin_pin is provided, updates the AdminProfile.
    """
    from .models import StoreConfiguration, AdminProfile
    from django.contrib.auth.models import User
    from django.contrib.auth.hashers import make_password
    from .serializers import SettingsSerializer

    config = StoreConfiguration.load()
    has_admin_pin = AdminProfile.objects.exists()

    if request.method == 'GET':
        return Response({
            'upi_id': config.upi_id,
            'upi_payee_name': config.upi_payee_name,
            'has_admin_pin': has_admin_pin,
        })

    if request.method == 'POST':
        serializer = SettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        # Update UPI Config
        if 'upi_id' in validated:
            config.upi_id = validated['upi_id']
        if 'upi_payee_name' in validated:
            config.upi_payee_name = validated['upi_payee_name']
        config.save()

        # Update Admin PIN
        new_pin = validated.get('admin_pin')
        if new_pin:
            # Tie AdminProfile to the first user for this simple POS setup
            user = User.objects.first()
            if not user:
                # Fallback if no users exist (rare, usually a superuser exists)
                user = User.objects.create_user(username='admin', password='password')
            
            profile, _ = AdminProfile.objects.get_or_create(user=user)
            profile.void_pin = make_password(new_pin)
            profile.save()
            has_admin_pin = True

        return Response({
            'upi_id': config.upi_id,
            'upi_payee_name': config.upi_payee_name,
            'has_admin_pin': has_admin_pin,
            'message': 'Settings saved successfully.',
        })


@extend_schema(
    summary='Food Ranking',
    description='All menu items ranked by quantity sold in the trailing 24 hours.',
    responses={200: OpenApiResponse(description='Ranked list of menu items')},
    tags=['Analytics'],
)
@api_view(['GET'])
@permission_classes([AllowAny])
def food_ranking_view(request):
    """
    Returns ALL menu items ranked by quantity sold in the trailing 24 hours.
    Items with zero sales appear at the bottom.
    """
    data = get_food_ranking()
    return Response(data)


class EODSettlementViewSet(viewsets.GenericViewSet, mixins.ListModelMixin):
    """
    Manages End-of-Day Settlements.
    POST /api/settlements/          → create a new settlement
    GET  /api/settlements/          → list settlement history
    GET  /api/settlements/{id}/pdf/ → download settlement PDF
    """
    serializer_class = EODSettlementSerializer

    def get_queryset(self):
        return EODSettlement.objects.prefetch_related('orders').order_by('-closed_at')

    @extend_schema(
        summary='Create Settlement',
        description='Run End-of-Day settlement. Locks all unsettled orders.',
        request=SettlementCreateSerializer,
        responses={201: EODSettlementSerializer},
        tags=['Settlements'],
    )
    def create(self, request):
        """Create a new EOD settlement."""
        create_serializer = SettlementCreateSerializer(data=request.data)
        create_serializer.is_valid(raise_exception=True)
        validated = create_serializer.validated_data

        with transaction.atomic():
            settlement = run_eod_settlement(
                physical_cash_counted=validated['physical_cash_counted'],
                notes=validated.get('notes', ''),
            )

        serializer = self.get_serializer(settlement)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        summary='Download Settlement PDF',
        description='Generate and download a PDF report for a specific settlement.',
        responses={(200, 'application/pdf'): bytes},
        tags=['Settlements'],
    )
    @action(detail=True, methods=['get'], url_path='pdf')
    def download_pdf(self, request, pk=None):
        """
        Generate and download a PDF report for a specific settlement.
        """
        from django.http import HttpResponse
        from .pdf_utils import generate_settlement_pdf

        settlement = self.get_object()
        pdf_buffer = generate_settlement_pdf(settlement)

        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="settlement_{settlement.shift_date}.pdf"'
        return response

    @extend_schema(
        summary='Preview Settlement',
        description='Returns system-computed cash and UPI totals for unsettled orders without creating a record.',
        request=None,
        responses={200: OpenApiResponse(description='Preview of current shift totals')},
        tags=['Settlements'],
    )
    @action(detail=False, methods=['get'], url_path='preview')
    def preview(self, request):
        """
        Read-only preview of the current unsettled shift totals.
        Used by the frontend to show system totals in the Blind Drop flow.
        """
        data = preview_eod_settlement()
        return Response(data)


@extend_schema(
    summary='Setup Status',
    description='Returns whether the initial admin account has been created. Public endpoint.',
    responses={200: OpenApiResponse(description='Setup status')},
    tags=['System'],
)
@api_view(['GET'])
@permission_classes([AllowAny])
def setup_status_view(request):
    """
    Returns { needs_setup: true } if no superuser exists in the database.
    The frontend uses this to decide whether to show the one-time signup screen.
    """
    from django.contrib.auth.models import User
    has_superuser = User.objects.filter(is_superuser=True).exists()
    return Response({'needs_setup': not has_superuser})


@extend_schema(
    summary='Initial Setup',
    description='One-time admin registration. Only works when no superuser exists.',
    request=inline_serializer(
        name='SetupRequest',
        fields={
            'username': drf_serializers.CharField(),
            'password': drf_serializers.CharField(),
            'email': drf_serializers.EmailField(required=False),
        },
    ),
    responses={
        201: OpenApiResponse(description='Admin created successfully'),
        403: OpenApiResponse(description='Setup already completed'),
    },
    tags=['System'],
)
@api_view(['POST'])
@permission_classes([AllowAny])
def setup_view(request):
    """
    One-time admin account creation.
    Refuses to create if a superuser already exists — this locks the endpoint permanently.
    """
    from django.contrib.auth.models import User

    if User.objects.filter(is_superuser=True).exists():
        return Response(
            {'error': True, 'message': 'Setup has already been completed. An admin account exists.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    username = request.data.get('username', '').strip()
    password = request.data.get('password', '')
    email = request.data.get('email', '').strip()

    if not username or not password:
        return Response(
            {'error': True, 'message': 'Username and password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(password) < 6:
        return Response(
            {'error': True, 'message': 'Password must be at least 6 characters.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(username=username).exists():
        return Response(
            {'error': True, 'message': 'This username is already taken.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    User.objects.create_superuser(username=username, email=email, password=password)
    return Response(
        {'message': f'Admin account "{username}" created successfully. You can now log in.'},
        status=status.HTTP_201_CREATED,
    )

