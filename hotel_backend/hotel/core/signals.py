from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password
from .models import AdminProfile

@receiver(post_save, sender=User)
def create_or_update_user_profile(sender, instance, created, **kwargs):
    if created:
        # Default pin 1234 hashed
        AdminProfile.objects.create(user=instance, void_pin=make_password('1234'))
    else:
        # Save profile if it exists, but use getattr to be safe if it doesn't exist
        if hasattr(instance, 'profile'):
            instance.profile.save()
