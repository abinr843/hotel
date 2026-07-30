"""
URL configuration for hotel project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from rest_framework.throttling import ScopedRateThrottle


# ---------------------------------------------------------------------------
# Throttled Login View
# ---------------------------------------------------------------------------
class ThrottledTokenObtainPairView(TokenObtainPairView):
    """
    JWT login endpoint with a dedicated rate-limit scope.
    Prevents brute-forcing of cashier credentials.
    """
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login_attempt'


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('core.urls')),
    path('api/auth/login/', ThrottledTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    re_path(r'^(?!api/|admin/).*$', TemplateView.as_view(template_name='index.html')),
]

# ---------------------------------------------------------------------------
# API Documentation (DEBUG only)
# ---------------------------------------------------------------------------
if settings.DEBUG:
    from drf_spectacular.views import (
        SpectacularAPIView,
        SpectacularSwaggerView,
    )
    urlpatterns += [
        path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
        path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    ]
