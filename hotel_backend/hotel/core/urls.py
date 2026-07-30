from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    health_check_view, MenuItemViewSet, OrderViewSet,
    VoidAuditLogViewSet, analytics_view, settings_view,
    food_ranking_view, EODSettlementViewSet,
    setup_status_view, setup_view,
)

router = DefaultRouter()
router.register(r'menu-items', MenuItemViewSet, basename='menuitem')
router.register(r'orders', OrderViewSet, basename='order')
router.register(r'void-logs', VoidAuditLogViewSet, basename='voidauditlog')
router.register(r'settlements', EODSettlementViewSet, basename='settlement')

urlpatterns = [
    path('health/', health_check_view, name='health_check'),
    path('analytics/', analytics_view, name='analytics'),
    path('analytics/food-ranking/', food_ranking_view, name='food-ranking'),
    path('settings/', settings_view, name='settings'),
    path('setup-status/', setup_status_view, name='setup-status'),
    path('setup/', setup_view, name='setup'),
    path('', include(router.urls)),
]
