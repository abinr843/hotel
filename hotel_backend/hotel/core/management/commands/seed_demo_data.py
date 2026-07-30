from decimal import Decimal
import random
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth.models import User
from core.models import (
    MenuItem, EODSettlement, Order, OrderItem,
    VoidAuditLog, StoreConfiguration, AdminProfile
)

class Command(BaseCommand):
    help = 'Seeds the database with a realistic demo dataset (menu, past orders, config).'

    def add_arguments(self, parser):
        parser.add_argument('--noinput', action='store_true', help='Tells Django to NOT prompt the user for input of any kind.')

    def handle(self, *args, **kwargs):
        no_input = kwargs['noinput']
        if not no_input:
            self.stdout.write(self.style.WARNING("WARNING: This will wipe all existing Orders, Settlements, and Menu Items."))
            confirm = input("Are you sure you want to proceed? (yes/no): ")
            if confirm.lower() != 'yes':
                self.stdout.write(self.style.ERROR("Aborted."))
                return

        self.stdout.write("Wiping existing data...")
        Order.objects.all().delete()
        EODSettlement.objects.all().delete()
        MenuItem.objects.all().delete()

        # 1. Store Config
        self.stdout.write("Seeding Store Configuration...")
        config = StoreConfiguration.load()
        config.upi_id = "hotel@upi"
        config.upi_payee_name = "Grand Hotel POS"
        config.save()

        # 2. Admin User
        self.stdout.write("Ensuring admin user exists...")
        user, created = User.objects.get_or_create(username='admin')
        if created:
            user.set_password('admin')
            user.is_superuser = True
            user.is_staff = True
            user.save()
        
        from django.contrib.auth.hashers import make_password
        profile, _ = AdminProfile.objects.get_or_create(user=user)
        profile.void_pin = make_password('1234')
        profile.save()

        # 3. Menu Items
        self.stdout.write("Seeding Menu Items...")
        menu_data = [
            # Mains
            {"name": "Butter Chicken", "rate": "350.00", "cat": "Mains", "custom": True},
            {"name": "Paneer Tikka Masala", "rate": "280.00", "cat": "Mains", "custom": True},
            {"name": "Dal Makhani", "rate": "220.00", "cat": "Mains", "custom": False},
            {"name": "Mutton Biryani", "rate": "450.00", "cat": "Mains", "custom": False},
            {"name": "Veg Fried Rice", "rate": "180.00", "cat": "Mains", "custom": True},
            
            # Breakfast
            {"name": "Masala Dosa", "rate": "120.00", "cat": "Breakfast", "custom": True},
            {"name": "Idli Sambar", "rate": "80.00", "cat": "Breakfast", "custom": False},
            {"name": "Puri Bhaji", "rate": "100.00", "cat": "Breakfast", "custom": False},
            
            # Starters
            {"name": "Chicken 65", "rate": "250.00", "cat": "Starters", "custom": False},
            {"name": "Gobi Manchurian", "rate": "180.00", "cat": "Starters", "custom": True},
            {"name": "French Fries", "rate": "110.00", "cat": "Starters", "custom": True},
            
            # Beverages
            {"name": "Filter Coffee", "rate": "50.00", "cat": "Beverages", "custom": True},
            {"name": "Masala Chai", "rate": "40.00", "cat": "Beverages", "custom": True},
            {"name": "Fresh Lime Soda", "rate": "70.00", "cat": "Beverages", "custom": False},
            {"name": "Sweet Lassi", "rate": "90.00", "cat": "Beverages", "custom": False},
        ]

        menu_items = []
        for item in menu_data:
            mi = MenuItem.objects.create(
                name=item["name"],
                standard_rate=item["rate"],
                category=item["cat"],
                is_available=True,
                is_customizable=item["custom"]
            )
            menu_items.append(mi)

        # 4. Historical Orders (Last 3 days + Today)
        self.stdout.write("Seeding Historical Orders...")
        now = timezone.now()
        
        for days_ago in range(3, -1, -1):
            date = (now - timedelta(days=days_ago)).date()
            
            # Open settlement
            opened_at = timezone.make_aware(timezone.datetime.combine(date, timezone.datetime.min.time())) + timedelta(hours=8) # 8 AM
            settlement = EODSettlement.objects.create(
                shift_date=date,
                opened_at=opened_at
            )
            
            # Generate 10-25 orders for the day
            num_orders = random.randint(10, 25)
            shift_cash = 0
            shift_upi = 0
            
            for _ in range(num_orders):
                order_time = opened_at + timedelta(minutes=random.randint(10, 600))
                
                # Order status
                status = Order.StatusChoices.COMPLETED
                is_voided = random.random() < 0.05 # 5% chance of being voided
                if is_voided:
                    status = Order.StatusChoices.CANCELLED_VOIDED

                order = Order.objects.create(
                    status=status,
                    payment_method=random.choice([Order.PaymentMethodChoices.CASH, Order.PaymentMethodChoices.UPI]) if not is_voided else None,
                    shift=settlement,
                )
                
                # Force created_at to past date
                order.created_at = order_time
                order.save(update_fields=['created_at'])

                # Add 1-4 items
                num_items = random.randint(1, 4)
                order_total = Decimal('0.00')
                for _ in range(num_items):
                    mi = random.choice(menu_items)
                    qty = random.randint(1, 3)
                    
                    # Sometimes customize
                    custom_rate = Decimal(str(mi.standard_rate))
                    instructions = ""
                    if mi.is_customizable and random.random() < 0.2:
                        instructions = "Extra spicy" if random.random() < 0.5 else "Less salt"
                    
                    OrderItem.objects.create(
                        order=order,
                        menu_item=mi,
                        snapshot_rate=custom_rate,
                        quantity=qty,
                        special_instructions=instructions
                    )
                    order_total += custom_rate * qty

                order.total_amount = order_total
                
                if status == Order.StatusChoices.COMPLETED:
                    if order.payment_method == Order.PaymentMethodChoices.CASH:
                        order.cash_tendered = order_total + random.choice([0, 50, 100])
                        order.change_due = order.cash_tendered - order_total
                        shift_cash += order_total
                    else:
                        shift_upi += order_total
                    order.save()
                
                elif status == Order.StatusChoices.CANCELLED_VOIDED:
                    order.voided_at = order_time + timedelta(minutes=random.randint(5, 30))
                    order.void_reason = "Customer left"
                    order.save(update_fields=['voided_at', 'void_reason'])
                    
                    VoidAuditLog.objects.create(
                        order=order,
                        previous_status=Order.StatusChoices.DRAFT,
                        void_reason=order.void_reason,
                        pin_verified=True,
                        voided_by=user,
                        timestamp=order.voided_at
                    )
            
            # Close settlement if it's not today
            if days_ago > 0:
                closed_at = opened_at + timedelta(hours=14) # 10 PM
                settlement.closed_at = closed_at
                settlement.system_cash_total = shift_cash
                settlement.system_upi_total = shift_upi
                settlement.physical_cash_counted = shift_cash + random.choice([-50, 0, 0, 0, 10]) # Small discrepancy sometimes
                settlement.discrepancy = settlement.physical_cash_counted - shift_cash
                settlement.notes = "All good" if settlement.discrepancy == 0 else "Minor discrepancy in cash drawer"
                settlement.save()
            else:
                # For today, update live totals
                settlement.system_cash_total = shift_cash
                settlement.system_upi_total = shift_upi
                settlement.save()

        self.stdout.write(self.style.SUCCESS('Successfully seeded demo data!'))
