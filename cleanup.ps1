# Safe Docker cleanup and rebuild script
Write-Host "Stopping and removing containers..."
docker-compose down

Write-Host "Cleaning up Docker system (images, containers, networks)..."
docker system prune -f

Write-Host "Building and starting services..."
docker-compose up --build -d

Write-Host "Checking service status..."
docker-compose ps
