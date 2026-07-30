from django.test import TestCase
from django.urls import reverse
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from decimal import Decimal

from core.models import MenuItem, Order, OrderItem, AdminProfile


class HealthCheckTest(TestCase):
    def test_health_check(self):
        url = reverse('health_check')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "database": "connected"})


class OrderPriceSnapshotTest(TestCase):
    """
    Regression test: confirms that once an order is finalized (COMPLETED),
    the historical total_amount and snapshot_rate values are permanently
    frozen and never change when the MenuItem's standard_rate changes afterward.
    """

    def setUp(self):
        """Set up test user, API client, and a sample menu item."""
        self.user = User.objects.create_user(username='cashier', password='testpass123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.menu_item = MenuItem.objects.create(
            name='Butter Chicken',
            standard_rate=Decimal('350.00'),
            category='Main Course',
            is_available=True,
            is_customizable=False,
        )

    def test_order_price_snapshot_permanence(self):
        """
        1. Create a DRAFT order and add a menu item.
        2. Finalize the order (checkout).
        3. Mutate the original MenuItem's standard_rate.
        4. Assert that the Order's total_amount and the OrderItem's
           snapshot_rate remain completely unaffected.
        """
        original_rate = Decimal('350.00')
        quantity = 2
        expected_total = original_rate * quantity  # ₹700.00

        # Step 1: Create draft order
        response = self.client.post(reverse('order-create-draft'))
        self.assertEqual(response.status_code, 201)
        order_id = response.data['id']

        # Step 2: Add the item to the order
        response = self.client.post(
            reverse('order-cart', kwargs={'pk': order_id}),
            {'action': 'add', 'menu_item_id': self.menu_item.id, 'quantity': quantity},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data['total_amount']), expected_total)

        # Step 3: Checkout the order (finalize as COMPLETED)
        response = self.client.post(
            reverse('order-checkout', kwargs={'pk': order_id}),
            {'payment_method': 'UPI'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'COMPLETED')
        self.assertEqual(Decimal(response.data['total_amount']), expected_total)

        # Step 4: Mutate the menu item's price AFTER checkout
        self.menu_item.standard_rate = Decimal('500.00')
        self.menu_item.save()

        # Step 5: Re-read the order from the database — total must be frozen
        order = Order.objects.get(pk=order_id)
        self.assertEqual(order.total_amount, expected_total,
                         "Order total_amount changed after MenuItem price update!")
        self.assertEqual(order.status, 'COMPLETED')

        # Step 6: Verify the individual OrderItem's snapshot_rate is frozen
        order_item = OrderItem.objects.get(order=order)
        self.assertEqual(order_item.snapshot_rate, original_rate,
                         "OrderItem snapshot_rate changed after MenuItem price update!")
        self.assertEqual(order_item.quantity, quantity)

        # Step 7: Confirm attempting to edit a COMPLETED order is rejected
        response = self.client.post(
            reverse('order-cart', kwargs={'pk': order_id}),
            {'action': 'add', 'menu_item_id': self.menu_item.id, 'quantity': 1},
            format='json',
        )
        self.assertEqual(response.status_code, 409,
                         "Should reject edits to COMPLETED orders with 409!")

    def test_checkout_empty_order_rejected(self):
        """Attempting to checkout an empty draft must fail."""
        response = self.client.post(reverse('order-create-draft'))
        order_id = response.data['id']

        response = self.client.post(
            reverse('order-checkout', kwargs={'pk': order_id}),
            {'payment_method': 'CASH', 'cash_tendered': '500.00'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_checkout_cash_change_calculation(self):
        """CASH checkout must compute correct change_due."""
        response = self.client.post(reverse('order-create-draft'))
        order_id = response.data['id']

        self.client.post(
            reverse('order-cart', kwargs={'pk': order_id}),
            {'action': 'add', 'menu_item_id': self.menu_item.id, 'quantity': 1},
            format='json',
        )

        response = self.client.post(
            reverse('order-checkout', kwargs={'pk': order_id}),
            {'payment_method': 'CASH', 'cash_tendered': '500.00'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data['total_amount']), Decimal('350.00'))

        order = Order.objects.get(pk=order_id)
        self.assertEqual(order.cash_tendered, Decimal('500.00'))
        self.assertEqual(order.change_due, Decimal('150.00'))


class CustomizableItemTest(TestCase):
    """Tests for customization rules: rate overrides and special instructions."""

    def setUp(self):
        self.user = User.objects.create_user(username='cashier2', password='testpass123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.standard_item = MenuItem.objects.create(
            name='Plain Rice', standard_rate=Decimal('80.00'),
            category='Sides', is_available=True, is_customizable=False,
        )
        self.custom_item = MenuItem.objects.create(
            name='Biryani', standard_rate=Decimal('250.00'),
            category='Main Course', is_available=True, is_customizable=True,
        )

    def test_rate_override_on_customizable_item(self):
        """Customizable items should accept snapshot_rate overrides."""
        response = self.client.post(reverse('order-create-draft'))
        order_id = response.data['id']

        response = self.client.post(
            reverse('order-cart', kwargs={'pk': order_id}),
            {
                'action': 'add',
                'menu_item_id': self.custom_item.id,
                'quantity': 1,
                'snapshot_rate': '300.00',
                'special_instructions': 'Extra spicy',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        item = response.data['items'][0]
        self.assertEqual(Decimal(item['snapshot_rate']), Decimal('300.00'))
        self.assertEqual(item['special_instructions'], 'Extra spicy')

    def test_rate_override_on_standard_item_rejected(self):
        """Non-customizable items must reject rate overrides."""
        response = self.client.post(reverse('order-create-draft'))
        order_id = response.data['id']

        response = self.client.post(
            reverse('order-cart', kwargs={'pk': order_id}),
            {
                'action': 'add',
                'menu_item_id': self.standard_item.id,
                'quantity': 1,
                'snapshot_rate': '100.00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_special_instructions_on_standard_item_rejected(self):
        """Non-customizable items must reject special instructions."""
        response = self.client.post(reverse('order-create-draft'))
        order_id = response.data['id']

        response = self.client.post(
            reverse('order-cart', kwargs={'pk': order_id}),
            {
                'action': 'add',
                'menu_item_id': self.standard_item.id,
                'quantity': 1,
                'special_instructions': 'No onions',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)


class VoidOrderTest(TestCase):
    """Tests for the PIN-gated void workflow and audit trail."""

    def setUp(self):
        from django.contrib.auth.hashers import make_password
        from core.models import AdminProfile

        self.user = User.objects.create_user(username='void_cashier', password='testpass123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        # Create AdminProfile with a hashed PIN
        self.admin_user = User.objects.create_user(username='void_admin', password='adminpass')
        self.admin_profile, _ = AdminProfile.objects.get_or_create(
            user=self.admin_user,
            defaults={'void_pin': make_password('1234')},
        )

        self.menu_item = MenuItem.objects.create(
            name='Dal Makhani', standard_rate=Decimal('220.00'),
            category='Main Course', is_available=True, is_customizable=False,
        )

    def _create_completed_order(self):
        """Helper: create a draft, add item, checkout → COMPLETED."""
        res = self.client.post(reverse('order-create-draft'))
        order_id = res.data['id']
        self.client.post(
            reverse('order-cart', kwargs={'pk': order_id}),
            {'action': 'add', 'menu_item_id': self.menu_item.id, 'quantity': 2},
            format='json',
        )
        self.client.post(
            reverse('order-checkout', kwargs={'pk': order_id}),
            {'payment_method': 'UPI'}, format='json',
        )
        return order_id

    def test_void_with_correct_pin(self):
        """Voiding with the correct PIN should succeed."""
        order_id = self._create_completed_order()

        response = self.client.post(
            reverse('order-void', kwargs={'pk': order_id}),
            {'pin': '1234', 'reason': 'Customer complaint'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'CANCELLED-VOIDED')
        self.assertEqual(response.data['void_reason'], 'Customer complaint')
        self.assertIsNotNone(response.data['voided_at'])

    def test_void_with_wrong_pin(self):
        """Voiding with a wrong PIN should fail with 403."""
        order_id = self._create_completed_order()

        response = self.client.post(
            reverse('order-void', kwargs={'pk': order_id}),
            {'pin': '9999', 'reason': 'Test void'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_void_draft_order_rejected(self):
        """DRAFT orders should not be voidable."""
        res = self.client.post(reverse('order-create-draft'))
        order_id = res.data['id']

        response = self.client.post(
            reverse('order-void', kwargs={'pk': order_id}),
            {'pin': '1234', 'reason': 'Mistake'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_void_already_voided_rejected(self):
        """Already-voided orders cannot be re-voided."""
        order_id = self._create_completed_order()

        # First void
        self.client.post(
            reverse('order-void', kwargs={'pk': order_id}),
            {'pin': '1234', 'reason': 'First void'},
            format='json',
        )

        # Second void attempt
        response = self.client.post(
            reverse('order-void', kwargs={'pk': order_id}),
            {'pin': '1234', 'reason': 'Second void attempt'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_void_creates_audit_log(self):
        """Voiding should create an audit log with voided_by tracking."""
        from core.models import VoidAuditLog

        order_id = self._create_completed_order()

        self.client.post(
            reverse('order-void', kwargs={'pk': order_id}),
            {'pin': '1234', 'reason': 'Audit test'},
            format='json',
        )

        logs = VoidAuditLog.objects.filter(order_id=order_id)
        self.assertEqual(logs.count(), 1)

        log = logs.first()
        self.assertEqual(log.previous_status, 'COMPLETED')
        self.assertEqual(log.void_reason, 'Audit test')
        self.assertTrue(log.pin_verified)
        self.assertEqual(log.voided_by, self.user)  # The cashier who executed


class AnalyticsTest(TestCase):
    """Tests that analytics exclude voided orders."""

    def setUp(self):
        from django.contrib.auth.hashers import make_password
        from core.models import AdminProfile

        self.user = User.objects.create_user(username='analytics_cashier', password='testpass123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.admin_user = User.objects.create_user(username='analytics_admin', password='adminpass')
        AdminProfile.objects.get_or_create(
            user=self.admin_user,
            defaults={'void_pin': make_password('1234')},
        )

        self.menu_item = MenuItem.objects.create(
            name='Paneer Tikka', standard_rate=Decimal('300.00'),
            category='Starters', is_available=True, is_customizable=False,
        )

    def test_analytics_excludes_voided_orders(self):
        """Revenue totals should not include voided orders."""
        # Create two completed orders
        for _ in range(2):
            res = self.client.post(reverse('order-create-draft'))
            oid = res.data['id']
            self.client.post(
                reverse('order-cart', kwargs={'pk': oid}),
                {'action': 'add', 'menu_item_id': self.menu_item.id, 'quantity': 1},
                format='json',
            )
            self.client.post(
                reverse('order-checkout', kwargs={'pk': oid}),
                {'payment_method': 'CASH', 'cash_tendered': '500.00'},
                format='json',
            )

        # Void the second order
        orders = Order.objects.filter(status='COMPLETED').order_by('-id')
        voided_order_id = orders.first().id
        self.client.post(
            reverse('order-void', kwargs={'pk': voided_order_id}),
            {'pin': '1234', 'reason': 'Analytics test void'},
            format='json',
        )

        # Check analytics
        response = self.client.get(reverse('analytics'))
        self.assertEqual(response.status_code, 200)
        # Only 1 completed order at ₹300 should count
        self.assertEqual(Decimal(response.data['total_revenue']), Decimal('300.00'))
        self.assertEqual(response.data['total_orders'], 1)
        self.assertEqual(response.data['total_voided'], 1)

    def test_analytics_accepts_date_parameter(self):
        """Analytics should accept ?date=YYYY-MM-DD for past-day queries."""
        response = self.client.get(reverse('analytics'), {'date': '2025-01-01'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['date'], '2025-01-01')
        self.assertEqual(response.data['total_orders'], 0)

    def test_analytics_rejects_invalid_date(self):
        """Analytics should reject invalid date formats."""
        response = self.client.get(reverse('analytics'), {'date': 'not-a-date'})
        self.assertEqual(response.status_code, 400)


class UpiLinkTest(TestCase):
    """Tests for UPI deep-link generation."""

    def setUp(self):
        from core.models import StoreConfiguration

        self.user = User.objects.create_user(username='upi_cashier', password='testpass123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        # Configure UPI merchant
        StoreConfiguration.objects.update_or_create(
            pk=1,
            defaults={
                'upi_id': 'hotel@okicici',
                'upi_payee_name': 'Hotel Antigravity',
            },
        )

        self.menu_item = MenuItem.objects.create(
            name='Masala Dosa', standard_rate=Decimal('120.00'),
            category='Breakfast', is_available=True, is_customizable=False,
        )

    def test_upi_link_generated_correctly(self):
        """UPI deep link should contain correct pa, am, tr, and cu params."""
        # Create a draft and add an item
        res = self.client.post(reverse('order-create-draft'))
        order_id = res.data['id']
        self.client.post(
            reverse('order-cart', kwargs={'pk': order_id}),
            {'action': 'add', 'menu_item_id': self.menu_item.id, 'quantity': 2},
            format='json',
        )

        # Get the UPI link
        response = self.client.get(
            reverse('order-upi-link', kwargs={'pk': order_id}),
        )
        self.assertEqual(response.status_code, 200)

        link = response.data['deep_link']
        self.assertIn('upi://pay', link)
        self.assertIn('pa=hotel%40okicici', link)
        self.assertIn('am=240.00', link)
        self.assertIn(f'tr=ORD-{order_id}', link)
        self.assertIn('cu=INR', link)
        self.assertEqual(response.data['transaction_ref'], f'ORD-{order_id}')

    def test_upi_link_fails_without_config(self):
        """UPI link should return 503 if UPI merchant is not configured."""
        from core.models import StoreConfiguration

        # Clear the UPI config
        StoreConfiguration.objects.filter(pk=1).update(upi_id='')

        res = self.client.post(reverse('order-create-draft'))
        order_id = res.data['id']

        response = self.client.get(
            reverse('order-upi-link', kwargs={'pk': order_id}),
        )
        self.assertEqual(response.status_code, 503)


class SettingsTest(TestCase):
    """Tests for the Settings UI API endpoint."""
    def setUp(self):
        from core.models import StoreConfiguration
        self.client = APIClient()
        StoreConfiguration.objects.update_or_create(
            pk=1,
            defaults={
                'upi_id': 'old@bank',
                'upi_payee_name': 'Old Name',
            },
        )

    def test_get_settings(self):
        response = self.client.get(reverse('settings'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['upi_id'], 'old@bank')
        self.assertEqual(response.data['upi_payee_name'], 'Old Name')
        self.assertFalse(response.data['has_admin_pin'])

    def test_post_settings_updates_config(self):
        response = self.client.post(
            reverse('settings'),
            {'upi_id': 'new@bank', 'upi_payee_name': 'New Name'},
            format='json'
        )
        self.assertEqual(response.status_code, 200)
        
        # Verify db update
        from core.models import StoreConfiguration
        config = StoreConfiguration.load()
        self.assertEqual(config.upi_id, 'new@bank')
        self.assertEqual(config.upi_payee_name, 'New Name')

    def test_post_settings_updates_admin_pin(self):
        response = self.client.post(
            reverse('settings'),
            {'admin_pin': '9999'},
            format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['has_admin_pin'])
        
        # Verify db update
        from core.models import AdminProfile
        profile = AdminProfile.objects.first()
        self.assertIsNotNone(profile)
        # Verify hash match
        from django.contrib.auth.hashers import check_password
        self.assertTrue(check_password('9999', profile.void_pin))


class FoodRankingTest(TestCase):
    """Tests for the 24-hour food analytics ranking."""

    def setUp(self):
        self.user = User.objects.create_user(username='ranking_cashier', password='testpass123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.item_a = MenuItem.objects.create(
            name='Biryani', standard_rate=Decimal('250.00'),
            category='Main', is_available=True, is_customizable=False,
        )
        self.item_b = MenuItem.objects.create(
            name='Soup', standard_rate=Decimal('80.00'),
            category='Starters', is_available=True, is_customizable=False,
        )
        self.item_c = MenuItem.objects.create(
            name='Ice Cream', standard_rate=Decimal('60.00'),
            category='Desserts', is_available=True, is_customizable=False,
        )

    def _create_completed_order(self, item, qty):
        res = self.client.post(reverse('order-create-draft'))
        oid = res.data['id']
        self.client.post(
            reverse('order-cart', kwargs={'pk': oid}),
            {'action': 'add', 'menu_item_id': item.id, 'quantity': qty},
            format='json',
        )
        self.client.post(
            reverse('order-checkout', kwargs={'pk': oid}),
            {'payment_method': 'CASH', 'cash_tendered': '5000.00'},
            format='json',
        )

    def test_ranking_includes_zero_sales_items(self):
        """Items with 0 sales should still appear in the ranking."""
        self._create_completed_order(self.item_a, 5)

        response = self.client.get(reverse('food-ranking'))
        self.assertEqual(response.status_code, 200)
        names = [r['name'] for r in response.data]
        self.assertIn('Biryani', names)
        self.assertIn('Soup', names)
        self.assertIn('Ice Cream', names)
        self.assertEqual(response.data[0]['name'], 'Biryani')
        self.assertEqual(response.data[0]['total_qty'], 5)

    def test_ranking_handles_ties(self):
        """Items with same quantity should be ordered alphabetically."""
        self._create_completed_order(self.item_a, 3)
        self._create_completed_order(self.item_b, 3)

        response = self.client.get(reverse('food-ranking'))
        self.assertEqual(response.status_code, 200)
        tied = [r for r in response.data if r['total_qty'] == 3]
        self.assertEqual(tied[0]['name'], 'Biryani')
        self.assertEqual(tied[1]['name'], 'Soup')


class EODSettlementTest(TestCase):
    """Tests for End-of-Day Settlement logic."""

    def setUp(self):
        self.user = User.objects.create_user(username='settlement_cashier', password='testpass123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.menu_item = MenuItem.objects.create(
            name='Chai', standard_rate=Decimal('30.00'),
            category='Beverages', is_available=True, is_customizable=False,
        )
        from django.contrib.auth.hashers import make_password
        profile, _ = AdminProfile.objects.get_or_create(
            user=self.user,
            defaults={'void_pin': make_password('1234')},
        )
        if not _:
            profile.void_pin = make_password('1234')
            profile.save()

    def _create_completed_order(self, payment_method='CASH', qty=1):
        res = self.client.post(reverse('order-create-draft'))
        oid = res.data['id']
        self.client.post(
            reverse('order-cart', kwargs={'pk': oid}),
            {'action': 'add', 'menu_item_id': self.menu_item.id, 'quantity': qty},
            format='json',
        )
        tender = {'payment_method': payment_method}
        if payment_method == 'CASH':
            tender['cash_tendered'] = '5000.00'
        self.client.post(
            reverse('order-checkout', kwargs={'pk': oid}),
            tender, format='json',
        )
        return oid

    def test_settlement_creates_record_with_correct_discrepancy(self):
        """Settlement should compute correct discrepancy from physical - system cash."""
        self._create_completed_order('CASH', qty=2)
        self._create_completed_order('UPI', qty=1)

        response = self.client.post(
            reverse('settlement-list'),
            {'physical_cash_counted': '50.00', 'notes': 'Test shift'},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Decimal(response.data['system_cash_total']), Decimal('60.00'))
        self.assertEqual(Decimal(response.data['system_upi_total']), Decimal('30.00'))
        self.assertEqual(Decimal(response.data['discrepancy']), Decimal('-10.00'))

    def test_settlement_locks_orders(self):
        """Orders should be locked after settlement."""
        oid = self._create_completed_order('CASH', qty=1)

        self.client.post(
            reverse('settlement-list'),
            {'physical_cash_counted': '30.00'},
            format='json',
        )

        response = self.client.post(
            reverse('order-void', kwargs={'pk': oid}),
            {'pin': '1234', 'reason': 'Test void after settlement'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_double_settlement_rejected(self):
        """Settling when no unsettled orders exist should fail."""
        self._create_completed_order('CASH', qty=1)

        self.client.post(
            reverse('settlement-list'),
            {'physical_cash_counted': '30.00'},
            format='json',
        )

        response = self.client.post(
            reverse('settlement-list'),
            {'physical_cash_counted': '0.00'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_settlement_pdf_download(self):
        """PDF endpoint should return a valid PDF response."""
        self._create_completed_order('CASH', qty=1)

        res = self.client.post(
            reverse('settlement-list'),
            {'physical_cash_counted': '30.00'},
            format='json',
        )
        settlement_id = res.data['id']

        response = self.client.get(
            reverse('settlement-download-pdf', kwargs={'pk': settlement_id}),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')


class MenuCRUDTest(TestCase):
    """
    Tests for Menu Item CRUD operations, availability toggling,
    category filtering, and input validation.
    """

    def setUp(self):
        self.user = User.objects.create_user(username='menu_cashier', password='testpass123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.item_a = MenuItem.objects.create(
            name='Masala Dosa', standard_rate=Decimal('120.00'),
            category='Breakfast', is_available=True, is_customizable=False,
        )
        self.item_b = MenuItem.objects.create(
            name='Idli Sambar', standard_rate=Decimal('80.00'),
            category='Breakfast', is_available=True, is_customizable=False,
        )
        self.item_c = MenuItem.objects.create(
            name='Paneer Butter Masala', standard_rate=Decimal('280.00'),
            category='Main Course', is_available=True, is_customizable=True,
        )

    # ── CREATE ────────────────────────────────────────────────────────────

    def test_create_menu_item(self):
        """POST to create a new menu item should succeed with 201."""
        response = self.client.post(
            reverse('menuitem-list'),
            {
                'name': 'Veg Biryani',
                'standard_rate': '200.00',
                'category': 'Main Course',
                'is_available': True,
                'is_customizable': False,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['name'], 'Veg Biryani')
        self.assertEqual(Decimal(response.data['standard_rate']), Decimal('200.00'))
        self.assertTrue(MenuItem.objects.filter(name='Veg Biryani').exists())

    def test_create_menu_item_duplicate_name_rejected(self):
        """Creating a menu item with a name that already exists should fail."""
        response = self.client.post(
            reverse('menuitem-list'),
            {
                'name': 'Masala Dosa',  # already exists
                'standard_rate': '150.00',
                'category': 'Breakfast',
            },
            format='json',
        )
        self.assertIn(response.status_code, [400, 409])

    def test_create_menu_item_negative_rate_rejected(self):
        """Menu item with a negative standard_rate should be rejected."""
        response = self.client.post(
            reverse('menuitem-list'),
            {
                'name': 'Bad Item',
                'standard_rate': '-50.00',
                'category': 'Test',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_create_menu_item_zero_rate_rejected(self):
        """Menu item with zero standard_rate should be rejected."""
        response = self.client.post(
            reverse('menuitem-list'),
            {
                'name': 'Free Item',
                'standard_rate': '0.00',
                'category': 'Test',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    # ── READ ──────────────────────────────────────────────────────────────

    def test_list_menu_items(self):
        """GET should return all menu items."""
        response = self.client.get(reverse('menuitem-list'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 3)

    def test_retrieve_single_menu_item(self):
        """GET with pk should return a single item."""
        response = self.client.get(
            reverse('menuitem-detail', kwargs={'pk': self.item_a.pk}),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['name'], 'Masala Dosa')
        self.assertEqual(Decimal(response.data['standard_rate']), Decimal('120.00'))

    def test_filter_by_category(self):
        """GET with ?category= should return only items in that category."""
        response = self.client.get(
            reverse('menuitem-list'),
            {'category': 'Breakfast'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        names = {item['name'] for item in response.data}
        self.assertEqual(names, {'Masala Dosa', 'Idli Sambar'})

    def test_filter_by_category_no_results(self):
        """GET with a non-existent category should return an empty list."""
        response = self.client.get(
            reverse('menuitem-list'),
            {'category': 'NonExistentCategory'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

    # ── UPDATE ────────────────────────────────────────────────────────────

    def test_update_menu_item_put(self):
        """PUT should fully update a menu item."""
        response = self.client.put(
            reverse('menuitem-detail', kwargs={'pk': self.item_a.pk}),
            {
                'name': 'Masala Dosa',
                'standard_rate': '140.00',
                'category': 'Breakfast',
                'is_available': True,
                'is_customizable': False,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.item_a.refresh_from_db()
        self.assertEqual(self.item_a.standard_rate, Decimal('140.00'))

    def test_partial_update_menu_item_patch(self):
        """PATCH should partially update a menu item."""
        response = self.client.patch(
            reverse('menuitem-detail', kwargs={'pk': self.item_b.pk}),
            {'standard_rate': '90.00'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.item_b.refresh_from_db()
        self.assertEqual(self.item_b.standard_rate, Decimal('90.00'))

    # ── TOGGLE AVAILABILITY ───────────────────────────────────────────────

    def test_toggle_availability_on_to_off(self):
        """PATCH toggle-availability should flip is_available from True to False."""
        self.assertTrue(self.item_a.is_available)

        response = self.client.patch(
            reverse('menuitem-toggle-availability', kwargs={'pk': self.item_a.pk}),
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['is_available'])

        self.item_a.refresh_from_db()
        self.assertFalse(self.item_a.is_available)

    def test_toggle_availability_off_to_on(self):
        """PATCH toggle-availability should flip is_available from False to True."""
        self.item_a.is_available = False
        self.item_a.save()

        response = self.client.patch(
            reverse('menuitem-toggle-availability', kwargs={'pk': self.item_a.pk}),
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['is_available'])

        self.item_a.refresh_from_db()
        self.assertTrue(self.item_a.is_available)

    def test_toggle_availability_double_toggle(self):
        """Toggling twice should return to the original state."""
        original_state = self.item_a.is_available

        self.client.patch(
            reverse('menuitem-toggle-availability', kwargs={'pk': self.item_a.pk}),
        )
        self.client.patch(
            reverse('menuitem-toggle-availability', kwargs={'pk': self.item_a.pk}),
        )

        self.item_a.refresh_from_db()
        self.assertEqual(self.item_a.is_available, original_state)

    # ── DELETE ────────────────────────────────────────────────────────────

    def test_delete_menu_item(self):
        """DELETE should remove a menu item (no orders referencing it)."""
        response = self.client.delete(
            reverse('menuitem-detail', kwargs={'pk': self.item_b.pk}),
        )
        self.assertEqual(response.status_code, 204)
        self.assertFalse(MenuItem.objects.filter(pk=self.item_b.pk).exists())

    def test_delete_menu_item_with_orders_protected(self):
        """DELETE should fail for items referenced by OrderItems (PROTECT)."""
        from django.db.models.deletion import ProtectedError

        # Create an order referencing item_a
        res = self.client.post(reverse('order-create-draft'))
        order_id = res.data['id']
        self.client.post(
            reverse('order-cart', kwargs={'pk': order_id}),
            {'action': 'add', 'menu_item_id': self.item_a.id, 'quantity': 1},
            format='json',
        )

        # Attempt to delete the referenced item — should raise ProtectedError
        with self.assertRaises(ProtectedError):
            self.client.delete(
                reverse('menuitem-detail', kwargs={'pk': self.item_a.pk}),
            )

        # Item should still exist in the database
        self.assertTrue(MenuItem.objects.filter(pk=self.item_a.pk).exists())

    def test_retrieve_nonexistent_item_returns_404(self):
        """GET for a non-existent pk should return 404."""
        response = self.client.get(
            reverse('menuitem-detail', kwargs={'pk': 99999}),
        )
        self.assertEqual(response.status_code, 404)
