from django.core.management.base import BaseCommand
from django.contrib.auth.models import User

class Command(BaseCommand):
    help = 'Creates a default superuser if none exists'

    def handle(self, *args, **options):
        if not User.objects.filter(username='admin').exists():
            User.objects.create_superuser('admin', 'admin@hotel.com', 'admin123')
            self.stdout.write(self.style.SUCCESS('Successfully created default superuser "admin" with password "admin123"'))
        else:
            self.stdout.write(self.style.WARNING('Superuser "admin" already exists'))
