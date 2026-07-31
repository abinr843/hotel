from django.db import models
from django.contrib.auth.models import User

class AdminProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    void_pin = models.CharField(max_length=128)  # Will store the hashed PIN

    def __str__(self):
        return f"{self.user.username} Profile"
class MenuItem(models.Model):
    name = models.CharField(max_length=255, unique=True)
    standard_rate = models.DecimalField(max_digits=10, decimal_places=2)
    category = models.CharField(max_length=100, db_index=True)
    is_available = models.BooleanField(default=True)
    is_customizable = models.BooleanField(default=False)

    def __str__(self):
        return self.name


class EODSettlement(models.Model):
    shift_date = models.DateField(unique=True)
    system_cash_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    system_upi_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    physical_cash_counted = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    discrepancy = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"Shift on {self.shift_date}"


class Order(models.Model):
    class StatusChoices(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        COMPLETED = 'COMPLETED', 'Completed'
        CANCELLED_VOIDED = 'CANCELLED-VOIDED', 'Cancelled/Voided'

    status = models.CharField(
        max_length=20,
        choices=StatusChoices.choices,
        default=StatusChoices.DRAFT
    )
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    # Split payment amounts — sum must equal total_amount at checkout
    cash_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    upi_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    card_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    cash_tendered = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    change_due = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # Optional table identifier (e.g. "T5", "Table 12", "Parcel")
    table_number = models.CharField(max_length=20, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(null=True, blank=True)

    shift = models.ForeignKey(
        EODSettlement,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='orders'
    )

    def __str__(self):
        table_str = f" (Table {self.table_number})" if self.table_number else ""
        return f"Order #{self.id}{table_str} - {self.status}"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    menu_item = models.ForeignKey(MenuItem, on_delete=models.PROTECT, related_name='order_items')
    snapshot_rate = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField(default=1)
    special_instructions = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"{self.quantity} x {self.menu_item.name}"


class VoidAuditLog(models.Model):
    """
    Immutable audit trail for every order void.
    Records who voided it (voided_by), the order state before void,
    and confirmation that the PIN check passed.
    """
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='void_logs')
    previous_status = models.CharField(max_length=20)
    void_reason = models.TextField()
    pin_verified = models.BooleanField(default=True)
    voided_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='void_actions',
        help_text='The user account that was logged in when the void was executed.',
    )
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"Void #{self.id} — Order #{self.order_id} at {self.timestamp}"


class StoreConfiguration(models.Model):
    """
    Singleton configuration for the hotel/store.
    Stores admin-editable settings like UPI merchant details.
    Only one row should ever exist — enforced via save() override.
    """
    upi_id = models.CharField(
        max_length=100,
        help_text='UPI Virtual Payment Address (VPA), e.g. merchant@okicici',
    )
    upi_payee_name = models.CharField(
        max_length=200,
        help_text='Payee name that appears on the customer\'s UPI app',
    )

    class Meta:
        verbose_name = 'Store Configuration'
        verbose_name_plural = 'Store Configuration'

    def save(self, *args, **kwargs):
        # Enforce singleton: always use pk=1
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        pass  # Prevent deletion

    @classmethod
    def load(cls):
        """Load the singleton instance, creating a default if none exists."""
        obj, _ = cls.objects.get_or_create(
            pk=1,
            defaults={'upi_id': '', 'upi_payee_name': ''},
        )
        return obj

    def __str__(self):
        return f"Store Config — UPI: {self.upi_id}"
