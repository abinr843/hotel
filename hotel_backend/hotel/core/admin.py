from django.contrib import admin
from .models import MenuItem, EODSettlement, Order, OrderItem, AdminProfile, VoidAuditLog, StoreConfiguration

@admin.register(AdminProfile)
class AdminProfileAdmin(admin.ModelAdmin):
    list_display = ('user',)


@admin.register(MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = ('name', 'standard_rate', 'category', 'is_available', 'is_customizable')
    list_filter = ('category', 'is_available')
    search_fields = ('name',)


@admin.register(EODSettlement)
class EODSettlementAdmin(admin.ModelAdmin):
    list_display = ('shift_date', 'opened_at', 'closed_at', 'system_cash_total', 'discrepancy')
    list_filter = ('shift_date',)
    search_fields = ('notes',)


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 1


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'status', 'total_amount', 'payment_method', 'created_at', 'shift')
    list_filter = ('status', 'payment_method', 'created_at')
    search_fields = ('id',)
    inlines = [OrderItemInline]


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ('order', 'menu_item', 'quantity', 'snapshot_rate')
    list_filter = ('menu_item',)


@admin.register(VoidAuditLog)
class VoidAuditLogAdmin(admin.ModelAdmin):
    list_display = ('id', 'order', 'previous_status', 'void_reason', 'voided_by', 'timestamp')
    list_filter = ('timestamp',)
    readonly_fields = ('order', 'previous_status', 'void_reason', 'pin_verified', 'voided_by', 'timestamp')


@admin.register(StoreConfiguration)
class StoreConfigurationAdmin(admin.ModelAdmin):
    list_display = ('upi_id', 'upi_payee_name')

    def has_add_permission(self, request):
        # Only allow adding if no config exists yet
        return not StoreConfiguration.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
