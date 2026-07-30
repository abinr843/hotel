from rest_framework.views import exception_handler
from rest_framework.exceptions import APIException
from rest_framework import status


# ---------------------------------------------------------------------------
# Custom DRF Exception Handler
# ---------------------------------------------------------------------------

def custom_exception_handler(exc, context):
    """
    Wraps the default DRF exception handler to return a consistent
    JSON envelope for every error response:

    {
        "error": true,
        "status_code": 400,
        "message": "Human-readable summary",
        "details": { ... }   # field-level errors when applicable
    }
    """
    response = exception_handler(exc, context)

    if response is not None:
        # Build a uniform error payload
        error_payload = {
            "error": True,
            "status_code": response.status_code,
            "message": str(exc.detail) if hasattr(exc, 'detail') and isinstance(exc.detail, str) else _get_message(response.status_code),
            "details": response.data,
        }
        response.data = error_payload

    return response


def _get_message(status_code):
    """Return a human-readable message for common HTTP error codes."""
    messages = {
        400: "Bad request – check the details for field-level errors.",
        401: "Authentication credentials were not provided or are invalid.",
        403: "You do not have permission to perform this action.",
        404: "The requested resource was not found.",
        405: "HTTP method not allowed on this endpoint.",
        429: "Too many requests – please slow down.",
    }
    return messages.get(status_code, "An unexpected error occurred.")


# ---------------------------------------------------------------------------
# Custom Exception Classes
# ---------------------------------------------------------------------------

class InvalidRateError(APIException):
    """Raised when a monetary rate value fails validation."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "The rate value is invalid."
    default_code = "invalid_rate"


class ItemNotCustomizableError(APIException):
    """Raised when special instructions or a rate override are provided
    for a menu item that is not marked as customizable."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "This menu item is not customizable. Rate overrides and special instructions are not allowed."
    default_code = "item_not_customizable"


class MenuItemUnavailableError(APIException):
    """Raised when an operation targets a menu item that is currently
    marked as unavailable (sold out)."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "This menu item is currently unavailable."
    default_code = "menu_item_unavailable"


class InvalidPinError(APIException):
    """Raised when the void-confirmation PIN does not match."""
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = "The Manager Cancel PIN is incorrect."
    default_code = "invalid_pin"


class OrderNotVoidableError(APIException):
    """Raised when attempting to void an order that is not in a voidable state."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "This order cannot be cancelled in its current state."
    default_code = "order_not_voidable"


class DuplicateMenuItemError(APIException):
    """Raised when attempting to create a menu item with a name that already exists."""
    status_code = status.HTTP_409_CONFLICT
    default_detail = "A menu item with this name already exists."
    default_code = "duplicate_menu_item"


class OrderNotEditableError(APIException):
    """Raised when attempting to modify an order that is not in DRAFT status."""
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Only DRAFT orders can be edited. This order is finalized."
    default_code = "order_not_editable"


class EmptyOrderError(APIException):
    """Raised when attempting to finalize an order that has no items."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Cannot finalize an order with no items."
    default_code = "empty_order"


class UpiNotConfiguredError(APIException):
    """Raised when UPI payment is attempted but the merchant VPA is not configured."""
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "UPI payments are not available. The merchant UPI ID has not been configured."
    default_code = "upi_not_configured"


class OrderLockedError(APIException):
    """Raised when attempting to modify an order that belongs to a settled shift."""
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = "This order belongs to a closed shift and can no longer be modified."
    default_code = "order_locked"


class ShiftAlreadySettledError(APIException):
    """Raised when attempting to settle but no unsettled orders exist."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "There are no new orders to close. This shift may have already been closed."
    default_code = "shift_already_settled"
