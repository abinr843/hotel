from decimal import Decimal, InvalidOperation
from hotel.custom_exceptions import InvalidRateError


def validate_positive_rate(value):
    """
    Validates that a rate value is:
    - A valid decimal number
    - Strictly positive (> 0)
    - Has at most 2 decimal places (₹ precision)
    """
    try:
        rate = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise InvalidRateError("Rate must be a valid decimal number.")

    if rate <= 0:
        raise InvalidRateError("Rate must be a positive value greater than zero.")

    # Check decimal precision: the exponent of a Decimal like 10.50 is -2
    if rate.as_tuple().exponent < -2:
        raise InvalidRateError("Rate must have at most 2 decimal places (₹ precision).")

    return rate
